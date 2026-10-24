"""Pipeline run and step bookkeeping, plus the overview the Run tab reports."""

from typing import Any

from athar_dataops.schemas.pipeline import PipelineRunResult
from athar_dataops.schemas.registry import (
    utc_now,
)
from athar_dataops.services.database.core import ConnectionCore


class RunStore(ConnectionCore):
    async def start_run(self, run_id: str, operation: str = "collect") -> None:
        async with self._lock:
            await self._execute(
                "INSERT INTO pipeline_runs (id, started_at, status, operation) VALUES (?, ?, 'running', ?)",
                (run_id, utc_now(), operation),
            )

    async def _complete_step(self, run_id: str, name: str, items: int, message: str) -> None:
        """Commit terminal step status with its data, even if later UI reporting fails."""
        await self._execute(
            """UPDATE run_steps SET status='completed', completed_at=?,
               items_processed=?, message=? WHERE run_id=? AND step_name=?""",
            (utc_now(), items, message, run_id, name),
        )

    async def record_step(
        self,
        run_id: str,
        step_name: str,
        *,
        status: str,
        started_at: str | None = None,
        completed_at: str | None = None,
        items: int = 0,
        message: str = "",
    ) -> None:
        async with self._lock:
            await self._execute(
                """INSERT INTO run_steps (run_id, step_name, status, started_at, completed_at, items_processed, message)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(run_id, step_name) DO UPDATE SET
                       status=excluded.status,
                       started_at=COALESCE(excluded.started_at, run_steps.started_at),
                       completed_at=excluded.completed_at,
                       items_processed=excluded.items_processed,
                       message=excluded.message""",
                (
                    run_id,
                    step_name,
                    status,
                    started_at,
                    completed_at,
                    items,
                    message,
                ),
            )

    async def get_run_steps(self, run_id: str) -> list[dict[str, Any]]:
        async with self._lock:
            return await self._rows(
                "SELECT step_name, status, started_at, completed_at, items_processed, message FROM run_steps WHERE run_id=? ORDER BY rowid",
                (run_id,),
            )

    async def list_recent_runs(self, limit: int = 8) -> list[dict[str, Any]]:
        async with self._lock:
            return await self._rows(
                "SELECT id, status, operation, started_at, completed_at, records_processed, review_count, snapshot_id, error FROM pipeline_runs ORDER BY started_at DESC LIMIT ?",
                (limit,),
            )

    async def finish_failed_run(self, run_id: str, status: str, error: str) -> None:
        if status not in ("failed", "cancelled"):
            raise ValueError("Expected failed or cancelled")
        async with self._lock:
            # A cancellation arriving just after commit must not relabel durable success.
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status=?, error=? WHERE id=? AND status='running'",
                (utc_now(), status, error, run_id),
            )

    async def get_run(self, run_id: str) -> PipelineRunResult:
        async with self._lock:
            rows = await self._rows(
                "SELECT id AS run_id, status, snapshot_id, records_processed, review_count, error, operation FROM pipeline_runs WHERE id=?",
                (run_id,),
            )
        return PipelineRunResult(**rows[0])

    async def get_run_row(self, run_id: str) -> dict[str, Any] | None:
        async with self._lock:
            rows = await self._rows(
                "SELECT id, status, operation, started_at, completed_at, records_processed, review_count, snapshot_id, error FROM pipeline_runs WHERE id=?",
                (run_id,),
            )
        return rows[0] if rows else None

    async def get_overview_stats(self) -> dict[str, Any]:
        """Report stored counts and the last collection, never infer system health."""
        async with self._lock:
            snapshots = await self._rows(
                "SELECT COUNT(*) AS count FROM source_snapshots"
            )
            entities = await self._rows("SELECT COUNT(*) AS count FROM entities")
            last_run = await self._rows(
                """SELECT status, records_processed, review_count FROM pipeline_runs
                WHERE operation = 'collect' ORDER BY started_at DESC, rowid DESC LIMIT 1"""
            )
            return {
                "snapshots": snapshots[0]["count"],
                "entities": entities[0]["count"],
                "records": last_run[0]["records_processed"] if last_run else 0,
                "reviews": last_run[0]["review_count"] if last_run else 0,
                "status": last_run[0]["status"] if last_run else "idle",
            }
