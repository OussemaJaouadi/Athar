"""Run log rendering uses the same literal-text formatter as the Logs tab."""

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import RichLog

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.ui.log_format import render_entry


class LogView(Vertical):
    DEFAULT_CSS = """
    LogView { height: 12; min-height: 4; border: round $control-line; background: $surface; }
    LogView RichLog { height: 1fr; background: $surface; color: $foreground; }
    """

    def compose(self) -> ComposeResult:
        yield RichLog(
            max_lines=300, markup=False, highlight=False, wrap=True, auto_scroll=True
        )

    def write_entry(self, entry: LogEntry) -> None:
        self.query_one(RichLog).write(
            render_entry(entry, self.app.theme != "athar-light")
        )

    def render_log(self, entries: list[LogEntry]) -> None:
        self.clear()
        for entry in entries:
            self.write_entry(entry)

    def clear(self) -> None:
        self.query_one(RichLog).clear()
