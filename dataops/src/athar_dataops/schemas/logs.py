"""Session log values shared by the Run and Logs views."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class LogEntry:
    timestamp: datetime | None
    level: str
    message: str
    run_id: str | None = None
    step: str | None = None
    status: str | None = None

    @classmethod
    def create(cls, message: str, level: str = "info", **context) -> "LogEntry":
        level = level.lower()
        status = context.pop("status", None)
        if level in ("running", "completed", "cancelled", "failed"):
            status = status or level
        severity = {
            "running": "stage",
            "completed": "stage",
            "success": "stage",
            "ready": "stage",
            "cancelled": "warning",
            "failed": "error",
            "warn": "warning",
        }.get(level.lower(), level.lower())
        return cls(
            datetime.now().astimezone(), severity, message, status=status, **context
        )
