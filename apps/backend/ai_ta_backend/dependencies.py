from concurrent.futures import ProcessPoolExecutor
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from functools import wraps
import threading
from typing import Callable, TypeVar

from ai_ta_backend.database.aws import AWSStorage
from ai_ta_backend.database.connection_manager import ConnectionManager
from ai_ta_backend.database.sql import SQLDatabase
from ai_ta_backend.database.vector import VectorDatabase
from ai_ta_backend.service.export_service import ExportService
from ai_ta_backend.service.nomic_service import NomicService
from ai_ta_backend.service.posthog_service import PosthogService
from ai_ta_backend.service.project_service import ProjectService
from ai_ta_backend.service.retrieval_service import RetrievalService
from ai_ta_backend.service.sentry_service import SentryService
from ai_ta_backend.service.workflow_service import WorkflowService

_thread_pool = ThreadPoolExecutor(max_workers=10)
_process_pool = ProcessPoolExecutor(max_workers=10)

T = TypeVar("T")


def _locked_singleton(factory: Callable[[], T]) -> Callable[[], T]:
  """Wrap a zero-arg factory as a thread-safe process singleton.

  ``lru_cache`` is not atomic on cache miss. Each factory gets its own lock so
  a slow cold start (nomic login, Qdrant client, OpenAI embeddings) cannot
  convoy unrelated getters. Double-checked locking: fast path reads the cache
  without holding the lock once the instance exists.
  """
  lock = threading.Lock()

  @lru_cache
  def cached() -> T:
    return factory()

  @wraps(factory)
  def wrapper() -> T:
    info = cached.cache_info()
    if info.currsize > 0:
      return cached()
    with lock:
      return cached()

  wrapper.cache_clear = cached.cache_clear  # type: ignore[attr-defined]
  wrapper.cache_info = cached.cache_info  # type: ignore[attr-defined]
  return wrapper


@_locked_singleton
def get_sql_database() -> SQLDatabase:
  return SQLDatabase()


@_locked_singleton
def get_aws_storage() -> AWSStorage:
  return AWSStorage()


@_locked_singleton
def get_vector_database() -> VectorDatabase:
  return VectorDatabase()


@_locked_singleton
def get_sentry_service() -> SentryService:
  return SentryService()


@_locked_singleton
def get_posthog_service() -> PosthogService:
  return PosthogService()


@_locked_singleton
def get_connection_manager() -> ConnectionManager:
  return ConnectionManager(
      get_sql_database(),
      get_vector_database(),
      get_aws_storage(),
  )


@_locked_singleton
def get_retrieval_service() -> RetrievalService:
  return RetrievalService(
      get_posthog_service(),
      get_sentry_service(),
      _thread_pool,
      get_connection_manager(),
  )


@_locked_singleton
def get_nomic_service() -> NomicService:
  return NomicService(get_sentry_service(), get_sql_database())


@_locked_singleton
def get_export_service() -> ExportService:
  return ExportService(
      get_sentry_service(),
      _process_pool,
      get_connection_manager(),
  )


@_locked_singleton
def get_workflow_service() -> WorkflowService:
  return WorkflowService(get_sql_database())


@_locked_singleton
def get_project_service() -> ProjectService:
  return ProjectService(
      get_sql_database(),
      get_posthog_service(),
      get_sentry_service(),
  )
