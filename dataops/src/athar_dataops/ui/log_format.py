"""Style metadata, never interpret source messages as markup."""

from rich.text import Text

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.arabic import sanitize_display


def severity_color(level: str, palette) -> str:
    """Map a log severity to its palette color (shared by console and rail)."""
    return {
        "running": palette.primary,
        "completed": palette.success,
        "cancelled": palette.warning,
        "failed": palette.error,
        "stage": palette.primary,
        "error": palette.error,
        "warning": palette.warning,
    }.get(level, palette.variables["muted"])


_STEP_WIDTH = 14


def render_entry(entry: LogEntry, dark: bool) -> Text:
    palette = DARK if dark else LIGHT
    color = severity_color(entry.status or entry.level, palette)
    text = Text()
    stamp = entry.timestamp.strftime("%H:%M:%S") if entry.timestamp else "--:--:--"
    text.append(stamp + "  ", style=palette.variables["muted"])
    text.append(f"{(entry.status or entry.level).upper():<9}  ", style=f"bold {color}")
    if entry.run_id:
        text.append(f"{entry.run_id[:8]}  ", style=palette.variables["muted"])
    if entry.step:
        step = entry.step
        if len(step) > _STEP_WIDTH:
            step = step[: _STEP_WIDTH - 1] + "…"
        text.append(f"{step:<{_STEP_WIDTH}}  ", style=palette.variables["link-ink"])
    text.append("│ ", style=palette.variables["muted"])
    message = sanitize_display(entry.message).replace("\n", " · ")
    text.append(message, style=palette.foreground)
    return text
