"""Validated one-call output and provider-independent accounting."""

from dataclasses import dataclass
from typing import NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field

PROMPT_VERSION = "prepare-v1"
SCHEMA_VERSION = "1"
TARGET_LANGUAGE = "en"


class PreviewProfile(TypedDict):
    name: str
    model: str
    fingerprint: str


class PreparePreview(TypedDict):
    available: bool
    profiles: list[PreviewProfile]
    eligible: int
    uncached: int
    cached: int


class QuotaLimit(TypedDict):
    limit: float
    period: str


class ProfileQuotaState(TypedDict):
    name: str
    provider: str
    model: str
    fingerprint: str
    disabled: bool
    quotas: dict[str, QuotaLimit]
    requests_today: int
    tokens_today: float
    requests_minute: int


class ProfileOverview(ProfileQuotaState):
    """Quota state plus all-time usage; ``registered`` marks configured-but-unseeded."""

    calls: int
    input_tokens: int | None
    output_tokens: int | None
    unknown_tokens: int
    registered: NotRequired[bool]


class PreparedText(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detected_language: str = Field(min_length=2, max_length=32)
    cleaned_text: str
    english_translation: str | None
    fluff_excerpts: list[str]


@dataclass(frozen=True)
class PreparationReply:
    output: PreparedText | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    request_id: str | None = None
    error: str | None = None
    stop: bool = False
    profile: str | None = None
    limit_hint: str | None = None
