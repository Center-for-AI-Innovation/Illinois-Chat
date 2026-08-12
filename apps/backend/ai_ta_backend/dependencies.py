from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from functools import lru_cache

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


@lru_cache
def get_sql_database() -> SQLDatabase:
  return SQLDatabase()


@lru_cache
def get_aws_storage() -> AWSStorage:
  return AWSStorage()


@lru_cache
def get_vector_database() -> VectorDatabase:
  return VectorDatabase()


@lru_cache
def get_sentry_service() -> SentryService:
  return SentryService()


@lru_cache
def get_posthog_service() -> PosthogService:
  return PosthogService()


@lru_cache
def get_connection_manager() -> ConnectionManager:
  return ConnectionManager(
      get_sql_database(),
      get_vector_database(),
      get_aws_storage(),
  )


@lru_cache
def get_retrieval_service() -> RetrievalService:
  return RetrievalService(
      get_posthog_service(),
      get_sentry_service(),
      _thread_pool,
      get_connection_manager(),
  )


@lru_cache
def get_nomic_service() -> NomicService:
  return NomicService(get_sentry_service(), get_sql_database())


@lru_cache
def get_export_service() -> ExportService:
  return ExportService(
      get_sentry_service(),
      _process_pool,
      get_connection_manager(),
  )


@lru_cache
def get_workflow_service() -> WorkflowService:
  return WorkflowService(get_sql_database())


@lru_cache
def get_project_service() -> ProjectService:
  return ProjectService(
      get_sql_database(),
      get_posthog_service(),
      get_sentry_service(),
  )
