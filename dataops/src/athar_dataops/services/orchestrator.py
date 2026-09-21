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
from athar_dataops.schemas.registry import utc_now
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
        snapshot_id = None
        started = False
        stage: StageName = "fetch"

        def emit(
            name: StageName, status: RunStatus, message: str, count: int = 0
        ) -> None:
            if progress:
                progress(StageProgress(name, status, message, count, run_id))

        async def begin(name: StageName, message: str) -> None:
            nonlocal stage
            stage = name
            emit(name, "running", message)
            await self._db.record_step(
                run_id, name, status="running", started_at=utc_now(), message=message
            )

        async def finish(name: StageName, message: str, items: int = 0) -> None:
            await self._db.record_step(
                run_id,
                name,
                status="completed",
                completed_at=utc_now(),
                items=items,
                message=message,
            )
            emit(name, "completed", message, items)

        try:
            await self._db.start_run(run_id)
            started = True
            async with asyncio.timeout(self._timeout_seconds):
                await begin("fetch", "Fetching registry")
                fetched = await self._artifact.fetch()
                snapshot = await self._db.preserve_snapshot(run_id, fetched)
                snapshot_id = snapshot.id
                await finish("fetch", "Source bytes preserved")

                await begin("preserve", "Storing source rows")
                # Read back the stored artifact: derived data must have a durable source.
                stored = await self._db.get_snapshot(snapshot_id)
                rows = json.loads(stored.raw_content)
                if not isinstance(rows, list):
                    raise ValueError(
                        "Registry response must be a JSON array; source bytes retained"
                    )
                row_ids = await self._db.preserve_rows(snapshot_id, rows)
                await finish("preserve", f"{len(rows)} source rows stored", len(rows))

                await begin("normalize", "Checking records")
                records = self._registry.normalize(rows)
                await finish(
                    "normalize",
                    f"{len(records)} records normalized",
                    len(records),
                )

                await begin("resolve", "Resolving identities and saving records")
                result = await self._db.complete_run(
                    run_id, snapshot_id, records, row_ids
                )
            await finish(
                "resolve", f"{result.review_count} rows need review", len(records)
            )
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
                    emit(
                        stage,
                        "completed",
                        "Run committed; step reporting interrupted",
                        result.records_processed,
                    )
                    return result
                await self._db.record_step(
                    run_id,
                    stage,
                    status=status,
                    completed_at=utc_now(),
                    message=error,
                )
            emit(stage, status, error)
            if cancelled:
                raise
            return PipelineRunResult(run_id, status, snapshot_id, error=error)
        finally:
            self._running = False

    async def run_clean_pipeline(
        self, progress: Callable[[StageProgress], None] | None = None
    ) -> PipelineRunResult:
        if self._running:
            raise RuntimeError("A pipeline operation is already running")
        self._running = True
        run_id = str(uuid4())
        snapshot_id = None
        started = False
        stage: StageName = "load"

        def emit(
            name: StageName, status: RunStatus, message: str, count: int = 0
        ) -> None:
            if progress:
                progress(StageProgress(name, status, message, count, run_id))

        async def begin(name: StageName, message: str) -> None:
            nonlocal stage
            stage = name
            emit(name, "running", message)
            await self._db.record_step(
                run_id, name, status="running", started_at=utc_now(), message=message
            )

        async def finish(name: StageName, message: str, items: int = 0) -> None:
            await self._db.record_step(
                run_id,
                name,
                status="completed",
                completed_at=utc_now(),
                items=items,
                message=message,
            )
            emit(name, "completed", message, items)

        try:
            await self._db.start_run(run_id)
            started = True
            async with asyncio.timeout(self._timeout_seconds):
                await begin("load", "Reading latest preserved evidence")
                snapshot_id, rows, row_ids = await self._db.get_latest_snapshot_rows()
                await finish("load", f"{len(rows)} stored rows loaded", len(rows))

                await begin("normalize", "Normalizing stored evidence")
                records = self._registry.normalize(rows)
                await finish(
                    "normalize",
                    f"{len(records)} records normalized",
                    len(records),
                )

                await begin("reconcile", "Deduplicating and backfilling the corpus")
                result = await self._db.reconcile_corpus(
                    run_id, snapshot_id, records, row_ids
                )
            await finish(
                "reconcile", f"{result.review_count} items need review", len(records)
            )
            return result
        except (Exception, asyncio.CancelledError) as exc:
            cancelled = isinstance(exc, asyncio.CancelledError)
            status = "cancelled" if cancelled else "failed"
            if isinstance(exc, TimeoutError):
                error = f"Cleaning exceeded {self._timeout_seconds:g} seconds"
            else:
                error = "Cleaning cancelled" if cancelled else str(exc)
            if started:
                await self._db.finish_failed_run(run_id, status, error)
                result = await self._db.get_run(run_id)
                if result.status == "completed":
                    emit(
                        stage,
                        "completed",
                        "Run committed; step reporting interrupted",
                        result.records_processed,
                    )
                    return result
                await self._db.record_step(
                    run_id,
                    stage,
                    status=status,
                    completed_at=utc_now(),
                    message=error,
                )
            emit(stage, status, error)
            if cancelled:
                raise
            return PipelineRunResult(run_id, status, snapshot_id, error=error)
        finally:
            self._running = False
