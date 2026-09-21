"""Operational logs console with real-time search, severity filtering, and activity tracking."""

from __future__ import annotations

from textual import events, on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Input, Label, RichLog, Static

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.ui.log_format import render_entry


class LogsPane(Vertical):
    """Dedicated system logs console with live keyword search and severity filtering."""

    BINDINGS = [
        Binding("slash", "focus_search", "Search Logs", show=False),
        Binding("ctrl+f", "focus_search", "Search Logs", show=False),
        Binding("ctrl+l", "clear_console", "Clear", show=False),
    ]

    DEFAULT_CSS = """
    LogsPane {
        height: 1fr;
    }

    #logs-split {
        height: 1fr;
    }

    #logs-rail {
        width: 28;
        background: $surface;
        border: round $control-line;
        padding: 1;
        margin-right: 1;
        height: 1fr;
    }

    #logs-rail:focus-within {
        border: round $link-ink;
    }

    #logs-rail-title {
        text-style: bold;
        color: $link-ink;
        margin-bottom: 0;
    }

    #logs-rail-subtitle {
        color: $muted;
        margin-bottom: 1;
    }

    .rail-section {
        color: $muted;
        text-style: bold;
        margin-top: 1;
        margin-bottom: 0;
        padding: 0 1;
    }

    #logs-rail Button {
        width: 100%;
        min-width: 100%;
        height: 1;
        margin-bottom: 0;
        border: none;
        background: transparent;
        color: $muted;
        text-align: left;
        padding: 0 1;
    }

    #logs-rail Button:hover {
        background: $selection;
        color: $foreground;
    }

    #logs-rail Button:focus {
        background: $selection;
        color: $foreground;
    }

    #logs-rail Button.-active {
        background: $selection;
        color: $link-ink;
        text-style: bold;
        border-left: thick $link-ink;
    }

    #clear-logs:hover {
        color: $error;
    }

    #logs-stream {
        width: 1fr;
        height: 1fr;
    }

    #logs-search {
        height: 3;
        border: round $control-line;
        background: $panel;
        padding: 0 1;
        margin-bottom: 1;
    }

    #logs-search:focus {
        border: round $link-ink;
    }

    #logs-console {
        height: 1fr;
        background: $surface;
        border: round $control-line;
        padding: 1;
    }

    #logs-console:focus {
        border: round $link-ink;
    }

    .compact #logs-rail {
        width: 24;
    }
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._entries: list[LogEntry] = []
        self._current_filter: str = "all"
        self._search_query: str = ""
        self._auto_scroll: bool = True

    def compose(self) -> ComposeResult:
        with Horizontal(id="logs-split"):
            with Vertical(id="logs-rail"):
                yield Label("OPERATIONAL LOGS", id="logs-rail-title")
                yield Static("Live runtime telemetry", id="logs-rail-subtitle")

                yield Label("SEVERITY", classes="rail-section")
                yield Button("● All (0)", id="filter-all", classes="-active")
                yield Button("● Stages (0)", id="filter-stage")
                yield Button("● Info (0)", id="filter-info")
                yield Button("● Warnings (0)", id="filter-warning")
                yield Button("● Errors (0)", id="filter-error")

                yield Label("ACTIONS", classes="rail-section")
                yield Button("Auto-scroll: ON", id="toggle-scroll")
                yield Button("Clear console", id="clear-logs")

            with Vertical(id="logs-stream"):
                yield Input(
                    placeholder="Search logs… (/ or Ctrl+F to focus)", id="logs-search"
                )
                yield RichLog(
                    id="logs-console",
                    max_lines=2000,
                    markup=True,
                    wrap=True,
                    auto_scroll=True,
                )

    def on_mount(self) -> None:
        self.log_entry("Athar DataOps runtime initialized (v0.1.0)", "info")
        self._update_stats_bar()

    def action_focus_search(self) -> None:
        self.query_one("#logs-search", Input).focus()

    def action_clear_console(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        self.clear_logs()

    def on_key(self, event: events.Key) -> None:
        if event.key == "escape":
            try:
                search_input = self.query_one("#logs-search", Input)
                if search_input.has_focus:
                    event.prevent_default()
                    event.stop()
                    if search_input.value:
                        search_input.value = ""
                    else:
                        self.query_one("#logs-console", RichLog).focus()
            except Exception:
                pass

    @on(Input.Submitted, "#logs-search")
    def on_search_submitted(self) -> None:
        self.query_one("#logs-console", RichLog).focus()

    def log_entry(self, message: str, level: str = "info") -> None:
        self.add_entry(LogEntry.create(message, level))

    def add_entry(self, entry: LogEntry) -> None:
        """Retain structured context when forwarding pipeline events."""
        self._entries.append(entry)
        if len(self._entries) > 2000:
            del self._entries[:-2000]
            self._rebuild_console()
            self._update_stats_bar()
            return

        if self._matches_current_filter(entry):
            self._write_entry(entry)

        self._update_stats_bar()

    def _matches_current_filter(self, entry: LogEntry) -> bool:
        if self._current_filter != "all" and entry.level != self._current_filter:
            return False
        searchable = f"{entry.message} {entry.step or ''} {entry.run_id or ''} {entry.status or ''}"
        if self._search_query and self._search_query not in searchable.lower():
            return False
        return True

    def _is_dark(self) -> bool:
        try:
            return getattr(self.app, "theme", "athar-dark") != "athar-light"
        except Exception:
            return True

    def on_theme_changed(self) -> None:
        self._rebuild_console()
        self._update_stats_bar()

    def _write_entry(self, entry: LogEntry) -> None:
        self.query_one("#logs-console", RichLog).write(
            render_entry(entry, self._is_dark())
        )

    def _update_stats_bar(self) -> None:
        total = len(self._entries)
        stages = sum(1 for e in self._entries if e.level == "stage")
        info = sum(1 for e in self._entries if e.level == "info")
        warnings = sum(1 for e in self._entries if e.level == "warning")
        errors = sum(1 for e in self._entries if e.level == "error")

        try:
            self.query_one("#filter-all", Button).label = f"● All ({total})"
            self.query_one("#filter-stage", Button).label = f"● Stages ({stages})"
            self.query_one("#filter-info", Button).label = f"● Info ({info})"
            self.query_one("#filter-warning", Button).label = f"● Warnings ({warnings})"
            self.query_one("#filter-error", Button).label = f"● Errors ({errors})"
            console = self.query_one("#logs-console", RichLog)
            filter_label = (
                self._current_filter.title() if self._current_filter != "all" else "All"
            )
            console.border_title = f"Console Stream · {filter_label} ({total} events)"
        except Exception:
            pass

    def _rebuild_console(self) -> None:
        try:
            log_widget = self.query_one("#logs-console", RichLog)
            log_widget.clear()
            for entry in self._entries:
                if self._matches_current_filter(entry):
                    self._write_entry(entry)
        except Exception:
            pass

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
            try:
                self.query_one(f"#{btn_id}", Button).set_class(
                    btn_id == event.button.id, "-active"
                )
            except Exception:
                pass
        self._rebuild_console()

    @on(Input.Changed, "#logs-search")
    def on_search_changed(self, event: Input.Changed) -> None:
        self._search_query = event.value.strip().lower()
        self._rebuild_console()

    @on(Button.Pressed, "#toggle-scroll")
    def toggle_scroll_btn(self) -> None:
        self._toggle_auto_scroll()

    def _toggle_auto_scroll(self) -> None:
        self._auto_scroll = not self._auto_scroll
        try:
            btn = self.query_one("#toggle-scroll", Button)
            btn.label = f"Auto-scroll: {'ON' if self._auto_scroll else 'OFF'}"
            self.query_one("#logs-console", RichLog).auto_scroll = self._auto_scroll
        except Exception:
            pass

    @on(Button.Pressed, "#clear-logs")
    def clear_logs(self) -> None:
        self._entries.clear()
        try:
            self.query_one("#logs-console", RichLog).clear()
            self._update_stats_bar()
        except Exception:
            pass
