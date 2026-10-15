import os
import ssl
import traceback
from typing import List, Optional

import pika
import logging
import json
import sys
import threading
import time
import multiprocessing as mp

from rmsql import SQLAlchemyIngestDB
from connection_resolver import WorkerConnectionResolver
from purge import ProjectPurger, find_resumable_deletions, is_project_deleting
from flask import Flask, jsonify


app = Flask(__name__)

PREFETCH_COUNT = int(os.getenv('RABBITMQ_PREFETCH_COUNT', '1'))  # messages
MAX_JOB_RETRIES = int(os.getenv('MAX_JOB_RETRIES', '10'))  # messages

worker_thread: threading.Thread | None = None
worker_running = threading.Event()
delete_thread: threading.Thread | None = None

DELETE_MAX_ATTEMPTS = int(os.getenv('DELETE_MAX_ATTEMPTS', '3'))
DELETE_RETRY_BACKOFF = int(os.getenv('DELETE_RETRY_BACKOFF_SECONDS', '30'))  # x attempt number


logging.getLogger('pika').setLevel(logging.WARNING)

INGEST_TIMEOUT = int(os.getenv('INGEST_SUBPROCESS_TIMEOUT', '300'))  # seconds; per-doc OCR watchdog cap


def _ingest_child(job_id, inputs):
    """Runs in a spawned subprocess: fresh Ingest() (no inherited fds/threads), do the work.

    Connections are re-resolved here rather than passed in: a ResolvedConnections holds
    live SQLAlchemy engines / Qdrant / boto3 clients, none of which survive pickling
    across the spawn boundary.
    """
    try:
        from ingest import Ingest as _Ingest
        from rmsql import SQLAlchemyIngestDB as _SQLAlchemyIngestDB
        from connection_resolver import WorkerConnectionResolver as _Resolver

        resolved = _Resolver(_SQLAlchemyIngestDB()).resolve(inputs.get('course_name', ''))
        _Ingest().main_ingest(job_id=job_id, _resolved_connections=resolved, **inputs)
        sys.exit(0)
    except Exception:
        logging.error("Ingest child exception:\n%s", traceback.format_exc())
        sys.exit(3)


def run_ingest_isolated(job_id, inputs):
    """Run main_ingest in a spawned child with a hard timeout so a hung/huge OCR can't block the
    consumer thread (RabbitMQ heartbeats) or the Flask ALB health check, and a native segfault in
    the OCR libs kills only the child. Returns None on clean completion, else an error string."""
    ctx = mp.get_context('spawn')  # spawn, NOT fork: worker is multithreaded (Flask) -> fork can deadlock
    p = ctx.Process(target=_ingest_child, args=(job_id, inputs))
    p.start()
    p.join(INGEST_TIMEOUT)
    if p.is_alive():
        p.kill()
        p.join(10)
        return (f"OCR/ingest exceeded {INGEST_TIMEOUT}s limit and was killed "
                f"(likely a very large/complex PDF OCR).")
    if p.exitcode is not None and p.exitcode < 0:
        return (f"OCR/ingest subprocess crashed: killed by signal {-p.exitcode} "
                f"(e.g. segfault in the PDF/OCR native libraries).")
    if p.exitcode not in (0, None):
        return f"OCR/ingest subprocess exited abnormally (exit {p.exitcode}); see worker logs."
    return None


