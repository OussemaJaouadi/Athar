"""Collect/clean controls, step inspection, session metrics, and stored summaries."""

import asyncio
from contextlib import suppress
from time import monotonic

import httpx
import turso
from textual import on
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.css.query import NoMatches
from textual.message import Message
from textual.widgets import Button, Collapsible, Label, Static
from textual.worker import Worker, WorkerCancelled

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.schemas.pipeline import StageProgress
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.metrics import ProcessSampler, StepMetrics
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.ui.panes.logs_pane import LogsPane
from athar_dataops.ui.widgets.log_view import LogView
from athar_dataops.ui.widgets.metric_card import MetricCard
from athar_dataops.ui.widgets.run_timeline import RunTimeline, format_elapsed

COLLECT_STEPS = [
    ("fetch", "Acquire snapshot & hash"),
    ("preserve", "Preserve source rows"),
    ("normalize", "Normalize & validate"),
    ("resolve", "Resolve identities & commit"),
]
CLEAN_STEPS = [
    ("load", "Load stored evidence"),
    ("normalize", "Normalize records"),
    ("reconcile", "Reconcile corpus & commit"),
]
PREPARE_STEPS = [("load", "Load descriptions"), ("prepare", "Prepare text")]


def _build_step_titles() -> dict[str, str]:
    """Unique fallback titles; operation-specific titles live on the active step list."""
    titles: dict[str, str] = {}
    for name, title in (*COLLECT_STEPS, *CLEAN_STEPS, *PREPARE_STEPS):
        titles.setdefault(name, title)
    titles.update(
        collect="Collect registry",
        save="Save records",
        commit="Commit run",
        parse="Parse source",
    )
    return titles


_STEP_TITLES = _build_step_titles()


