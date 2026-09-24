"""Collect/clean controls, step inspection, session metrics, and stored summaries."""

import asyncio
from datetime import datetime
from time import monotonic

from textual import on
from textual.containers import Horizontal, VerticalScroll
from textual.css.query import NoMatches
from textual.message import Message
from textual.widgets import Button, Collapsible, Label, ListItem, ListView, Static
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
_STEP_TITLES = dict(COLLECT_STEPS + CLEAN_STEPS + PREPARE_STEPS)
_STEP_TITLES.update(
    collect="Collect registry",
    save="Save records",
    commit="Commit run",
    parse="Parse source",
)


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
        yield Label("Startup Tunisia registry", classes="heading")
        yield Static("Collect new records or clean stored evidence.", classes="muted")
        with Horizontal(classes="actions"):
            yield Button("Collect registry", id="run-pipeline", variant="primary")
            yield Button("Clean data", id="clean-pipeline")
            yield Button("Cancel", id="cancel-pipeline", disabled=True)
            yield Button("View records", id="view-records")
        with Horizontal(classes="actions"):
            yield Button("Prepare text", id="prepare-pipeline", disabled=not self._orchestrator.preparation_available)
            yield Static(f"Groq · {self._orchestrator.preparation_marker}", classes="muted", markup=False)
        yield Static("Ready", id="run-status", markup=False)
        with Horizontal(classes="run-statusbar"):
            yield Static("", id="run-elapsed", classes="muted", markup=False)
            yield Static("", id="run-counters", classes="muted", markup=False)
        yield Static("", id="run-resources", classes="muted", markup=False)
        with Collapsible(title="Steps & logs", collapsed=True, id="run-activity"):
            yield RunTimeline(id="run-timeline")
            yield Static("All steps", id="run-log-title", classes="muted", markup=False)
            yield LogView(id="run-log")
        with Collapsible(title="Recent runs", collapsed=True, id="recent-runs"):
            yield ListView(id="recent-runs-list")

    def on_mount(self) -> None:
        self.query_one("#cancel-pipeline").display = False
        self.query_one("#view-records").display = False
        self.query_one("#run-activity").display = False
        self._timer = self.set_interval(1, self._tick, pause=True)
        self.run_worker(self._update_stats(), exit_on_error=False)
        self.run_worker(self._load_recent(), exit_on_error=False)

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
        except Exception as exc:
            for key in ("entities", "snapshots"):
                self.query_one(f"#stat-{key}", MetricCard).set_value("—", "Unavailable")
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
    def start_preparation(self) -> None:
        self._begin_flow(False, preparing=True)

    def _begin_flow(self, cleaning: bool, preparing: bool = False) -> None:
        if self.collecting:
            return
        self._view_generation += 1
        self._set_running(True)
        self.query_one("#view-records").display = False
        self.query_one("#run-activity").display = True
        self.query_one("#run-activity", Collapsible).collapsed = False
        self._stage_logs = {"all": []}
        self._stage_starts.clear()
        self._metrics.clear()
        self._running_stage = None
        self._viewing_run_id = self._run_id = None
        self._flow_start = monotonic()
        self._timeline().set_steps(PREPARE_STEPS if preparing else CLEAN_STEPS if cleaning else COLLECT_STEPS)
        self._render_log("all")
        self.query_one("#run-counters", Static).update("")
        self.query_one("#run-resources", Static).update("App process · CPU — · RSS —")
        self._set_status("Loading stored evidence…" if cleaning else "Connecting…")
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

    @on(RunTimeline.StepSelected)
    def _step_selected(self, event: RunTimeline.StepSelected) -> None:
        self._render_log(event.step_name)

    @on(ListView.Selected, "#recent-runs-list")
    async def _recent_selected(self, event: ListView.Selected) -> None:
        run_id = getattr(event.item, "data", None)
        if self.collecting or not run_id or self._database is None:
            return
        self._view_generation += 1
        generation = self._view_generation
        try:
            steps = await self._database.get_run_steps(run_id)
            run = await self._database.get_run(run_id)
        except Exception as exc:
            self.app.log_workspace_event(f"Could not load run: {exc}", "error")
            return
        if generation != self._view_generation or self.collecting:
            return
        self._stage_logs = {"all": []}
        self._stage_starts.clear()
        self._metrics.clear()
        self._running_stage = None
        self._viewing_run_id = run_id
        self.query_one("#run-activity").display = True
        self.query_one("#run-activity", Collapsible).collapsed = False
        self._timeline().set_steps(
            [
                (s["step_name"], _STEP_TITLES.get(s["step_name"], s["step_name"]))
                for s in steps
            ]
        )
        for step in steps:
            start, end = (
                _timestamp(step["started_at"]),
                _timestamp(step["completed_at"]),
            )
            duration = max(0, (end - start).total_seconds()) if start and end else None
            name = step["step_name"]
            progress = StageProgress(
                name,
                step["status"],
                step["message"] or "",
                step["items_processed"],
                run_id,
            )
            self._timeline().update(progress, duration)
            entry = LogEntry(
                end or start,
                _severity(progress.status),
                progress.message,
                run_id,
                name,
                progress.status,
            )
            self._stage_logs[name] = [entry]
            self._stage_logs["all"].append(entry)
        self._set_status(f"Run {run_id[:8]} · {run.status} · stored summary")
        self.query_one("#run-elapsed", Static).update("")
        self.query_one("#run-counters", Static).update(
            f"{run.records_processed} records · {run.review_count} review"
        )
        self.query_one("#run-resources", Static).update(
            "CPU / memory unavailable · samples are session-only"
        )
        if not steps:
            self._stage_logs["all"].append(
                LogEntry(None, "info", run.error or "No step details recorded.", run_id)
            )
        self._render_log("all")

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
        self.query_one("#prepare-pipeline", Button).disabled = running or not self._orchestrator.preparation_available
        for selector in ("#run-pipeline", "#clean-pipeline", "#recent-runs-list"):
            self.query_one(selector).disabled = running
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
            labels.get(status, "UNKNOWN"), "Last run"
        )

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#run-status", Static)
        status.update(text)
        status.set_classes(state)

    def _render_log(self, step_name: str) -> None:
        title = (
            "All steps"
            if step_name == "all"
            else _STEP_TITLES.get(step_name, step_name)
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
        self._set_status(f"{mode} failed. Check the step log.", "error")
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
                self.query_one("#run-counters", Static).update(summary)
                self.query_one("#view-records").display = True
                self.post_message(self.CollectionFinished())
            else:
                self._failed(result.error or f"{mode} failed", mode)
        except asyncio.CancelledError:
            try:
                self._set_collection_status("cancelled")
                self._set_status("Cancelled. Stored evidence kept.", "warning")
            except NoMatches:
                pass
            raise
        except Exception as exc:
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
                            if self.query_one("#view-records").display
                            else "#run-pipeline"
                        )
                        self.query_one(target, Button).focus()
                except NoMatches:
                    pass
                await self._load_recent()
                await self._update_stats()

    async def refresh_overview(self) -> None:
        """Re-read overview stats and recent runs after external data changes."""
        await self._update_stats()
        await self._load_recent()

    async def _load_recent(self) -> None:
        if self._database is None:
            return
        try:
            runs = await self._database.list_recent_runs(limit=8)
        except Exception as exc:
            self.app.log_workspace_event(f"Could not load recent runs: {exc}", "error")
            return
        listing = self.query_one("#recent-runs-list", ListView)
        await listing.clear()
        for run in runs:
            stamp = (run["started_at"] or "—")[:16]
            summary = f"{stamp} · {run['status']} · {run['records_processed']} records · {run['review_count']} review"
            item = ListItem(Static(summary, markup=False))
            item.data = run["id"]
            await listing.append(item)


def _timestamp(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _severity(status: str) -> str:
    return {"failed": "error", "cancelled": "warning"}.get(status, "stage")