class Worker:

    def __init__(self):
        self.consumer = None
        self.rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
        self.rabbitmq_ssl = os.getenv('RABBITMQ_SSL', False)
        self.rabbitmq_queue = os.getenv('RABBITMQ_QUEUE', 'uiuc-chat')
        self.connection: pika.BlockingConnection | None = None
        self.channel: pika.adapters.blocking_connection.BlockingChannel | None = None
        self.connect()

        self.sql_session = SQLAlchemyIngestDB()
        self.resolver = WorkerConnectionResolver(self.sql_session)

    # Intended usage is "with Queue() as queue:"
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.channel.close()
        self.connection.close()

    def connect(self):
        parameters = pika.URLParameters(self.rabbitmq_url)
        # Keep the connection alive across the long (up to INGEST_TIMEOUT) subprocess wait so
        # RabbitMQ doesn't drop us mid-OCR and redeliver the message (which the redelivery guard
        # would then mislabel as "worker crashed").
        parameters.heartbeat = max(900, INGEST_TIMEOUT * 3)
        if self.rabbitmq_ssl:
            # Necessary for AWS AmazonMQ
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
            ssl_context.set_ciphers('ECDHE+AESGCM:!ECDSA')
            parameters.ssl_options = pika.SSLOptions(context=ssl_context)
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()
        self.channel.queue_declare(queue=self.rabbitmq_queue, durable=True)
        self.channel.basic_qos(prefetch_count=PREFETCH_COUNT)

    def close(self):
        try:
            if self.channel and self.channel.is_open:
                self.channel.stop_consuming(self.consumer)
                self.channel.close()
        except Exception:
            pass
        try:
            if self.connection and self.connection.is_open:
                self.connection.close()
        except Exception:
            pass

        self.channel = None
        self.connection = None

    def is_connected(self) -> bool:
        return (
                self.connection is not None
                and self.connection.is_open
                and self.channel is not None
                and self.channel.is_open
        )

    def process_job(self, channel, method, header, body):
        content = json.loads(body.decode())
        job_id = content['job_id']
        logging.info("----------------------------------------")
        logging.info("--------------Incoming job--------------")
        logging.info("----------------------------------------")
        inputs = content['inputs']
        logging.info(inputs)

        retry_count = content['retry_count'] if 'retry_count' in content else 0

        try:
            # Resolve the project's connections once. Ingest status tables live
            # on the project documents DB (external when configured, else host) --
            # the same DB the producer inserted this job's in-progress row into
            # and the frontend reads from. self.sql_session stays host-bound for
            # the resolver's project_external_connections lookup.
            course_name = inputs.get('course_name', '')
            resolved = self.resolver.resolve(course_name)
            status_db = (
                SQLAlchemyIngestDB(engine=resolved.documents_sql_engine)
                if resolved.documents_sql_engine else self.sql_session
            )

            # A job queued before its project was deleted must not write
            # documents back behind the purge.
            if is_project_deleting(self.sql_session.engine, course_name):
                logging.info(f"Dropping job {job_id}: project {course_name!r} is being deleted")
                status_db.delete_document_in_progress(job_id)
                channel.basic_ack(delivery_tag=method.delivery_tag)
                return

            # flag this message as "processing started" so we can ack it later if memory runs out

            prog_doc = status_db.fetch_document_in_progress(job_id)
            if not prog_doc:
                logging.error(f"Job ID {job_id} not found in DocumentsInProgress table.")
                channel.basic_ack(delivery_tag=method.delivery_tag)
            else:
                if "error" in prog_doc and prog_doc["error"] == 'Attempting ingest':
                    status_db.insert_failed_document({
                        "s3_path": str(prog_doc["s3_path"]),
                        "readable_filename": prog_doc["readable_filename"],
                        "course_name": prog_doc["course_name"],
                        "url": prog_doc["url"],
                        "base_url": prog_doc["base_url"],
                        "doc_groups": prog_doc["doc_groups"],
                        "error": "Ingest could not resolve successfully, worker crashed (e.g. ran out of memory)",
                    })
                    status_db.delete_document_in_progress(job_id)
                    channel.basic_ack(delivery_tag=method.delivery_tag)
                else:
                    prog_doc["error"] = 'Attempting ingest'
                    status_db.update_document_in_progress(prog_doc)

                    # Run ingest (incl. OCR) in an isolated, time-boxed subprocess so a hung/huge
                    # OCR can't block RabbitMQ heartbeats or the ALB health check, and a native
                    # segfault kills only the child. On timeout/crash: record a clear failure and
                    # ack (no requeue -> no redelivery-guard mislabel).
                    failure = run_ingest_isolated(job_id, inputs)
                    if failure is not None:
                        status_db.insert_failed_document({
                            "s3_path": str(prog_doc["s3_path"]),
                            "readable_filename": prog_doc["readable_filename"],
                            "course_name": prog_doc["course_name"],
                            "url": prog_doc["url"],
                            "base_url": prog_doc["base_url"],
                            "doc_groups": prog_doc["doc_groups"],
                            "error": failure,
                        })
                        status_db.delete_document_in_progress(job_id)
                    channel.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as e:
            if retry_count < MAX_JOB_RETRIES:
                logging.info(f"Resubmitting {job_id} to queue (retry #{retry_count+1})")
                content["retry_count"] = retry_count + 1
                properties = pika.BasicProperties(delivery_mode=2, reply_to=header.reply_to)
                # TODO: Channel is likely broken here
                self.connect()
                self.channel.basic_publish(exchange='',
                                      routing_key=self.rabbitmq_queue,
                                      properties=properties,
                                      body=json.dumps(content))
            else:
                logging.info(f"Job {job_id} failed after {MAX_JOB_RETRIES} retries. Discarding job.")

    def listen_for_jobs(self):
        logging.info("Worker connecting to RabbitMQ...")
        if not self.is_connected():
            logging.error("RabbitMQ is offline")
            return

        logging.info("Worker connected to RabbitMQ")
        self.consumer = self.channel.basic_consume(
            queue=self.rabbitmq_queue,
            on_message_callback=self.process_job,
            auto_ack=False
        )

        # start listening
        logging.info("Waiting for messages. To exit press CTRL+C")
        worker_running.set()  # mark healthy

        try:
            # pylint: disable=protected-access
            while self.channel and self.channel.is_open and self.channel._consumer_infos:
                self.channel.connection.process_data_events(time_limit=1)  # 1 second
        except SystemExit:
            raise
        except KeyboardInterrupt:
            raise
        except GeneratorExit:
            raise
        except Exception:  # pylint: disable=broad-except
            logging.error("Worker crashed/disconnected:\n%s", traceback.format_exc())
        finally:
            logging.info("Stopped listening for messages.")
            self.close()
            self.connection = None

        # final cleanup
        worker_running.clear()
        self.close()
        logging.info("Worker exiting")


