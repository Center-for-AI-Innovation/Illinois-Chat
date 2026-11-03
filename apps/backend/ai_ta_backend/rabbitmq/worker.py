import os
import signal
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
from flask import Flask, jsonify


app = Flask(__name__)

PREFETCH_COUNT = int(os.getenv('RABBITMQ_PREFETCH_COUNT', '1'))  # messages
MAX_JOB_RETRIES = int(os.getenv('MAX_JOB_RETRIES', '10'))  # messages

worker_thread: threading.Thread | None = None
worker_running = threading.Event()


logging.getLogger('pika').setLevel(logging.WARNING)

INGEST_TIMEOUT = int(os.getenv('INGEST_SUBPROCESS_TIMEOUT', '300'))  # seconds; per-doc OCR watchdog cap
# Fixed idle cut-off of AWS NAT gateways and network load balancers (Amazon MQ brokers sit
# behind one): a TCP flow with no packets for this long is dropped and the next packet gets RST.
AWS_IDLE_CUTOFF = 350  # seconds


def _heartbeat_from_env():
    """AMQP heartbeat timeout in seconds, from RABBITMQ_HEARTBEAT (default 60).

    Pika sends a frame every half the timeout, so 60 keeps traffic on the wire every 30s, under
    AWS_IDLE_CUTOFF. In pika an explicit integer always overrides the broker's proposal (the
    broker-side setting only matters for a client that passes None), which is how the old 900
    got negotiated unchanged (#376). "broker" passes None; 0 would disable heartbeats and is
    refused, as are unparsable values: both fall back to 60.
    """
    raw = os.getenv('RABBITMQ_HEARTBEAT', '').strip().lower()
    if raw == '':
        return 60
    if raw == 'broker':
        return None
    try:
        value = int(raw)
    except ValueError:
        value = -1
    if value < 1:
        logging.warning("RABBITMQ_HEARTBEAT=%r is invalid or would disable heartbeats; using 60", raw)
        return 60
    if value / 2 >= AWS_IDLE_CUTOFF:
        logging.warning("RABBITMQ_HEARTBEAT=%s sends a frame only every %ss, past the %ss idle cut-off of AWS "
                        "NAT gateways and load balancers; idle connections will be dropped (#376)",
                        value, value // 2, AWS_IDLE_CUTOFF)
    return value


RABBITMQ_HEARTBEAT = _heartbeat_from_env()
# How often the consumer thread services the AMQP connection while an ingest child runs.
# Must stay well under RABBITMQ_HEARTBEAT / 2 so heartbeat frames go out on time.
KEEPALIVE_INTERVAL = 1.0  # seconds
RECONNECT_MAX_DELAY = 60  # seconds; cap on the back-off between reconnect attempts
STABLE_SESSION = 30  # seconds; a consume session shorter than this keeps the back-off growing


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


def run_ingest_isolated(job_id, inputs, keepalive=None, _target=_ingest_child):
    """Run main_ingest in a spawned child with a hard timeout so a hung/huge OCR can't block the
    consumer thread (RabbitMQ heartbeats) or the Flask ALB health check, and a native segfault in
    the OCR libs kills only the child. Returns None on clean completion, else an error string.

    `keepalive`, when given, is called about every KEEPALIVE_INTERVAL seconds while the child
    runs. The worker passes a function that services the AMQP connection, so heartbeat frames
    keep flowing during a long OCR instead of the consumer thread going silent in join(). If it
    raises (the connection was lost mid-job) the wait carries on without it: the child's work
    and the per-document status rows are still worth finishing, and the broker redelivers the
    unacked message by itself once it notices the connection is gone.
    """
    ctx = mp.get_context('spawn')  # spawn, NOT fork: worker is multithreaded (Flask) -> fork can deadlock
    p = ctx.Process(target=_target, args=(job_id, inputs))  # _target is swapped only by tests
    p.start()
    deadline = time.monotonic() + INGEST_TIMEOUT
    while p.is_alive():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        p.join(min(KEEPALIVE_INTERVAL, remaining))
        if keepalive is not None:
            try:
                keepalive()
            except Exception:  # pylint: disable=broad-except
                logging.warning("RabbitMQ connection lost while an ingest child was running; "
                                "waiting for the child without heartbeats:\n%s", traceback.format_exc())
                keepalive = None
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
        self._stop = threading.Event()
        # No connect() here: listen_for_jobs owns connecting, so a broker that is down at
        # start-up is retried with back-off instead of crashing the process before Flask is up.

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
        # Short heartbeat on purpose (see _heartbeat_from_env). The long ingest wait no longer
        # needs a long timeout: run_ingest_isolated services the connection while the child runs.
        parameters.heartbeat = RABBITMQ_HEARTBEAT
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
        try:
            content = json.loads(body.decode())
            job_id = content['job_id']
            inputs = content['inputs']
        except Exception:  # pylint: disable=broad-except
            # Ack and discard: left unacked, a malformed message would be redelivered on every
            # reconnect and, with prefetch 1, block the queue behind it.
            logging.error("Discarding an unparseable ingest message (%d bytes):\n%s", len(body),
                          traceback.format_exc())
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return
        logging.info("----------------------------------------")
        logging.info("--------------Incoming job--------------")
        logging.info("----------------------------------------")
        logging.info(inputs)

        retry_count = content['retry_count'] if 'retry_count' in content else 0

        status_db = None
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
                    failure = run_ingest_isolated(
                        job_id, inputs,
                        keepalive=lambda: self.connection.process_data_events(time_limit=0))
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
        except pika.exceptions.AMQPError:
            # The connection or channel is gone (lost mid-job, or the ack above failed). Don't
            # republish: the broker redelivers the unacked message itself once it notices the
            # connection dropped, and listen_for_jobs reconnects.
            raise
        except Exception as e:  # pylint: disable=broad-except
            # Only resolver / status-DB errors get here: run_ingest_isolated never raises.
            if retry_count < MAX_JOB_RETRIES:
                logging.error("Job %s failed before ingest; resubmitting (retry #%s):\n%s",
                              job_id, retry_count + 1, traceback.format_exc())
                content["retry_count"] = retry_count + 1
                properties = pika.BasicProperties(delivery_mode=2, reply_to=header.reply_to)
                # Republish on the delivering channel and ack the original. Reconnecting here
                # (as before) left the old delivery unacked and, with prefetch 1, froze the
                # consumer on the replacement channel.
                channel.basic_publish(exchange='',
                                      routing_key=self.rabbitmq_queue,
                                      properties=properties,
                                      body=json.dumps(content))
                channel.basic_ack(delivery_tag=method.delivery_tag)
            else:
                logging.error("Job %s failed after %s retries. Discarding job:\n%s",
                              job_id, MAX_JOB_RETRIES, traceback.format_exc())
                self._record_discarded_job(status_db or self.sql_session, job_id, inputs,
                                           "%s: %s" % (type(e).__name__, e), retry_count + 1)
                channel.basic_ack(delivery_tag=method.delivery_tag)

    @staticmethod
    def _record_discarded_job(status_db, job_id, inputs, error, attempts):
        """Best effort: move a discarded job from documents_in_progress to documents_failed so the
        dashboard stops showing the file as ingesting. The database may be the thing that failed,
        so this can fail as well; then it only logs."""
        s3_paths = inputs.get('s3_paths', '')
        try:
            status_db.insert_failed_document({
                "s3_path": s3_paths[0] if isinstance(s3_paths, list) and s3_paths else str(s3_paths or ''),
                "readable_filename": inputs.get('readable_filename', ''),
                "course_name": inputs.get('course_name', ''),
                "url": inputs.get('url'),
                "base_url": inputs.get('base_url'),
                "doc_groups": inputs.get('groups', ''),
                "error": "Job discarded after %d attempts: %s" % (attempts, error),
            })
            status_db.delete_document_in_progress(job_id)
        except Exception:  # pylint: disable=broad-except
            logging.warning("Could not record the discarded job %s in the database:\n%s", job_id,
                            traceback.format_exc())

    def listen_for_jobs(self):
        """Consume until the process exits. A lost connection (broker restart, an idle time-out
        at a load balancer, missed heartbeats) is logged and reconnected with back-off instead
        of ending the thread, so ECS doesn't have to recycle the task to get a consumer back.
        While disconnected, worker_running is clear and /api/healthcheck returns 500."""
        delay = 1
        try:
            while not self._stop.is_set():
                if not self.is_connected():
                    logging.info("Worker connecting to RabbitMQ...")
                    try:
                        self.connect()
                    except Exception:  # pylint: disable=broad-except
                        logging.error("RabbitMQ connect failed; retrying in %ss:\n%s", delay,
                                      traceback.format_exc())
                        self.close()  # connect() may have opened the socket before queue_declare failed
                        self._stop.wait(delay)
                        delay = min(delay * 2, RECONNECT_MAX_DELAY)
                        continue
                lasted = self._consume_until_disconnected()
                # Only a session that actually lasted resets the back-off: a consume that dies at
                # once (queue deleted, permission lost) must not churn the broker once a second.
                delay = 1 if lasted >= STABLE_SESSION else min(delay * 2, RECONNECT_MAX_DELAY)
                self._stop.wait(delay)
        finally:
            worker_running.clear()
            self.close()
            logging.info("Worker exiting")

    def stop(self):
        """Ask listen_for_jobs to return after the current message (used on shutdown)."""
        self._stop.set()

    def _consume_until_disconnected(self):
        """One connection's worth of consuming. Returns how long it lasted, in seconds, once the
        connection or channel is gone or stop() was called."""
        started = time.monotonic()
        try:
            self.consumer = self.channel.basic_consume(
                queue=self.rabbitmq_queue,
                on_message_callback=self.process_job,
                auto_ack=False
            )
            logging.info("Worker connected to RabbitMQ. Waiting for messages. To exit press CTRL+C")
            worker_running.set()  # mark healthy
            # pylint: disable=protected-access
            while (self.channel and self.channel.is_open and self.channel._consumer_infos
                   and not self._stop.is_set()):
                self.channel.connection.process_data_events(time_limit=1)  # 1 second
            if not self._stop.is_set():
                logging.warning("RabbitMQ channel closed or consumer cancelled; reconnecting")
        except Exception:  # pylint: disable=broad-except
            logging.error("Worker lost its RabbitMQ connection; reconnecting:\n%s", traceback.format_exc())
        finally:
            worker_running.clear()
            logging.info("Stopped listening for messages.")
            self.close()
        return time.monotonic() - started


@app.route('/api/healthcheck', methods=['GET'])
def return_health():
    # Healthy when the worker loop is actively consuming
    status = {
        "status": "OK" if worker_running.is_set() else "DOWN",
        "worker_thread_alive": worker_thread.is_alive() if worker_thread else False
    }
    return jsonify(status), (200 if worker_running.is_set() else 500)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)

    worker = Worker()
    worker_thread = threading.Thread(target=worker.listen_for_jobs)
    worker_thread.start()
    worker_thread.join(0)

    def _on_sigterm(signum, frame):
        # python is PID 1 in the worker image, so without a handler SIGTERM is dropped and ECS
        # SIGKILLs after stopTimeout, leaving an in-flight job as "worker crashed". Unwind
        # app.run the way Ctrl+C does; the finally below stops the consumer after its current
        # message.
        logging.info("SIGTERM received; finishing the current message and stopping")
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, _on_sigterm)

    logging.info("Running healthcheck endpoint")
    try:
        # threaded=True lets Flask serve multiple requests while worker runs
        app.run(host='0.0.0.0', port=8001, threaded=True)
    finally:
        # Graceful shutdown: let the current message finish, then stop consuming.
        worker.stop()
        if worker_thread:
            worker_thread.join(timeout=10)
