"""Persisted pipeline run history and step inspection."""

from __future__ import annotations

from datetime import datetime

import turso
from rich.markup import escape
from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Input, Label, ListItem, ListView, Static

from athar_dataops.services.database import DatabaseService
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.arabic import sanitize_display


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
                with Horizontal(id="history-detail-head"):
                    yield Label("No run selected", id="history-detail-title", classes="heading")
                    status = Static("", id="history-run-status", markup=False)
                    status.set_classes("chip")
                    status.display = False
                    yield status
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
        except (turso.Error, RuntimeError) as exc:
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
            f"{_short_time(run.get('started_at'))} · "
            f"{run.get('records_processed', 0)} rec · "
            f"{run.get('review_count', 0)} rev"
        )

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
            run = await self._database.get_run_row(run_id)
            steps = await self._database.get_run_steps(run_id)
        except (turso.Error, RuntimeError) as exc:
            self._set_status("Unavailable", "error")
            self.query_one("#history-detail-body", Static).update(
                f"Could not load run {escape(run_id[:8])}: {escape(str(exc))}"
            )
            return
        if run is None:
            self._set_status("Unavailable", "error")
            self.query_one("#history-detail-body", Static).update(
                f"Run {escape(run_id[:8])} was not found."
            )
            return
        self._set_status("Loaded", "success")
        operation = str(run.get("operation") or "unknown").replace("_", " ").title()
        self.query_one("#history-detail-title", Label).update(
            escape(f"Run {run_id[:8]} · {operation}")
        )
        pal = DARK if self._is_dark() else LIGHT
        status = str(run.get("status") or "unknown")
        outcome_color = {
            "completed": pal.success,
            "failed": pal.error,
            "running": pal.warning,
        }.get(status, pal.warning)
        chip = self.query_one("#history-run-status", Static)
        chip.update(escape(status))
        chip.set_classes(f"chip {_CHIP_CLASSES.get(status, '')}".strip())
        chip.display = True
        lines = [
            f"Outcome: [bold {outcome_color}]{escape(status)}[/]",
            f"Started: {_short_time(run.get('started_at'))}",
            f"Completed: {_short_time(run.get('completed_at'))}",
            (
                f"[dim]Records: {run.get('records_processed', 0)} · "
                f"Review items: {run.get('review_count', 0)}[/]"
            ),
            f"[dim]Snapshot: {escape(str(run.get('snapshot_id') or 'None'))}[/]",
        ]
        error = run.get("error")
        if error:
            lines.append(f"[bold {pal.error}]Error: {escape(sanitize_display(str(error)))}[/]")
        lines.extend(["", "[dim]──── Steps ────[/dim]"])
        step_colors = {
            "completed": pal.success,
            "failed": pal.error,
            "running": pal.warning,
        }
        step_glyphs = {"completed": "✓", "failed": "✗", "running": "●"}
        for index, step in enumerate(steps, 1):
            duration = _duration(step.get("started_at"), step.get("completed_at"))
            step_status = str(step.get("status") or "unknown")
            color = step_colors.get(step_status, pal.variables["muted"])
            glyph = step_glyphs.get(step_status, "○")
            lines.append(
                f"[{color}]{glyph}[/] {index}. {escape(str(step['step_name']))} · "
                f"[{color}]{escape(step_status)}[/] · {step['items_processed']} items · {duration}"
            )
            if step.get("message"):
                lines.append(f"   [dim]{escape(str(step['message']))}[/]")
        if not steps:
            lines.append("[dim]No step details recorded.[/dim]")
        self.query_one("#history-detail-body", Static).update("\n".join(lines))

    def _is_dark(self) -> bool:
        try:
            return getattr(self.app, "theme", "athar-dark") != "athar-light"
        except RuntimeError:
            return True

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#history-status", Static)
        status.update(text)
        status.set_classes(f"chip {state}" if state else "chip")


_CHIP_CLASSES = {"completed": "success", "failed": "error", "running": "warning"}


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
