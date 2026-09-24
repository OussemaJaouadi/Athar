"""Persisted pipeline run history and step inspection."""

from __future__ import annotations

from datetime import datetime

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Input, Label, ListItem, ListView, Static

from athar_dataops.services.database import DatabaseService


class HistoryPane(Vertical):
    """Browse persisted runs without coupling them to live Run state."""

    def __init__(self, database: DatabaseService | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._database = database
        self._selected_run: str | None = None
        self._query = ""

    def compose(self) -> ComposeResult:
        with Horizontal(id="history-header"):
            with Vertical(id="history-title"):
                yield Label("Run history", classes="heading")
                yield Static(
                    "Persisted collection, cleaning, and preparation runs.",
                    id="history-subtitle",
                    classes="muted",
                )
            yield Static("Loading…", id="history-status", classes="chip")
            yield Button("Refresh", id="history-refresh")
        with Horizontal(id="history-toolbar"):
            yield Input(placeholder="Filter runs by operation or status", id="history-search")
        with Horizontal(id="history-body"):
            with VerticalScroll(id="history-rail"):
                yield Label("RUNS", classes="section-label")
                yield ListView(id="history-list")
            with VerticalScroll(id="history-detail"):
                yield Label("No run selected", id="history-detail-title", classes="heading")
                yield Static(
                    "Select a run to inspect its outcome and step details.",
                    id="history-detail-body",
                    classes="muted",
                )

    async def on_mount(self) -> None:
        await self.refresh_runs()

    async def refresh_runs(self) -> None:
        if self._database is None:
            self._set_status("Unavailable", "error")
            return
        self._set_status("Loading…", "warning")
        try:
            runs = await self._database.list_recent_runs(limit=50)
        except Exception as exc:
            self._set_status("Unavailable", "error")
            self.query_one("#history-detail-body", Static).update(
                f"Could not load run history: {exc}\n\nPress Refresh to try again."
            )
            return
        filtered = [run for run in runs if self._matches(run)]
        listing = self.query_one("#history-list", ListView)
        await listing.clear()
        for run in filtered:
            status = str(run.get("status") or "unknown").lower()
            item = ListItem(
                Label(self._operation(run), classes="history-item-title"),
                Label(self._metrics(run), classes="history-item-meta"),
            )
            item.data = run["id"]
            item.add_class(f"history-{status}")
            await listing.append(item)
        self._set_status(f"{len(filtered)} / {len(runs)} runs")
        if not filtered:
            self.query_one("#history-detail-title", Label).update("No matching runs")
            self.query_one("#history-detail-body", Static).update(
                "No persisted runs match this filter."
                if runs
                else "No persisted runs yet. Start a collection or cleaning operation."
            )
            return
        if self._selected_run:
            index = next(
                (index for index, run in enumerate(filtered) if run["id"] == self._selected_run),
                None,
            )
            if index is not None:
                listing.index = index
                await self._show_run(self._selected_run)
                return
            self._selected_run = None
        if filtered:
            self._selected_run = filtered[0]["id"]
            listing.index = 0
            listing.focus()
            await self._show_run(self._selected_run)

    def _matches(self, run: dict) -> bool:
        if not self._query:
            return True
        haystack = " ".join(
            str(run.get(key) or "")
            for key in ("operation", "status", "started_at", "error")
        ).lower()
        return self._query in haystack

    def _operation(self, run: dict) -> str:
        operation = str(run.get("operation") or "unknown").replace("_", " ").title()
        status = str(run.get("status") or "unknown").upper()
        return f"{operation} · {status}"

    def _metrics(self, run: dict) -> str:
        return (
            f"{_short_time(run.get('started_at'))}  ·  "
            f"{run.get('records_processed', 0)} records  ·  "
            f"{run.get('review_count', 0)} review"
        )

    async def _restore_selection(self, runs: list[dict]) -> None:
        listing = self.query_one("#history-list", ListView)
        for index, run in enumerate(runs):
            if run["id"] == self._selected_run:
                listing.index = index
                return

    @on(Button.Pressed, "#history-refresh")
    def refresh_button(self) -> None:
        self.run_worker(self.refresh_runs(), exclusive=True, group="history", exit_on_error=False)

    @on(Input.Changed, "#history-search")
    def filter_runs(self, event: Input.Changed) -> None:
        self._query = event.value.strip().lower()
        self.run_worker(self.refresh_runs(), exclusive=True, group="history-filter", exit_on_error=False)

    @on(ListView.Highlighted, "#history-list")
    async def highlight_run(self, event: ListView.Highlighted) -> None:
        run_id = getattr(event.item, "data", None)
        if run_id and run_id != self._selected_run:
            self._selected_run = run_id
            await self._show_run(run_id)

    @on(ListView.Selected, "#history-list")
    async def select_run(self, event: ListView.Selected) -> None:
        run_id = getattr(event.item, "data", None)
        if not run_id or self._database is None:
            return
        self._selected_run = run_id
        await self._show_run(run_id)

    async def _show_run(self, run_id: str) -> None:
        self._set_status("Loading run…", "warning")
        try:
            run = await self._database.get_run(run_id)
            steps = await self._database.get_run_steps(run_id)
        except Exception as exc:
            self._set_status("Unavailable", "error")
            self.query_one("#history-detail-body", Static).update(
                f"Could not load run {run_id[:8]}: {exc}"
            )
            return
        self._set_status("Loaded", "success")
        self.query_one("#history-detail-title", Label).update(
            f"Run {run_id[:8]} · {run.operation.replace('_', ' ').title()}"
        )
        lines = [
            f"Outcome: {run.status}",
            f"Started: Unknown time",
            f"Records: {run.records_processed}",
            f"Review items: {run.review_count}",
            f"Snapshot: {run.snapshot_id or 'None'}",
            f"Error: {run.error or 'None'}",
            "",
            "Steps",
        ]
        for index, step in enumerate(steps, 1):
            duration = _duration(step.get("started_at"), step.get("completed_at"))
            lines.append(
                f"{index}. {step['step_name']} · {step['status']} · "
                f"{step['items_processed']} items · {duration}"
            )
            if step.get("message"):
                lines.append(f"   {step['message']}")
        if not steps:
            lines.append("No step details recorded.")
        self.query_one("#history-detail-body", Static).update("\n".join(lines))

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#history-status", Static)
        status.update(text)
        status.set_classes(f"chip {state}" if state else "chip")


def _timestamp(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _short_time(value: str | None) -> str:
    parsed = _timestamp(value)
    return parsed.strftime("%Y-%m-%d %H:%M") if parsed else "Unknown time"



def _duration(started: str | None, completed: str | None) -> str:
    start, end = _timestamp(started), _timestamp(completed)
    return f"{(end - start).total_seconds():.1f}s" if start and end else "Unknown"