class DeleteConsumer:
    """Consumes the chatbot-delete queue on its own connection and thread.

    A purge of a large chatbot can run for a long time; keeping it off the
    ingest consumer means deletes never hold up uploads (and vice versa).

    Messages are acked on receipt: the job's state lives in project_deletions,
    not in the queue. Jobs a crashed worker left behind are picked up again by
    the resume sweep that runs on every (re)connect.
    """

    def __init__(self):
        self.rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
        self.rabbitmq_ssl = os.getenv('RABBITMQ_SSL', False)
        self.queue = os.getenv('RABBITMQ_DELETE_QUEUE', 'uiuc-chat-delete')
        self.sql_session = SQLAlchemyIngestDB()
        self.resolver = WorkerConnectionResolver(self.sql_session)

    def purge(self, deletion_id: int) -> None:
        for attempt in range(1, DELETE_MAX_ATTEMPTS + 1):
            outcome = ProjectPurger(self.sql_session, self.resolver).run(deletion_id)
            if outcome != "failed":
                return
            if attempt < DELETE_MAX_ATTEMPTS:
                time.sleep(DELETE_RETRY_BACKOFF * attempt)
        logging.error(f"Deletion {deletion_id} still failing after {DELETE_MAX_ATTEMPTS} attempts; "
                      "left as 'failed' for a super admin to retry")

    def on_message(self, channel, method, header, body):
        channel.basic_ack(delivery_tag=method.delivery_tag)
        try:
            deletion_id = int(json.loads(body.decode())['deletion_id'])
        except (ValueError, KeyError, TypeError):
            logging.error(f"Malformed delete message, dropping: {body!r}")
            return
        self.purge(deletion_id)

    def _connect(self):
        parameters = pika.URLParameters(self.rabbitmq_url)
        # The purge runs inside the callback and can outlast any heartbeat
        # window; with messages acked up front there is nothing to redeliver.
        parameters.heartbeat = 0
        if self.rabbitmq_ssl:
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
            ssl_context.set_ciphers('ECDHE+AESGCM:!ECDSA')
            parameters.ssl_options = pika.SSLOptions(context=ssl_context)
        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        channel.queue_declare(queue=self.queue, durable=True)
        channel.basic_qos(prefetch_count=1)
        return connection, channel

    def run_forever(self):
        while True:
            try:
                for deletion_id in find_resumable_deletions(self.sql_session.engine):
                    logging.info(f"Resuming deletion {deletion_id}")
                    self.purge(deletion_id)
                connection, channel = self._connect()
                channel.basic_consume(queue=self.queue, on_message_callback=self.on_message, auto_ack=False)
                logging.info(f"Delete consumer listening on {self.queue}")
                channel.start_consuming()
            except Exception:  # pylint: disable=broad-except
                logging.error("Delete consumer crashed/disconnected:\n%s", traceback.format_exc())
            time.sleep(10)


@app.route('/api/healthcheck', methods=['GET'])
def return_health():
    # Healthy when the worker loop is actively consuming
    status = {
        "status": "OK" if worker_running.is_set() else "DOWN",
        "worker_thread_alive": worker_thread.is_alive() if worker_thread else False,
        "delete_thread_alive": delete_thread.is_alive() if delete_thread else False,
    }
    return jsonify(status), (200 if worker_running.is_set() else 500)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)

    worker = Worker()
    worker_thread = threading.Thread(target=worker.listen_for_jobs)
    worker_thread.start()
    worker_thread.join(0)

    delete_thread = threading.Thread(target=lambda: DeleteConsumer().run_forever(), daemon=True)
    delete_thread.start()

    logging.info("Running healthcheck endpoint")
    try:
        # threaded=True lets Flask serve multiple requests while worker runs
        app.run(host='0.0.0.0', port=8001, threaded=True)
    finally:
        # Graceful shutdown
        if worker_thread:
            worker_thread.join(timeout=10)
