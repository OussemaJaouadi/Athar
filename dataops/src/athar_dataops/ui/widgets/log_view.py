"""Bounded plain-text logs: source content is never interpreted as Rich markup."""

from datetime import datetime

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import RichLog


class LogView(Vertical):
    DEFAULT_CSS = """
    LogView { height: 10; min-height: 4; border: round $control-line; background: $surface; }
    LogView RichLog { height: 1fr; background: $surface; color: $foreground; }
    """

    def compose(self) -> ComposeResult:
        yield RichLog(
            max_lines=300, markup=False, highlight=False, wrap=True, auto_scroll=True
        )

    def write(self, message: str, level: str = "info") -> None:
        self.query_one(RichLog).write(f"{datetime.now():%H:%M:%S} [{level}] {message}")

    def clear(self) -> None:
        self.query_one(RichLog).clear()
