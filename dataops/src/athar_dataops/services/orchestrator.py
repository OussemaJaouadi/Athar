"""One collection flow. Preserve first, derive second, declare success after commit."""

import asyncio
import json
from collections.abc import Callable
from uuid import uuid4

from athar_dataops.schemas.pipeline import (
    PipelineRunResult,
    RunStatus,
    StageName,
    StageProgress,
)
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.registry import RegistryService


class PipelineOrchestrator:
    def __init__(
        self,
        artifact: ArtifactService,
        registry: RegistryService,
        database: DatabaseService,
        timeout_seconds: float = 300,
    ):
        self._artifact = artifact
        self._registry = registry
        self._db = database
        self._timeout_seconds = timeout_seconds
        self._running = False

    async def run_pipeline(
        self, progress: Callable[[StageProgress], None] | None = None
    ) -> PipelineRunResult:
        if self._running:
            raise RuntimeError("A collection is already running")
        self._running = True
        run_id = str(uuid4())
        stage: StageName = "collect"
        snapshot_id = None
        started = False

        def report(status: RunStatus, message: str, count: int = 0) -> None:
            if progress:
                progress(StageProgress(stage, status, message, count))

        try:
            await self._db.start_run(run_id)
            started = True
            async with asyncio.timeout(self._timeout_seconds):
                report("running", "Fetching registry")
                fetched = await self._artifact.fetch()
                snapshot = await self._db.preserve_snapshot(run_id, fetched)
                snapshot_id = snapshot.id
                report("completed", "Source bytes preserved")
                stage = "normalize"
                report("running", "Reading preserved evidence")
                # Read back the stored artifact: derived data must have a durable source.
                stored = await self._db.get_snapshot(snapshot_id)
                rows = json.loads(stored.raw_content)
                if not isinstance(rows, list):
                    raise ValueError(
                        "Registry response must be a JSON array; source bytes retained"
                    )
                await self._db.preserve_rows(snapshot_id, rows)
                records = self._registry.normalize(rows)
                report(
                    "completed",
                    f"{len(records)} source rows accounted for",
                    len(records),
                )
                stage = "save"
                report("running", "Resolving identities and saving records")
                result = await self._db.complete_run(run_id, snapshot_id, records)
            report("completed", f"{result.review_count} rows need review", len(records))
            return result
        except (Exception, asyncio.CancelledError) as exc:
            cancelled = isinstance(exc, asyncio.CancelledError)
            status = "cancelled" if cancelled else "failed"
            if isinstance(exc, TimeoutError):
                error = f"Collection exceeded {self._timeout_seconds:g} seconds"
            else:
                error = "Collection cancelled" if cancelled else str(exc)
            if started:
                await self._db.finish_failed_run(run_id, status, error)
                result = await self._db.get_run(run_id)
                if result.status == "completed":
                    return result
            report(status, error)
            if cancelled:
                raise
            return PipelineRunResult(run_id, status, snapshot_id, error=error)
        finally:
            self._running = False
