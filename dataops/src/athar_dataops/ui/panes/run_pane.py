"""The Pipeline tab: operations and saved runs on the left, the run on the right.

The right column shows one run at a time: the live one while it runs, or a
saved one picked from the list. Its status line, timeline, and the session
event log are the same widgets in both cases.
"""

import asyncio
from contextlib import suppress
from datetime import datetime
from time import monotonic
from typing import Any

import httpx
import turso
from rich.text import Text
from textual import on
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.message import Message
from textual.widgets import Button, DataTable, Input, Label, Static
from textual.worker import Worker, WorkerCancelled

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.schemas.pipeline import StageProgress
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.metrics import ProcessSampler, StepMetrics
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.themes import palette_for
from athar_dataops.ui.arabic import describe_error, sanitize_display
from athar_dataops.ui.dialogs.prepare import PrepareConfirmScreen
from athar_dataops.ui.dialogs.wipe import WipeConfirmScreen
from athar_dataops.ui.panes.logs_pane import LogsPane
from athar_dataops.ui.widgets.run_timeline import RunTimeline, format_elapsed

# Step titles are what the operator pressed for, not the function that runs.
COLLECT_STEPS = [
    ("fetch", "Download registry"),
    ("preserve", "Store source rows"),
    ("normalize", "Clean records"),
    ("resolve", "Match startups and save"),
]
CLEAN_STEPS = [
    ("load", "Load stored rows"),
    ("normalize", "Clean records"),
    ("reconcile", "Match startups and save"),
]
PREPARE_STEPS = [("load", "Find descriptions"), ("prepare", "Prepare text")]

_STATUS_WORDS = {
    "idle": "not run yet",
    "running": "RUNNING",
    "completed": "COMPLETED",
    "failed": "FAILED",
    "cancelled": "CANCELLED",
}
_OPERATION_NAMES = {"collect": "Collect", "clean": "Clean", "prepare": "Prepare"}