class RunPane(VerticalScroll):
    class CollectionFinished(Message):
        """Refresh inspection after committed collection or cleaning."""

    def __init__(
        self,
        orchestrator: PipelineOrchestrator,
        database: DatabaseService | None = None,
        sampler: ProcessSampler | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._orchestrator = orchestrator
        self._database = database
        self._sampler = sampler
        self._collection_worker: Worker | None = None
        self.collecting = False
        self._stage_logs: dict[str, list[LogEntry]] = {"all": []}
        self._stage_starts: dict[str, float] = {}
        self._metrics: dict[str, StepMetrics] = {}
        self._running_stage: str | None = None
        self._flow_start = 0.0
        self._viewing_run_id: str | None = None
        self._run_id: str | None = None
        self._view_generation = 0
        self._terminal_status: str | None = None
        self._terminal_text: str | None = None
        self._prepare_preview: dict | None = None
        self._prepare_confirming = False
        self._active_step_titles: dict[str, str] = dict(COLLECT_STEPS)

    def _timeline(self) -> RunTimeline:
        return self.query_one(RunTimeline)

    def compose(self):
        with Horizontal(id="run-metrics"):
            yield MetricCard(
                "Saved Entities", "—", "Registered startups", card_id="stat-entities"
            )
            yield MetricCard(
                "Source Snapshots", "—", "Raw JSON archives", card_id="stat-snapshots"
            )
            yield MetricCard("Collection", "—", "Last run", card_id="stat-status")
        with Horizontal(id="run-workspace"):
            with VerticalScroll(id="run-operations"):
                yield Label("Operations", classes="heading")
                yield Static("Choose an operation, then inspect its result in the activity panel.", classes="muted")
                with Horizontal(classes="actions", id="run-primary-actions"):
                    yield Button("Collect registry", id="run-pipeline", variant="primary")
                    yield Button("Clean stored data", id="clean-pipeline")
                with Horizontal(classes="actions", id="run-impact-actions"):
                    yield Button("Prepare all", id="prepare-pipeline", classes="impact", disabled=not self._orchestrator.preparation_available)
                    yield Button("Cancel", id="cancel-pipeline", disabled=True)
                yield Label("Groq provider", classes="section-label")
                yield Static("Loading profile information…", id="run-profiles-summary", classes="muted")
            with VerticalScroll(id="run-context"):
                with Horizontal(id="run-context-header"):
                    yield Label("Current run", classes="heading")
                    yield Button("Open Records", id="view-records")
                    yield Button("Open History", id="view-history")
                with Horizontal(classes="run-statusbar"):
                    yield Static("Ready", id="run-status", markup=False)
                    yield Static("", id="run-elapsed", classes="muted", markup=False)
                with Horizontal(id="run-meta"):
                    yield Static("", id="run-counters", markup=False)
                    yield Static("", id="run-resources", classes="muted", markup=False)
                with Vertical(id="prepare-preview"):
                    yield Static("Select Prepare all to review the work before any model call.", id="prepare-preview-body", classes="muted")
                    with Horizontal(classes="actions"):
                        yield Button("Confirm Prepare all", id="prepare-confirm", variant="primary", disabled=True)
                        yield Button("Cancel preview", id="prepare-cancel")
                yield RunTimeline(id="run-timeline")
                with Collapsible(title="Activity & step details", collapsed=True, id="run-activity"):
                    yield Static("All steps", id="run-log-title", classes="muted", markup=False)
                    yield LogView(id="run-log")

    def on_mount(self) -> None:
        self.query_one("#cancel-pipeline").display = False
        self.query_one("#run-activity").display = False
        self.query_one("#prepare-preview").display = False
        self.query_one("#run-profiles-summary").display = True
        self.query_one("#prepare-confirm").disabled = True
        self.query_one("#prepare-cancel").display = False
        self._timer = self.set_interval(1, self._tick, pause=True)
        self.run_worker(self._update_stats(), exit_on_error=False)
        self.run_worker(self._load_profile_summary(), exit_on_error=False)

    async def _load_profile_summary(self) -> None:
        try:
            rows = await self._database.profile_overview() if self._database else []
        except (turso.Error, RuntimeError, LookupError):
            rows = []
        configured = {
            entry["name"]: entry for entry in self._orchestrator.preparation_profiles
        }
        if not configured and not rows:
            summary = "No Groq profiles configured"
        else:
            names = list(configured) or [row["name"] for row in rows]
            active = sum(
                1
                for row in rows
                if row["name"] in configured and not row.get("disabled")
            )
            summary = f"{len(names)} profile{'s' if len(names) != 1 else ''} · {active} active"
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
            self.query_one("#stat-entities", MetricCard).set_value(
                str(stats["entities"]), "Registered startups"
            )
            self.query_one("#stat-snapshots", MetricCard).set_value(
                str(stats["snapshots"]), "Raw source archives"
            )
            self._set_collection_status(
                "running" if self.collecting else stats["status"]
            )
        except (turso.Error, RuntimeError, ValueError, LookupError, NoMatches) as exc:
            with suppress(NoMatches):
                for key in ("entities", "snapshots"):
                    self.query_one(f"#stat-{key}", MetricCard).set_value(
                        "—", "Unavailable"
                    )
                self.query_one("#stat-status", MetricCard).set_value(
                    "UNKNOWN", "Could not read last run"
                )
            self.app.log_workspace_event(
                f"Could not load collection summary: {exc}", "error"
            )

    @on(Button.Pressed, "#run-pipeline")
    def start_collection(self) -> None:
        self._begin_flow(False)

    @on(Button.Pressed, "#clean-pipeline")
    def start_cleaning(self) -> None:
        self._begin_flow(True)

    @on(Button.Pressed, "#prepare-pipeline")
    async def start_preparation(self) -> None:
        if self.collecting:
            return
        preview = self.query_one("#prepare-preview")
        preview.display = True
        self.query_one("#prepare-preview-body", Static).update("Loading preparation preview…")
        self.query_one("#prepare-confirm", Button).disabled = True
        self._set_status("Loading preparation preview…", "")
        await self._load_prepare_preview()

    async def _load_prepare_preview(self) -> None:
        try:
            preview_data = await self._orchestrator.preparation_preview()
        except (RuntimeError, ValueError, LookupError, turso.Error) as exc:
            self._set_status(f"Could not load preparation preview: {exc}", "error")
            return
        self._prepare_preview = preview_data
        body = self.query_one("#prepare-preview-body", Static)
        self.query_one("#prepare-preview").display = True
        if not preview_data["available"]:
            body.update("Preparation unavailable: no Groq profile is configured.")
            self._set_status("Preparation unavailable", "warning")
            return
        profiles = "\n".join(
            f"  {entry['name']} · {entry['model']} · key {entry['fingerprint']}"
            for entry in preview_data["profiles"]
        )
        body.update(
            f"Prepare all eligible descriptions?\n\n"
            f"Eligible descriptions: {preview_data['eligible']}\n"
            f"Uncached model calls: {preview_data['uncached']}\n"
            f"Cached descriptions: {preview_data['cached']}\n\n"
            f"Profiles:\n{profiles}\n\n"
            f"Provider limits are operational safeguards, not Athar user quotas. "
            f"Cancelled or stopped work keeps saved results."
        )
        self.query_one("#prepare-confirm", Button).disabled = preview_data["uncached"] == 0
        self.query_one("#prepare-cancel", Button).display = True
        self._set_status("Review the preparation preview before starting model calls.", "warning")
        self.query_one("#prepare-confirm", Button).focus()

    @on(Button.Pressed, "#prepare-confirm")
    def confirm_preparation(self) -> None:
        if self._prepare_preview is None or not self._prepare_preview.get("uncached"):
            return
        self._prepare_preview = None
        self.query_one("#prepare-preview").display = False
        self.query_one("#prepare-confirm", Button).disabled = True
        self._begin_flow(False, preparing=True)

    @on(Button.Pressed, "#prepare-cancel")
    def cancel_prepare_preview(self) -> None:
        self._prepare_preview = None
        self.query_one("#prepare-preview").display = False
        self.query_one("#prepare-confirm", Button).disabled = True
        self._set_status("Preparation cancelled before any model call.", "warning")
        self.query_one("#prepare-pipeline", Button).focus()

    def _begin_flow(self, cleaning: bool, preparing: bool = False) -> None:
        if self.collecting:
            return
        self._view_generation += 1
        self._terminal_status = None
        self._terminal_text = None
        self._set_running(True)
        self.query_one("#run-activity").display = True
        self.query_one("#run-activity", Collapsible).collapsed = False
        self._stage_logs = {"all": []}
        self._stage_starts.clear()
        self._metrics.clear()
        self._running_stage = None
        self._viewing_run_id = self._run_id = None
        self._flow_start = monotonic()
        steps = (
            PREPARE_STEPS if preparing else CLEAN_STEPS if cleaning else COLLECT_STEPS
        )
        self._active_step_titles = dict(steps)
        self._timeline().set_steps(steps)
        self._render_log("all")
        self.query_one("#run-counters", Static).update("")
        self.query_one("#run-resources", Static).update("App process · CPU — · RSS —")
        self._set_status("Loading stored evidence…" if cleaning else "Connecting…")
        self.app.set_workspace_status(
            f"RUNNING · {('Preparation' if preparing else 'Cleaning' if cleaning else 'Collection')}",
            "warning",
        )
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
        self.app.action_navigate("inspect")

    @on(Button.Pressed, "#view-history")
    def view_history(self) -> None:
        self.app.action_navigate("history")

    @on(RunTimeline.StepSelected)
    def _step_selected(self, event: RunTimeline.StepSelected) -> None:
        self._render_log(event.step_name)

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
            workspace_status = ("RUNNING · operation in progress", "warning")
        elif self._terminal_status is not None and self._terminal_text is not None:
            workspace_status = (self._terminal_text, self._terminal_status)
        else:
            workspace_status = ("Ready · no active operation", "")
        self.app.set_workspace_status(*workspace_status)
        self.query_one("#run-pipeline", Button).disabled = running
        self.query_one("#clean-pipeline", Button).disabled = running
        self.query_one("#prepare-pipeline", Button).disabled = (
            running or not self._orchestrator.preparation_available
        )
        cancel = self.query_one("#cancel-pipeline", Button)
        cancel.disabled = not running
        cancel.display = running
        if running:
            self._set_collection_status("running")

    def _set_collection_status(self, status: str) -> None:
        self._terminal_status = status
        labels = {
            "idle": "NOT RUN",
            "running": "RUNNING",
            "completed": "COMPLETED",
            "failed": "FAILED",
            "cancelled": "CANCELLED",
        }
        self.query_one("#stat-status", MetricCard).set_value(
            labels.get(status, "UNKNOWN"), "Last run"
        )

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#run-status", Static)
        status.update(text)
        status.set_classes(state)

    def _render_log(self, step_name: str) -> None:
        if step_name == "all":
            title = "All steps"
        else:
            title = self._active_step_titles.get(
                step_name, _STEP_TITLES.get(step_name, step_name)
            )
        if self._viewing_run_id:
            title += " · stored summary"
        self.query_one("#run-log-title", Static).update(title)
        self.query_one(LogView).render_log(self._stage_logs.get(step_name, []))

    def on_theme_changed(self) -> None:
        self._timeline().on_theme_changed()
        self._render_log(self._timeline().selected)

    def _append(self, entry: LogEntry) -> None:
        self._stage_logs["all"].append(entry)
        if entry.step:
            self._stage_logs.setdefault(entry.step, []).append(entry)
        if self._timeline().selected in ("all", entry.step):
            self.query_one(LogView).write_entry(entry)
        self.app.query_one(LogsPane).add_entry(entry)

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
        self._timeline().tick(name, elapsed, metrics.label())
        rss = "—" if sample is None else f"{sample.rss_bytes / 1024**2:.1f} MiB"
        self.query_one("#run-resources", Static).update(
            f"App process during step · {metrics.label()} · RSS {rss}"
        )
        return f"{format_elapsed(elapsed)} · {metrics.label()}"

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
            self.query_one("#run-counters", Static).update(
                f"{progress.items_processed} rows"
            )
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
        self._set_status(f"{mode} failed. Open Logs for details and recovery.", "error")
        self._terminal_text = f"FAILED · {mode}"
        self.app.set_workspace_status(f"FAILED · {mode}", "error")

        if (
            not self._stage_logs["all"]
            or self._stage_logs["all"][-1].status != "failed"
        ):
            self._append(
                LogEntry.create(
                    error, "failed", run_id=self._run_id, step=self._running_stage
                )
            )
        self.query_one("#run-activity", Collapsible).collapsed = False

    async def _collect(self, cleaning: bool, preparing: bool = False) -> None:
        mode = "Preparation" if preparing else "Cleaning" if cleaning else "Collection"
        try:
            operation = (
                self._orchestrator.run_preparation if preparing else self._orchestrator.run_clean_pipeline
                if cleaning or preparing
                else self._orchestrator.run_pipeline
            )
            result = await operation(self._progress)
            self._set_collection_status(result.status)
            if result.status == "completed":
                summary = (
                    f"{result.records_processed} records · {result.review_count} review"
                )
                self._set_status(summary, "success")
                self._terminal_text = f"COMPLETED · {summary}"
                self.app.set_workspace_status(
                    f"COMPLETED · {summary}", "success"
                )
                self.query_one("#run-counters", Static).update(summary)
                self.post_message(self.CollectionFinished())
            else:
                self._failed(result.error or f"{mode} failed", mode)
        except asyncio.CancelledError:
            try:
                self._set_collection_status("cancelled")
                self._set_status("Cancelled. Stored evidence kept.", "warning")
                self._terminal_text = "CANCELLED · stored evidence kept"
                self.app.set_workspace_status("CANCELLED · stored evidence kept", "warning")
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
                await self._update_stats()

    async def refresh_overview(self) -> None:
        """Re-read overview stats after external data changes."""
        await self._update_stats()
