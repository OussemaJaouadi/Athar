"""The small contract shared by collection, run history, and the TUI."""

from dataclasses import dataclass
from typing import Literal

StageName = Literal[
    "collect",
    "load",
    "fetch",
    "preserve",
    "parse",
    "normalize",
    "resolve",
    "reconcile",
    "save",
    "commit",
]
RunStatus = Literal["running", "completed", "failed", "cancelled"]


@dataclass(frozen=True)
class StageProgress:
    stage_name: StageName
    status: RunStatus
    message: str
    items_processed: int = 0
    run_id: str | None = None


@dataclass(frozen=True)
class PipelineRunResult:
    run_id: str
    status: RunStatus
    snapshot_id: str | None = None
    records_processed: int = 0
    review_count: int = 0
    error: str | None = None
