import datetime
from typing import Any, Dict, Optional

import pydantic


class DocumentMetadata(pydantic.BaseModel):
  authors: list[str]
  journal_name: str
  publication_date: datetime.date  # Changed from datetime.date to str
  keywords: list[str]
  doi: str
  title: str
  subtitle: Optional[str]
  visible_urls: list[str]
  field_of_science: str
  concise_summary: str
  specific_questions_document_can_answer: list[str]
  additional_fields: Optional[Dict[str, Any]] = {}
