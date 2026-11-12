"""Review badges on the theme's warning and information tints.

A decision is a warning: attention needed. A gap is information: context,
no urgency. Both are text on a tint, never a fill.
"""

from rich.text import Text

from athar_dataops.themes import DARK, LIGHT


def _pair(dark: bool, decision: bool) -> tuple[str, str]:
    palette = DARK if dark else LIGHT
    if decision:
        return palette.variables["warning-bg"], palette.warning
    return palette.variables["info-bg"], palette.variables["info-ink"]


def review_badge(dark: bool = True, *, decision: bool = True) -> str:
    """Distinguish decisions from source gaps that never block a run."""
    bg, fg = _pair(dark, decision)
    label = "⚠ Needs a decision" if decision else "Source gap"
    return f"[bold {fg} on {bg}] {label} [/]"


def review_chip(dark: bool = True, *, decision: bool = True) -> str:
    """Format a compact review chip for list items."""
    bg, fg = _pair(dark, decision)
    label = "Decision" if decision else "Gap"
    return f"[bold {fg} on {bg}] {label} [/]"


def review_cell(dark: bool = True, *, decision: bool = True) -> Text:
    """The chip as a Text cell for a DataTable row."""
    bg, fg = _pair(dark, decision)
    return Text(f" {'Decision' if decision else 'Gap'} ", style=f"bold {fg} on {bg}")
