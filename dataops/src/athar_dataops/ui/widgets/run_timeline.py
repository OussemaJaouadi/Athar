"""Horizontal pipeline road: linked circles, colored badges, live metrics."""

import re

from rich.text import Text
from textual import events
from textual.message import Message
from textual.widget import Widget

from athar_dataops.schemas.pipeline import StageProgress
from athar_dataops.themes import DARK, LIGHT

_NODE = {
    "pending": "○",
    "running": "◍",
    "completed": "●",
    "failed": "●",
    "cancelled": "⊘",
}
_BADGE_WORD = {
    "pending": "waiting",
    "running": "running",
    "completed": "done",
    "failed": "failed",
    "cancelled": "cancelled",
}


def format_elapsed(seconds: float) -> str:
    seconds = max(0, seconds)
    return (
        f"{seconds:.1f}s"
        if seconds < 60
        else f"{int(seconds // 60)}m {seconds % 60:04.1f}s"
    )


def _compact_elapsed(seconds: float) -> str:
    seconds = max(0, seconds)
    return f"{seconds:.1f}s" if seconds < 60 else f"{int(seconds // 60)}m{int(seconds % 60)}s"


def _parse_metrics(label: str) -> tuple[str | None, float | None]:
    cpu = re.search(r"CPU avg\s+([0-9.]+)%", label)
    rss = re.search(r"peak RSS\s+([0-9.]+)\s*MiB", label)
    return (cpu.group(1) if cpu else None, float(rss.group(1)) if rss else None)


class RunTimeline(Widget):
    DEFAULT_CSS = """
    RunTimeline {
        height: auto;
        max-height: 8;
        margin: 1 0;
        padding: 0 2;
        border: round $control-line;
        background: $surface;
    }
    RunTimeline:focus { border: round $link-ink; }
    """

    class StepSelected(Message):
        def __init__(self, step_name: str) -> None:
            super().__init__()
            self.step_name = step_name

    can_focus = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._steps: list[str] = []
        self._titles: dict[str, str] = {}
        self._progress: dict[str, StageProgress] = {}
        self._elapsed: dict[str, float] = {}
        self._metrics: dict[str, str] = {}
        self._highlighted = 0

    @property
    def selected(self) -> str:
        index = self._highlighted
        return self._steps[index - 1] if 0 < index <= len(self._steps) else "all"

    @property
    def option_count(self) -> int:
        return len(self._steps) + 1

    def set_steps(self, steps: list[tuple[str, str]]) -> None:
        self._steps = [name for name, _ in steps]
        self._titles = dict(steps)
        self._progress.clear()
        self._elapsed.clear()
        self._metrics.clear()
        self._highlighted = 0
        self.refresh()

    def update(self, progress: StageProgress, elapsed: float | None = None) -> None:
        self._progress[progress.stage_name] = progress
        if elapsed is not None:
            self._elapsed[progress.stage_name] = elapsed
        self.refresh()

    def tick(self, name: str, elapsed: float, metrics: str) -> None:
        self._elapsed[name] = elapsed
        self._metrics[name] = metrics
        self.refresh()

    def select(self, index: int) -> None:
        index = max(0, min(len(self._steps), index))
        if index == self._highlighted:
            return
        self._highlighted = index
        self.refresh()

    def on_key(self, event: events.Key) -> None:
        if event.key == "down":
            self._move(1)
            event.stop()
        elif event.key == "up":
            self._move(-1)
            event.stop()
        elif event.key in ("left", "right"):
            self._move(-1 if event.key == "left" else 1)
            event.stop()

    def on_theme_changed(self) -> None:
        self.refresh()

    def _move(self, delta: int) -> None:
        total = len(self._steps)
        index = max(0, min(total, self._highlighted + delta))
        if index == self._highlighted:
            return
        self._highlighted = index
        self.refresh()
        self.post_message(self.StepSelected(self.selected))

    def _palette(self):
        return LIGHT if self.app.theme == "athar-light" else DARK

    def _status(self, name: str) -> str:
        progress = self._progress.get(name)
        return progress.status if progress else "pending"

    def _badge(self, text: str, fg: str, bg: str) -> Text:
        return Text(f" {text} ", style=f"{fg} on {bg}")

    def _center(self, renderable: Text, width: int) -> Text:
        missing = width - len(renderable.plain)
        if missing <= 0:
            return renderable
        left = missing // 2
        padded = Text(" " * left)
        padded.append_text(renderable.copy())
        padded.append(" " * (missing - left))
        return padded

    def render(self) -> Text:
        palette = self._palette()
        dark = self.app.theme != "athar-light"
        muted = palette.variables["muted"]
        selection = palette.variables["selection"]
        if not self._steps:
            return Text("No recorded steps.", style=muted)

        width = max(4, (self.content_size.width or 80) // len(self._steps))

        marker = Text()
        road = Text()
        labels = Text()
        statuses = Text()
        badges_row = Text()

        for index, name in enumerate(self._steps):
            status = self._status(name)
            glyph = _NODE[status]
            color = {
                "running": palette.primary,
                "completed": palette.success,
                "failed": palette.error,
                "cancelled": palette.warning,
            }.get(status, muted)
            selected = self._highlighted == index + 1

            marker.append(
                "▲".center(width) if selected else " " * width,
                style=f"bold {palette.primary}",
            )

            road.append(glyph, style=f"bold {color}")
            road.append("─" * (width - 1), style=color)

            label = name if len(name) <= width else name[: width - 1] + "…"
            centered = label.center(width)
            labels.append(
                centered,
                style=(
                    f"bold {palette.foreground} on {selection}"
                    if selected
                    else f"bold {palette.foreground}"
                ),
            )

            chip = f" {glyph} {_BADGE_WORD[status]} "
            if status == "pending":
                statuses.append(chip.center(width), style=muted)
            else:
                bg = {
                    "running": palette.primary,
                    "completed": palette.success,
                    "failed": palette.error,
                    "cancelled": palette.warning,
                }[status]
                fg = "#071215" if dark else "#FFFFFF"
                statuses.append(chip.center(width), style=f"{fg} on {bg}")

            badges: list[Text] = []
            if name in self._elapsed:
                badges.append(self._badge(_compact_elapsed(self._elapsed[name]), muted, selection))
            progress = self._progress.get(name)
            if status == "completed" and name not in ("fetch", "collect") and progress:
                badges.append(
                    self._badge(f"{progress.items_processed} rows", palette.success, selection)
                )
            if status == "running" and name in self._metrics:
                cpu, rss = _parse_metrics(self._metrics[name])
                if cpu is not None:
                    detail = f"CPU {cpu}%"
                    if rss is not None:
                        detail += f"·{rss:.0f}M"
                    badges.append(self._badge(detail, palette.primary, selection))
            if badges:
                row = Text()
                for i, badge in enumerate(badges):
                    row.append_text(badge)
                    if i < len(badges) - 1:
                        row.append("  ", style="")
                badges_row.append_text(self._center(row, width))
            else:
                badges_row.append(" " * width)

        output = Text()
        for line in (marker, road, labels, statuses, badges_row):
            if output:
                output.append("\n")
            output.append_text(line)
        return output