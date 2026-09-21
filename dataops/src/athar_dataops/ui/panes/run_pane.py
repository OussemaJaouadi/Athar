"""A single collection action, with detailed activity available on demand."""

import asyncio

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.message import Message
from textual.widgets import Button, Collapsible, Label, Static
from textual.worker import Worker, WorkerCancelled

from athar_dataops.schemas.pipeline import StageProgress
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.ui.widgets.log_view import LogView
from athar_dataops.ui.widgets.metric_card import MetricCard
from athar_dataops.ui.widgets.progress import PipelineProgress


class RunPane(VerticalScroll):
    class CollectionFinished(Message):
        """Refresh records after the committed collection becomes available."""

    def __init__(
        self,
        orchestrator: PipelineOrchestrator,
        database: DatabaseService | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._orchestrator = orchestrator
        self._database = database
        self._collection_worker: Worker | None = None
        self.collecting = False

    def compose(self) -> ComposeResult:
        with Horizontal(id="run-metrics"):
            yield MetricCard(
                "Saved Entities", "—", "Registered startups", card_id="stat-entities"
            )
            yield MetricCard(
                "Source Snapshots", "—", "Raw JSON archives", card_id="stat-snapshots"
            )
            yield MetricCard("Collection", "—", "Last run", card_id="stat-status")

        yield Label("Startup Tunisia registry", classes="heading")
        yield Static("Collect the latest records to browse them here.", classes="muted")
        with Horizontal(classes="actions"):
            yield Button("Collect registry", id="run-pipeline", variant="primary")
            yield Button("Clean data", id="clean-pipeline")
            yield Button("Cancel", id="cancel-pipeline", disabled=True)
            yield Button("View records", id="view-records")
        yield Static("Ready", id="run-status", markup=False)

        with Collapsible(
            title="Pipeline Activity & Logs", collapsed=True, id="run-activity"
        ):
            yield PipelineProgress(id="run-progress")
            yield LogView(id="run-log")

    def on_mount(self) -> None:
        self.query_one("#cancel-pipeline").display = False
        self.query_one("#view-records").display = False
        self.query_one("#run-activity").display = False
        self.run_worker(self._update_stats(), exit_on_error=False)

    async def _update_stats(self) -> None:
        if self._database is None:
            return
        try:
            stats = await self._database.get_overview_stats()
            self.query_one("#stat-entities", MetricCard).set_value(
                str(stats["entities"]), "Registered startups"
            )
            self.query_one("#stat-snapshots", MetricCard).set_value(
                str(stats["snapshots"]), "Raw source archives"
            )
            status = stats["status"]
            self._set_collection_status(status)
        except Exception as exc:
            self.query_one("#stat-entities", MetricCard).set_value("—", "Unavailable")
            self.query_one("#stat-snapshots", MetricCard).set_value("—", "Unavailable")
            self.query_one("#stat-status", MetricCard).set_value(
                "UNKNOWN", "Could not read last run"
            )
            self.app.log_workspace_event(
                f"Could not load collection summary: {exc}", "error"
            )

    @on(Button.Pressed, "#run-pipeline")
    def start_collection(self) -> None:
        if self.collecting:
            return
        self._set_running(True)
        self.query_one("#view-records").display = False
        self.query_one("#run-activity").display = True
        self.query_one(LogView).clear()
        try:
            self.query_one(PipelineProgress).reset()
        except Exception:
            pass
        self._set_status("Connecting to registry…")
        self._collection_worker = self.run_worker(
            self._collect(), group="collection", exit_on_error=False
        )
        self.query_one("#cancel-pipeline", Button).focus()

    @on(Button.Pressed, "#clean-pipeline")
    def start_cleaning(self) -> None:
        if self.collecting:
            return
        self._set_running(True)
        self.query_one("#view-records").display = False
        self.query_one("#run-activity").display = True
        self.query_one(LogView).clear()
        try:
            self.query_one(PipelineProgress).reset()
        except Exception:
            pass
        self._set_status("Cleaning and normalizing stored evidence…")
        self._collection_worker = self.run_worker(
            self._clean(), group="collection", exit_on_error=False
        )
        self.query_one("#cancel-pipeline", Button).focus()

    @on(Button.Pressed, "#cancel-pipeline")
    def cancel_collection(self) -> None:
        if self._collection_worker is not None:
            self.query_one("#cancel-pipeline", Button).disabled = True
            self._set_status("Cancelling…")
            self._collection_worker.cancel()

    @on(Button.Pressed, "#view-records")
    def view_records(self) -> None:
        self.app.action_navigate("inspect")

    async def stop_collection(self) -> None:
        """Finish cancellation bookkeeping before the database closes."""
        if self._collection_worker is not None and self.collecting:
            if not self._collection_worker.is_cancelled:
                self._collection_worker.cancel()
            try:
                await self._collection_worker.wait()
            except WorkerCancelled:
                pass

    def _set_running(self, running: bool) -> None:
        self.collecting = running
        self.query_one("#run-pipeline", Button).disabled = running
        self.query_one("#clean-pipeline", Button).disabled = running
        cancel = self.query_one("#cancel-pipeline", Button)
        cancel.disabled = not running
        cancel.display = running
        if running:
            self._set_collection_status("running")

    def _set_collection_status(self, status: str) -> None:
        labels = {
            "idle": "NOT RUN",
            "running": "RUNNING",
            "completed": "COMPLETED",
            "failed": "FAILED",
            "cancelled": "CANCELLED",
        }
        self.query_one("#stat-status", MetricCard).set_value(
            labels.get(status, "UNKNOWN"), "Last collection"
        )

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#run-status", Static)
        status.update(text)
        status.set_classes(state)

    def _progress(self, progress: StageProgress) -> None:
        if progress.status == "running":
            self._set_status(
                {
                    "collect": "Collecting records…",
                    "load": "Loading stored evidence…",
                    "normalize": "Checking records…",
                    "reconcile": "Deduplicating and backfilling…",
                    "save": "Saving records…",
                }[progress.stage_name]
            )
        self.query_one(LogView).write(progress.message, progress.status)
        try:
            self.query_one(PipelineProgress).update_stage(progress)
        except Exception:
            pass
        try:
            from athar_dataops.ui.panes.logs_pane import LogsPane

            self.app.query_one(LogsPane).log_entry(progress.message, progress.status)
        except Exception:
            pass

    def _failed(self, error: str) -> None:
        self._set_collection_status("failed")
        self._set_status(
            "Collection failed. Open Activity for details, then try again.", "error"
        )
        self.query_one(LogView).write(error, "failed")
        self.query_one("#run-activity", Collapsible).collapsed = False
        try:
            from athar_dataops.ui.panes.logs_pane import LogsPane

            self.app.query_one(LogsPane).log_entry(error, "failed")
        except Exception:
            pass

    async def _collect(self) -> None:
        try:
            result = await self._orchestrator.run_pipeline(self._progress)
            if result.status == "completed":
                summary = f"{result.records_processed} records saved"
                if result.review_count:
                    summary += f" · {result.review_count} need review"
                self._set_status(summary, "success")
                self.query_one(LogView).write(summary, "completed")
                self.query_one("#view-records").display = True
                self.post_message(self.CollectionFinished())
                await self._update_stats()
            else:
                self._failed(result.error or "Collection failed")
        except asyncio.CancelledError:
            self._set_collection_status("cancelled")
            self._set_status("Cancelled. You can collect again.")
            self.query_one(LogView).write(
                "Cancelled; stored source evidence was kept.", "cancelled"
            )
            raise
        except Exception as exc:
            self._failed(str(exc))
        finally:
            # Keep focus local when finishing; never pull the user out of another pane.
            cancel_focused = self.query_one("#cancel-pipeline").has_focus
            self._set_running(False)
            if cancel_focused:
                target = (
                    "#view-records"
                    if self.query_one("#view-records").display
                    else "#run-pipeline"
                )
                self.query_one(target, Button).focus()

    async def _clean(self) -> None:
        try:
            result = await self._orchestrator.run_clean_pipeline(self._progress)
            if result.status == "completed":
                summary = f"Cleaned {result.records_processed} records"
                if result.review_count:
                    summary += f" · {result.review_count} need review"
                self._set_status(summary, "success")
                self.query_one(LogView).write(summary, "completed")
                self.query_one("#view-records").display = True
                self.post_message(self.CollectionFinished())
                await self._update_stats()
            else:
                self._failed(result.error or "Cleaning failed")
        except asyncio.CancelledError:
            self._set_collection_status("cancelled")
            self._set_status("Cancelled. You can clean again.")
            self.query_one(LogView).write(
                "Cleaning cancelled; existing evidence kept.", "cancelled"
            )
            raise
        except Exception as exc:
            self._failed(str(exc))
        finally:
            cancel_focused = self.query_one("#cancel-pipeline").has_focus
            self._set_running(False)
            if cancel_focused:
                target = (
                    "#view-records"
                    if self.query_one("#view-records").display
                    else "#run-pipeline"
                )
                self.query_one(target, Button).focus()

