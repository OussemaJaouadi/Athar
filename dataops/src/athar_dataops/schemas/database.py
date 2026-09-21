"""Bounded previews retain column names even for empty tables."""

from dataclasses import dataclass
from typing import Any

from athar_dataops.schemas.registry import RecordDetail


@dataclass(frozen=True)
class TablePage:
    columns: list[str]
    rows: list[tuple[Any, ...]]
    has_more: bool


@dataclass(frozen=True)
class RecordPage:
    records: list[RecordDetail]
    total: int
    unfiltered_total: int