def _timestamp(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


_RUN_STATUS_WORDS = {"completed": "done", "failed": "failed", "cancelled": "cancelled", "running": "running"}


def _short_time(value: str | None) -> str:
    parsed = _timestamp(value)
    return parsed.strftime("%Y-%m-%d %H:%M") if parsed else "unknown time"


def _duration(started: str | None, completed: str | None) -> float | None:
    start, end = _timestamp(started), _timestamp(completed)
    return (end - start).total_seconds() if start and end else None


class RunPane(Vertical):
    class CollectionFinished(Message):
        """Refresh inspection after committed collection or cleaning."""

    class RegistryReset(Message):
        """Registry evidence and derived data were cleared."""

        def __init__(self, deleted: int) -> None:
            super().__init__()
            self.deleted = deleted

    def __init__(
        self,
        orchestrator: PipelineOrchestrator,
        database: DatabaseService | None = None,
        sampler: ProcessSampler | None = None,
        profiles_warning: str | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._orchestrator = orchestrator
        self._database = database
        self._sampler = sampler
        self._profiles_warning = profiles_warning
        self._collection_worker: Worker | None = None
        self.collecting = False
        self._resetting = False
        self._stage_starts: dict[str, float] = {}
        self._metrics: dict[str, StepMetrics] = {}
        self._running_stage: str | None = None
        self._flow_start = 0.0
        self._run_id: str | None = None
        self._terminal_status: str | None = None
        self._terminal_text: str | None = None
        self._mode = "Collect"
        self._runs: list[dict[str, Any]] = []
        self._runs_query = ""
        self._shown_run: str | None = None

    def _timeline(self) -> RunTimeline:
        return self.query_one(RunTimeline)

    def _logs(self) -> LogsPane:
        return self.query_one(LogsPane)

    def compose(self):
        with Horizontal(id="run-workspace"):
            with Vertical(id="run-operations"):
                yield Label("Operations", classes="section-label first")
                yield Button("Collect registry", id="run-pipeline", variant="primary")
                yield Button("Clean data", id="clean-pipeline")
                yield Button(
                    "Prepare all",
                    id="prepare-pipeline",
                    classes="impact",
                    disabled=not self._orchestrator.preparation_available,
                )
                yield Button("Cancel", id="cancel-pipeline", disabled=True)
                yield Button("Reset registry data", id="run-reset")
                yield Label("Data", classes="section-label")
                yield Label("— startups", id="stat-entities-val", classes="muted")
                yield Label("Last run: unknown", id="stat-status-val", classes="muted")
                yield Label("Groq", classes="section-label")
                yield Static("Loading…", id="run-profiles-summary", classes="muted", markup=False)
                yield Label("Runs", classes="section-label")
                yield Input(placeholder="Filter runs…", id="history-search")
                yield DataTable(id="history-list", cursor_type="row", zebra_stripes=True)
            with Vertical(id="run-context"):
                with Horizontal(id="run-context-header"):
                    yield Label("Run", classes="heading", id="run-heading")
                    yield Button("Open Review", id="view-records")
                with Horizontal(classes="run-statusbar"):
                    yield Static("Ready", id="run-status", markup=False)
                    yield Static("", id="run-elapsed", classes="muted", markup=False)
                yield Static("", id="run-resources", classes="muted", markup=False)
                yield RunTimeline(id="run-timeline")
                with Vertical(id="run-activity"):
                    yield LogsPane()

    def on_mount(self) -> None:
        self.query_one("#cancel-pipeline").display = False
        self._timer = self.set_interval(1, self._tick, pause=True)
        self.run_worker(self._update_stats(), exit_on_error=False)
        self.run_worker(self._load_profile_summary(), exit_on_error=False)
        self.run_worker(self.refresh_runs(), exit_on_error=False)

    # ---- left column: summaries ----

    async def _load_profile_summary(self) -> None:
        try:
            rows = await self._database.profile_overview() if self._database else []
        except (turso.Error, RuntimeError, LookupError):
            rows = []
        configured = {
            entry["name"]: entry for entry in self._orchestrator.preparation_profiles
        }
        if not configured and self._profiles_warning:
            summary = f"Profiles unavailable: {self._profiles_warning}"
        elif not configured and not rows:
            summary = "No Groq profile. Add one to dataops/.env.profiles.toml."
        else:
            # The TOML file is the truth; stored rows only add the disabled state.
            names = list(configured) or [row["name"] for row in rows]
            disabled = sum(
                1 for row in rows if row["name"] in names and row.get("disabled")
            )
            summary = f"{len(names)} profile{'' if len(names) == 1 else 's'}"
            if disabled:
                summary += f" · {disabled} disabled (key rejected)"
            if len(names) <= 2:
                summary += f" · {', '.join(names)}"
            else:
                summary += f" · {names[0]}, {names[1]} …"
        self.query_one("#run-profiles-summary", Static).update(summary)

    async def _update_stats(self) -> None:
        if self._database is None:
            return
        try:
            stats = await self._database.get_overview_stats()
            snapshots = stats["snapshots"]
            self.query_one("#stat-entities-val", Label).update(
                f"{stats['entities']} startups · {snapshots} snapshot{'' if snapshots == 1 else 's'}"
            )
            self._set_collection_status("running" if self.collecting else stats["status"])
        except (turso.Error, RuntimeError, ValueError, LookupError, NoMatches) as exc:
            with suppress(NoMatches):
                self.query_one("#stat-entities-val", Label).update("— startups · unavailable")
                self.query_one("#stat-status-val", Label).update("Last run: UNKNOWN (could not read)")
            self.app.log_workspace_event(
                f"Could not load collection summary: {exc}", "error"
            )

    # ---- left column: saved runs ----

    async def refresh_runs(self) -> None:
        """Reload the saved runs; keep the selection when it is still listed."""
        if self._database is None:
            return
        try:
            runs = await self._database.list_recent_runs(limit=50)
        except (turso.Error, RuntimeError) as exc:
            self.app.log_workspace_event(f"Could not load saved runs: {describe_error(exc)}", "error")
            return
        self._runs = [run for run in runs if self._run_matches(run)]
        listing = self.query_one("#history-list", DataTable)
        if not listing.columns:
            listing.add_column(Text("Operation"), width=8, key="operation")
            listing.add_column(Text("Status"), width=9, key="status")
            listing.add_column(Text("Started"), width=11, key="started")
            listing.add_column(Text("Rows"), width=4, key="rows")
        listing.clear()
        for run in self._runs:
            status = str(run.get("status") or "unknown").lower()
            listing.add_row(
                Text(_OPERATION_NAMES.get(str(run.get("operation") or ""), "Unknown")),
                Text(_RUN_STATUS_WORDS.get(status, status), style=self._status_style(status)),
                Text(_short_time(run.get("started_at"))[5:]),
                Text(str(run.get("records_processed", 0)), justify="right"),
                key=run["id"],
            )
        if self._shown_run and not self.collecting:
            index = next((i for i, run in enumerate(self._runs) if run["id"] == self._shown_run), None)
            if index is not None:
                listing.move_cursor(row=index, animate=False)

    def _status_style(self, status: str) -> str:
        palette = palette_for(self.app)
        return {
            "completed": palette.success, "failed": palette.error, "cancelled": palette.warning,
            "running": palette.variables["link-ink"],
        }.get(status, palette.variables["muted"])

    def _run_matches(self, run: dict[str, Any]) -> bool:
        if not self._runs_query:
            return True
        haystack = " ".join(
            str(run.get(key) or "") for key in ("operation", "status", "started_at", "error")
        ).lower()
        return self._runs_query in haystack

    @on(Input.Changed, "#history-search")
    def filter_runs(self, event: Input.Changed) -> None:
        self._runs_query = event.value.strip().lower()
        self.run_worker(self.refresh_runs(), exclusive=True, group="runs", exit_on_error=False)

    @on(DataTable.RowHighlighted, "#history-list")
    async def highlight_run(self, event: DataTable.RowHighlighted) -> None:
        run_id = event.row_key.value if event.row_key is not None else None
        if run_id and run_id != self._shown_run and not self.collecting:
            await self.show_saved_run(run_id)

    async def show_saved_run(self, run_id: str) -> None:
        """Put a saved run on the right: header, outcome line, timeline, its events."""
        if self._database is None:
            return
        try:
            run = await self._database.get_run_row(run_id)
            steps = await self._database.get_run_steps(run_id)
        except (turso.Error, RuntimeError) as exc:
            self._set_status(f"Could not load run {run_id[:8]}: {describe_error(exc)}", "error")
            return
        if run is None:
            self._set_status(f"Run {run_id[:8]} was not found.", "error")
            return
        self._shown_run = run_id
        operation = _OPERATION_NAMES.get(str(run.get("operation") or ""), "Unknown")
        status = str(run.get("status") or "unknown")
        self.query_one("#run-heading", Label).update(f"Run {run_id[:8]} · {operation}")
        tone = {"completed": "success", "failed": "error", "cancelled": "warning"}.get(status, "")
        line = (
            f"{status.upper()} · {run.get('records_processed', 0)} records · "
            f"{run.get('review_count', 0)} in review · started {_short_time(run.get('started_at'))}"
        )
        error = run.get("error")
        if error:
            line += f" · {sanitize_display(str(error))}"
        self._set_status(line, tone)
        seconds = _duration(run.get("started_at"), run.get("completed_at"))
        self.query_one("#run-elapsed", Static).update(
            f"Took {format_elapsed(seconds)}" if seconds is not None else ""
        )
        self.query_one("#run-resources", Static).update("")
        timeline = self._timeline()
        timeline.set_steps([(step["step_name"], step["step_name"]) for step in steps])
        for step in steps:
            timeline.update(
                StageProgress(
                    step["step_name"],
                    step["status"] if step["status"] in ("running", "completed", "failed", "cancelled") else "running",
                    step.get("message") or "",
                    step.get("items_processed") or 0,
                    run_id,
                ),
                _duration(step.get("started_at"), step.get("completed_at")),
            )
        self._logs().set_step_filter(None)
        self._logs().set_run_filter(run_id)

    # ---- operations ----

    @on(Button.Pressed, "#run-pipeline")
    def start_collection(self) -> None:
        self._begin_flow(False)

    @on(Button.Pressed, "#clean-pipeline")
    def start_cleaning(self) -> None:
        self._begin_flow(True)

    @on(Button.Pressed, "#run-reset")
    def confirm_registry_reset(self) -> None:
        if self.collecting or self._resetting or self._orchestrator.running:
            self._set_status("Wait for the current operation before resetting.", "warning")
            return
        self.app.push_screen(
            WipeConfirmScreen(registry_only=True), self._reset_registry_confirmed
        )

    async def _reset_registry_confirmed(self, confirmed: bool | None) -> None:
        if not confirmed:
            return
        if self.collecting or self._resetting or self._orchestrator.running:
            self._set_status("Wait for the current operation before resetting.", "warning")
            return
        self._resetting = True
        self._set_running(False)
        self._set_status("Resetting registry data…", "warning")
        error: str | None = None
        deleted = 0
        try:
            deleted = await self._orchestrator.reset_registry_data()
        except (RuntimeError, ValueError, LookupError, turso.Error) as exc:
            error = describe_error(exc)
        finally:
            self._resetting = False
            self._set_running(False)
            await self._update_stats()
        if error is not None:
            self._set_status(f"Reset failed: {error}", "error")
            self.app.set_workspace_status("FAILED · Reset registry data", "error")
            return
        self._terminal_status = None
        self._terminal_text = None
        self._stage_starts.clear()
        self._metrics.clear()
        self._running_stage = None
        self._run_id = None
        self._shown_run = None
        self._timeline().set_steps([])
        self._logs().set_run_filter(None)
        self._logs().set_step_filter(None)
        self.query_one("#run-heading", Label).update("Run")
        for selector in ("#run-elapsed", "#run-resources"):
            self.query_one(selector, Static).update("")
        self._set_status(
            f"Registry data reset · {deleted} rows deleted. Run Collect registry to start again.",
            "success",
        )
        self.app.set_workspace_status("Registry data reset · ready to collect", "success")
        self.post_message(self.RegistryReset(deleted))
        await self.refresh_runs()
        self.query_one("#run-pipeline", Button).focus()

    @on(Button.Pressed, "#prepare-pipeline")
    async def start_preparation(self) -> None:
        if self.collecting or self._resetting:
            return
        self._set_status("Loading the Prepare preview…", "")
        try:
            preview = await self._orchestrator.preparation_preview()
        except (RuntimeError, ValueError, LookupError, turso.Error) as exc:
            self._set_status(f"Could not load the Prepare preview: {describe_error(exc)}", "error")
            return
        # preview() seeds registered profiles; refresh the summary to match.
        self.run_worker(self._load_profile_summary(), exit_on_error=False)
        if not preview["available"]:
            self._set_status("No Groq profile. Add one to dataops/.env.profiles.toml.", "warning")
            return
        self._set_status("Review the preview, then confirm to start model calls.", "warning")
        self.app.push_screen(PrepareConfirmScreen(preview), self._prepare_confirmed)

    def _prepare_confirmed(self, confirmed: bool | None) -> None:
        if confirmed:
            self._begin_flow(False, preparing=True)
            return
        self._set_status("Prepare cancelled before any model call.", "warning")
        self.query_one("#prepare-pipeline", Button).focus()

    def _begin_flow(self, cleaning: bool, preparing: bool = False) -> None:
        if self.collecting or self._resetting:
            return
        self._terminal_status = None
        self._terminal_text = None
        self._mode = "Prepare" if preparing else "Clean" if cleaning else "Collect"
        self._set_running(True)
        self._shown_run = None
        self.query_one("#run-heading", Label).update(f"Run · {self._mode}")
        self._stage_starts.clear()
        self._metrics.clear()
        self._running_stage = None
        self._run_id = None
        self._flow_start = monotonic()
        steps = (
            PREPARE_STEPS if preparing else CLEAN_STEPS if cleaning else COLLECT_STEPS
        )
        self._timeline().set_steps(steps)
        self._logs().set_run_filter(None)
        self._logs().set_step_filter(None)
        self.query_one("#run-resources", Static).update("")
        self._set_status("Loading stored rows…" if cleaning else "Connecting…")
        self.app.set_workspace_status(f"RUNNING · {self._mode}", "warning")
        self._timer.resume()
        self._tick()
        self._collection_worker = self.run_worker(
            self._collect(cleaning, preparing), group="collection", exit_on_error=False
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
        self.app.action_navigate("review")

    @on(RunTimeline.StepSelected)
    def _step_selected(self, event: RunTimeline.StepSelected) -> None:
        self._logs().set_step_filter(None if event.step_name == "all" else event.step_name)

    async def stop_collection(self) -> None:
        """Await the worker's cancellation cleanup before services are closed."""
        if self._collection_worker is not None and self.collecting:
            if not self._collection_worker.is_cancelled:
                self._collection_worker.cancel()
            try:
                await asyncio.wait_for(self._collection_worker.wait(), timeout=3)
            except (WorkerCancelled, TimeoutError, asyncio.CancelledError):
                pass
        self._timer.pause()

    def _set_running(self, running: bool) -> None:
        self.collecting = running
        if running:
            workspace_status = (f"RUNNING · {self._mode}", "warning")
        elif self._terminal_status is not None and self._terminal_text is not None:
            workspace_status = (self._terminal_text, self._terminal_status)
        else:
            workspace_status = ("Ready · no active operation", "")
        self.app.set_workspace_status(*workspace_status)
        busy = running or self._resetting
        self.query_one("#run-pipeline", Button).disabled = busy
        self.query_one("#clean-pipeline", Button).disabled = busy
        self.query_one("#prepare-pipeline", Button).disabled = (
            busy or not self._orchestrator.preparation_available
        )
        self.query_one("#run-reset", Button).disabled = busy
        cancel = self.query_one("#cancel-pipeline", Button)
        cancel.disabled = not running
        cancel.display = running
        if running:
            self._set_collection_status("running")

    def _set_collection_status(self, status: str) -> None:
        self._terminal_status = status
        word = _STATUS_WORDS.get(status, "UNKNOWN")
        self.query_one("#stat-status-val", Label).update(f"Last run: {word}")

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#run-status", Static)
        status.update(text)
        status.set_classes(state)

    def on_theme_changed(self) -> None:
        self._timeline().on_theme_changed()
        self._logs().on_theme_changed()

    def _append(self, entry: LogEntry) -> None:
        self._logs().add_entry(entry)

    def _sample(self):
        return self._sampler.sample() if self._sampler else None

    def _tick(self) -> None:
        if not self.collecting:
            return
        self.query_one("#run-elapsed", Static).update(
            f"Elapsed {format_elapsed(monotonic() - self._flow_start)}"
        )
        if self._running_stage:
            self._measure_step(self._running_stage)

    def _measure_step(self, name: str) -> str:
        metrics = self._metrics[name]
        sample = self._sample()
        metrics.observe(sample)
        elapsed = monotonic() - self._stage_starts[name]
        self._timeline().tick(name, elapsed, metrics)
        rss = "—" if sample is None else f"{sample.rss_bytes / 1024**2:.1f} MiB"
        self.query_one("#run-resources", Static).update(
            f"This process · {metrics.label()} · memory {rss}"
        )
        return format_elapsed(elapsed)

    def _progress(self, progress: StageProgress) -> None:
        name = progress.stage_name
        self._run_id = progress.run_id
        if progress.status == "running" and name != self._running_stage:
            self._stage_starts[name] = monotonic()
            sample = self._sample()
            self._metrics[name] = StepMetrics(sample)
            self._metrics[name].observe(sample)
            self._running_stage = name
        details = self._measure_step(name) if name in self._metrics else ""
        self._timeline().update(progress)
        message = progress.message
        if progress.status != "running":
            if details:
                message += f" · {details}"
            self._running_stage = None
        self._append(
            LogEntry.create(message, progress.status, run_id=progress.run_id, step=name)
        )
        self._set_status(
            progress.message,
            {"failed": "error", "cancelled": "warning", "completed": "success"}.get(
                progress.status, ""
            ),
        )

    def _failed(self, error: str, mode: str) -> None:
        self._set_collection_status("failed")
        self._set_status(f"{mode} failed: {sanitize_display(error)}", "error")
        self._terminal_text = f"FAILED · {mode}"
        self.app.set_workspace_status(f"FAILED · {mode}", "error")
        self._append(LogEntry.create(error, "failed", run_id=self._run_id, step=self._running_stage))

    async def _collect(self, cleaning: bool, preparing: bool = False) -> None:
        if preparing:
            mode, operation = "Prepare", self._orchestrator.run_preparation
        elif cleaning:
            mode, operation = "Clean", self._orchestrator.run_clean_pipeline
        else:
            mode, operation = "Collect", self._orchestrator.run_pipeline
        try:
            result = await operation(self._progress)
            self._set_collection_status(result.status)
            if result.status == "completed":
                summary = (
                    f"{result.records_processed} records · {result.review_count} in review"
                )
                self._set_status(f"{mode} completed · {summary}", "success")
                self._terminal_text = f"COMPLETED · {summary}"
                self.app.set_workspace_status(f"COMPLETED · {summary}", "success")
                self.post_message(self.CollectionFinished())
            else:
                self._failed(result.error or f"{mode} failed", mode)
        except asyncio.CancelledError:
            try:
                self._set_collection_status("cancelled")
                self._set_status("Cancelled · stored rows are kept.", "warning")
                self._terminal_text = "CANCELLED · stored rows kept"
                self.app.set_workspace_status("CANCELLED · stored rows kept", "warning")
            except NoMatches:
                pass
            raise
        except (httpx.HTTPError, OSError, RuntimeError, ValueError, TypeError, LookupError, NoMatches, turso.Error) as exc:
            self._failed(str(exc), mode)
        finally:
            self._timer.pause()
            self._running_stage = None
            if not self.app._exit:
                try:
                    self._tick()
                    self.query_one("#run-resources", Static).update("")
                    cancel_focused = self.query_one("#cancel-pipeline").has_focus
                    self._set_running(False)
                    if cancel_focused:
                        target = (
                            "#view-records"
                            if self._terminal_status == "completed"
                            else "#run-pipeline"
                        )
                        self.query_one(target, Button).focus()
                except NoMatches:
                    pass
                self._shown_run = self._run_id
                await self._update_stats()
                await self._load_profile_summary()
                await self.refresh_runs()

    async def refresh_overview(self) -> None:
        """Re-read overview stats after external data changes."""
        await self._update_stats()
