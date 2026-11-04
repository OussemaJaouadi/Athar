"""Session event log: one strip of filters and search above the stream.

Embedded in the Pipeline tab under the timeline. A step selected on the
timeline and a saved run picked from the runs list narrow the stream further.
"""

from __future__ import annotations

import asyncio
from collections import Counter, deque
from contextlib import suppress
from typing import ClassVar

from rich.text import Text
from textual import events, on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.widgets import Button, Input, RichLog, Static

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.themes import DARK, LIGHT, is_dark_theme
from athar_dataops.ui.log_format import render_entry, severity_color


class LogsPane(Vertical):
    """Severity filters, text search, and the stream, in one block."""

    RAIL_BUTTONS = (
        "filter-all",
        "filter-stage",
        "filter-info",
        "filter-warning",
        "filter-error",
        "toggle-scroll",
        "clear-logs",
    )

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("slash", "focus_search", "Search Logs", show=False),
        Binding("ctrl+f", "focus_search", "Search Logs", show=False),
        Binding("ctrl+l", "clear_console", "Clear", show=False),
        Binding("left", "rail_previous", "Previous filter", show=False),
        Binding("right", "rail_next", "Next filter", show=False),
    ]

    MAX_ENTRIES = 2000
    # A rebuild renders at most this many matching entries; older matches are
    # summarized in one line. Rendering 2000 lines per keystroke was 700 ms.
    REBUILD_LIMIT = 500

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # A bounded deque evicts the oldest entry in O(1); the console keeps its
        # own matching line cap, so a full buffer never triggers a rebuild.
        self._entries: deque[LogEntry] = deque(maxlen=self.MAX_ENTRIES)
        self._level_counts: Counter[str] = Counter()
        self._visible = 0
        self._current_filter: str = "all"
        self._search_query: str = ""
        self._step_filter: str | None = None
        self._run_filter: str | None = None
        self._auto_scroll: bool = True

    def compose(self) -> ComposeResult:
        with Horizontal(id="logs-rail"):
            yield Button("● All (0)", id="filter-all", classes="-active")
            yield Button("● Stages (0)", id="filter-stage")
            yield Button("● Info (0)", id="filter-info")
            yield Button("● Warnings (0)", id="filter-warning")
            yield Button("● Errors (0)", id="filter-error")
            yield Input(placeholder="Search events… (/)", id="logs-search")
            yield Button("Auto-scroll: ON", id="toggle-scroll")
            yield Button("Clear log", id="clear-logs")
        with Vertical(id="logs-stream"):
            yield Static("Events", id="logs-title", classes="muted", markup=False)
            yield Static(
                "No matching events. Clear the search or choose another filter.",
                id="logs-empty",
                classes="muted",
            )
            yield RichLog(
                id="logs-console",
                max_lines=self.MAX_ENTRIES,
                markup=True,
                wrap=True,
                auto_scroll=True,
            )

    def on_mount(self) -> None:
        self.log_entry("Athar DataOps started", "info")
        self._update_stats_bar()

    def action_focus_search(self) -> None:
        self.query_one("#logs-search", Input).focus()

    def action_clear_console(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        self.clear_logs()

    def _rail_index(self, focused) -> int:
        for i, button_id in enumerate(self.RAIL_BUTTONS):
            if focused is not None and focused.id == button_id:
                return i
        return -1

    def action_rail_next(self) -> None:
        self._move_rail_focus(1)

    def action_rail_previous(self) -> None:
        self._move_rail_focus(-1)

    def _move_rail_focus(self, delta: int) -> None:
        if isinstance(self.app.focused, Input):
            # Arrow keys inside the search box must not yank focus to the strip.
            return
        index = self._rail_index(self.app.focused)
        if index < 0:
            index = 0 if delta > 0 else len(self.RAIL_BUTTONS) - 1
        else:
            index = (index + delta) % len(self.RAIL_BUTTONS)
        with suppress(NoMatches):
            self.query_one(f"#{self.RAIL_BUTTONS[index]}", Button).focus()

    def on_key(self, event: events.Key) -> None:
        if event.key == "escape":
            with suppress(NoMatches):
                search_input = self.query_one("#logs-search", Input)
                if search_input.has_focus:
                    event.prevent_default()
                    event.stop()
                    if search_input.value:
                        search_input.value = ""
                    else:
                        self.query_one("#logs-console", RichLog).focus()

    @on(Input.Submitted, "#logs-search")
    def on_search_submitted(self) -> None:
        self.query_one("#logs-console", RichLog).focus()

    # ---- narrowing from the timeline and the runs list ----

    def set_step_filter(self, step: str | None) -> None:
        """Show only one pipeline step's events; None shows every step."""
        if step == self._step_filter:
            return
        self._step_filter = step
        self._rebuild_console()
        self._update_stats_bar()

    def set_run_filter(self, run_id: str | None) -> None:
        """Show only one run's events; None shows the whole session."""
        if run_id == self._run_filter:
            return
        self._run_filter = run_id
        self._rebuild_console()
        self._update_stats_bar()

    # ---- entries ----

    def log_entry(self, message: str, level: str = "info") -> None:
        self.add_entry(LogEntry.create(message, level))

    def add_entry(self, entry: LogEntry) -> None:
        """Retain structured context when forwarding pipeline events."""
        if len(self._entries) == self.MAX_ENTRIES:
            evicted = self._entries[0]
            self._level_counts[evicted.level] -= 1
            if self._matches_current_filter(evicted):
                self._visible -= 1
        self._entries.append(entry)
        self._level_counts[entry.level] += 1
        if self._matches_current_filter(entry):
            self._visible += 1
            self._write_entry(entry)
        self._update_stats_bar()

    def _matches_current_filter(self, entry: LogEntry) -> bool:
        if self._current_filter != "all" and entry.level != self._current_filter:
            return False
        if self._step_filter and entry.step != self._step_filter:
            return False
        if self._run_filter and entry.run_id != self._run_filter:
            return False
        searchable = f"{entry.message} {entry.step or ''} {entry.run_id or ''} {entry.status or ''}"
        return not (self._search_query and self._search_query not in searchable.lower())

    def _is_dark(self) -> bool:
        return is_dark_theme(self.app)

    def on_theme_changed(self) -> None:
        self._rebuild_console()
        self._update_stats_bar()

    def _write_entry(self, entry: LogEntry) -> None:
        self.query_one("#logs-console", RichLog).write(
            render_entry(entry, self._is_dark())
        )

    def _update_stats_bar(self) -> None:
        total = len(self._entries)
        counts = self._level_counts

        with suppress(NoMatches):
            palette = DARK if self._is_dark() else LIGHT
            self.query_one("#filter-all", Button).label = self._rail_label(
                "all", total, palette
            )
            for level in ("stage", "info", "warning", "error"):
                self.query_one(f"#filter-{level}", Button).label = self._rail_label(
                    level, counts[level], palette
                )
            visible = self._visible
            filter_label = (
                self._current_filter.title() if self._current_filter != "all" else "All"
            )
            scope = []
            if self._run_filter:
                scope.append(f"run {self._run_filter[:8]}")
            if self._step_filter:
                scope.append(f"step {self._step_filter}")
            title = f"Events · {filter_label} · {visible} of {total}"
            if scope:
                title += " · " + " · ".join(scope)
            self.query_one("#logs-title", Static).update(title)
            empty = self.query_one("#logs-empty", Static)
            empty.display = visible == 0
            empty.update(
                "No events yet."
                if not total
                else "No matching events. Clear the search or choose another filter."
            )

    def _rail_label(self, level: str, count: int, palette) -> Text:
        """Keep the label unstyled so the active button owns its contrast pair."""
        name = "All" if level == "all" else level.title()
        label = Text()
        label.append("● ", style=f"bold {severity_color(level, palette)}")
        label.append(f"{name} {count}", style="")
        return label

    def _rebuild_console(self) -> None:
        """Re-render after a filter, search, or theme change; never per entry.

        One batched write of the newest matches instead of one write per entry.
        """
        matching = [entry for entry in self._entries if self._matches_current_filter(entry)]
        self._visible = len(matching)
        with suppress(NoMatches):
            log_widget = self.query_one("#logs-console", RichLog)
            log_widget.clear()
            tail = matching[-self.REBUILD_LIMIT:]
            if not tail:
                return
            dark = self._is_dark()
            lines = [render_entry(entry, dark) for entry in tail]
            hidden = len(matching) - len(tail)
            if hidden:
                palette = DARK if dark else LIGHT
                lines.insert(0, Text(
                    f"… {hidden} earlier matching entries not shown; narrow the filter",
                    style=palette.variables["muted"],
                ))
            log_widget.write(Text("\n").join(lines))

    @on(Button.Pressed, "#filter-all")
    @on(Button.Pressed, "#filter-stage")
    @on(Button.Pressed, "#filter-info")
    @on(Button.Pressed, "#filter-warning")
    @on(Button.Pressed, "#filter-error")
    def change_filter(self, event: Button.Pressed) -> None:
        mapping = {
            "filter-all": "all",
            "filter-stage": "stage",
            "filter-info": "info",
            "filter-warning": "warning",
            "filter-error": "error",
        }
        self._current_filter = mapping.get(event.button.id, "all")
        for btn_id in mapping:
            with suppress(NoMatches):
                self.query_one(f"#{btn_id}", Button).set_class(
                    btn_id == event.button.id, "-active"
                )
        self._rebuild_console()
        self._update_stats_bar()

    @on(Input.Changed, "#logs-search")
    def on_search_changed(self, event: Input.Changed) -> None:
        self._search_query = event.value.strip().lower()
        # Rebuild once typing pauses, the same way Records searches.
        self.run_worker(self._rebuild_after_pause(), group="logs-search", exclusive=True)

    async def _rebuild_after_pause(self) -> None:
        await asyncio.sleep(0.15)
        self._rebuild_console()
        self._update_stats_bar()

    @on(Button.Pressed, "#toggle-scroll")
    def toggle_scroll_btn(self) -> None:
        self._toggle_auto_scroll()

    def _toggle_auto_scroll(self) -> None:
        self._auto_scroll = not self._auto_scroll
        with suppress(NoMatches):
            btn = self.query_one("#toggle-scroll", Button)
            btn.label = f"Auto-scroll: {'ON' if self._auto_scroll else 'OFF'}"
            self.query_one("#logs-console", RichLog).auto_scroll = self._auto_scroll

    @on(Button.Pressed, "#clear-logs")
    def clear_logs(self) -> None:
        self._entries.clear()
        self._level_counts.clear()
        self._visible = 0
        with suppress(NoMatches):
            self.query_one("#logs-console", RichLog).clear()
            self._update_stats_bar()
