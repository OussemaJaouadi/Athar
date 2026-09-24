"""Derived registry records. Original JSON stays alongside these values."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from athar_dataops.schemas.issues import RecordIssue, classify_issue


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


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

    @property
    def issues(self) -> list[RecordIssue]:
        return [classify_issue(reason) for reason in self.review_reasons]

    @property
    def needs_review(self) -> bool:
        return any(issue.category == "human" for issue in self.issues)


@dataclass(frozen=True)
class RecordDetail:
    snapshot_id: str
    source_url: str
    content_hash: str
    original: Any
    normalized: NormalizedRecord
    prepared: dict[str, Any] | None = None
