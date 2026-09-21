"""Derived registry records. Original JSON stays alongside these values."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class RegistrySnapshot:
    id: str
    source_url: str
    content_hash: str
    fetched_at: str
    raw_content: bytes


class NormalizedRecord(BaseModel):
    row_number: int
    name: str | None = None
    website: str | None = None
    domain: str | None = None
    description: str | None = None
    sector: str | None = None
    founders: list[str] = Field(default_factory=list)
    cohort_label: str | None = None
    cohort_date: str | None = None
    creation_year: int | None = None
    entity_id: str | None = None
    review_reasons: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class RecordDetail:
    snapshot_id: str
    source_url: str
    content_hash: str
    original: Any
    normalized: NormalizedRecord
