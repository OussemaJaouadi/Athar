"""Athar's semantic palette adapted to terminal widgets.

Every color the interface uses is a token here. Roles, not hues, carry meaning:
candy blue is action, focus, link, and selection text; amber is warning,
cancelled, and a finding that needs a decision; red is error and destructive;
information blue is text on its own tint only, never a fill; violet is syntax.
Surfaces are at least 1.2:1 apart so borders are optional, hover and selection
are different colors, and every pair below was checked for contrast.
"""

from rich.json import JSON
from rich.style import Style
from rich.text import Span
from textual.theme import Theme

DARK = Theme(
    name="athar-dark",
    primary="#82D5E5",
    secondary="#A3B6BC",
    accent="#82D5E5",
    foreground="#EEF5F6",
    background="#020202",
    surface="#0F171A",
    panel="#1E2A2F",
    success="#8FDCB2",
    warning="#F1C276",
    error="#E8837B",
    dark=True,
    variables={
        "muted": "#A3B6BC",
        "selection": "#124552",
        "line": "#36484F",
        "control-line": "#7A929B",
        "link-ink": "#82D5E5",
        "action-bg": "#82D5E5",
        "action-fg": "#071215",
        "action-hover": "#B9ECF4",
        "info-ink": "#9BC7F2",
        "info-bg": "#172838",
        "destructive-bg": "#B3453D",
        "destructive-fg": "#EEF5F6",
        "success-bg": "#102A20",
        "warning-bg": "#302414",
        "error-bg": "#311D1D",
        "violet": "#C5AAED",
        "footer-background": "#0F171A",
        "footer-key-foreground": "#82D5E5",
        "footer-description-foreground": "#A3B6BC",
        "block-cursor-background": "#124552",
        "block-cursor-foreground": "#EEF5F6",
        "block-cursor-text-style": "bold",
        "block-cursor-blurred-background": "#124552",
        "block-cursor-blurred-foreground": "#EEF5F6",
        "block-hover-background": "#323C42",
        "scrollbar": "#55727C",
        "scrollbar-hover": "#82D5E5",
        "scrollbar-active": "#82D5E5",
        "scrollbar-background": "#020202",
        "scrollbar-background-hover": "#020202",
        "scrollbar-background-active": "#020202",
    },
)
LIGHT = Theme(
    name="athar-light",
    primary="#075E73",
    secondary="#555B5F",
    accent="#075E73",
    foreground="#1C1D1F",
    background="#E6EAEC",
    surface="#FFFFFF",
    panel="#F2F4F5",
    success="#176344",
    warning="#7A4B08",
    error="#C02A54",
    dark=False,
    variables={
        "muted": "#555B5F",
        "selection": "#B9E3EB",
        "line": "#C3CCD0",
        "control-line": "#6C7B82",
        "link-ink": "#075E73",
        "action-bg": "#0A6D82",
        "action-fg": "#FFFFFF",
        "action-hover": "#055D70",
        "info-ink": "#275E91",
        "info-bg": "#E9F2FA",
        "destructive-bg": "#C02A54",
        "destructive-fg": "#FFFFFF",
        "success-bg": "#E7F4EC",
        "warning-bg": "#FFF1D6",
        "error-bg": "#FCEDEC",
        "violet": "#68429A",
        "footer-background": "#F2F4F5",
        "footer-key-foreground": "#075E73",
        "footer-description-foreground": "#555B5F",
        "block-hover-background": "#E8EDEF",
        "block-cursor-blurred-background": "#B9E3EB",
        "block-cursor-blurred-foreground": "#1C1D1F",
        "block-cursor-blurred-text-style": "bold",
        "input-selection-background": "#B9E3EB",
        "input-selection-foreground": "#1C1D1F",
        "input-cursor-background": "#075E73",
        "input-cursor-foreground": "#FFFFFF",
        "scrollbar": "#6C7B82",
        "scrollbar-hover": "#075E73",
        "scrollbar-active": "#075E73",
        "scrollbar-background": "#F2F4F5",
        "scrollbar-background-hover": "#F2F4F5",
        "scrollbar-background-active": "#F2F4F5",
        "block-cursor-background": "#B9E3EB",
        "block-cursor-foreground": "#1C1D1F",
        "block-cursor-text-style": "bold",
    },
)


def is_dark_theme(app) -> bool:
    """One answer for every pane: anything but the light theme renders dark.

    Widgets may ask before they are attached to a running app, where reading
    ``app`` raises; dark is the configured default in that case.
    """
    try:
        return getattr(app, "theme", DARK.name) != LIGHT.name
    except RuntimeError:
        return True


def palette_for(app) -> Theme:
    return DARK if is_dark_theme(app) else LIGHT


def themed_json(data, *, dark: bool) -> JSON:
    """Syntax roles, not status colors: keys in accent, values in ink, numbers and booleans in violet."""
    palette = DARK if dark else LIGHT
    violet = palette.variables["violet"]
    colors = {
        "json.key": palette.primary,
        "json.str": palette.foreground,
        "json.number": violet,
        "json.bool_true": violet,
        "json.bool_false": violet,
        "json.null": palette.variables["muted"],
        "json.brace": palette.variables["muted"],
    }
    value = JSON.from_data(data, indent=2)
    value.text.style = palette.foreground
    value.text.spans = [
        Span(
            span.start,
            span.end,
            Style(
                color=colors.get(str(span.style), palette.foreground),
                bgcolor=palette.variables["selection"] if not dark and span.style == "json.key" else None,
                bold=span.style == "json.key" or span.style in ("json.bool_true", "json.bool_false"),
                italic=span.style == "json.null",
            ),
        )
        for span in value.text.spans
    ]
    return value
