"""Athar's semantic palette adapted to terminal widgets."""

from rich.json import JSON
from rich.style import Style
from rich.text import Span
from textual.theme import Theme
from textual.widgets.text_area import TextAreaTheme

DARK = Theme(
    name="athar-dark",
    primary="#82D5E5",
    secondary="#A7B9BE",
    accent="#82D5E5",
    foreground="#EEF5F6",
    background="#020202",
    surface="#0E1417",
    panel="#182226",
    boost="#16333B",
    success="#80CFA6",
    warning="#F1C276",
    error="#F2A09A",
    dark=True,
    variables={
        "muted": "#A7B9BE",
        "selection": "#16333B",
        "line": "#2B393E",
        "control-line": "#60767E",
        "link-ink": "#82D5E5",
        "action-bg": "#82D5E5",
        "action-fg": "#071215",
        "action-hover": "#9CE0EC",
        "footer-background": "#0E1417",
        "footer-key-foreground": "#82D5E5",
        "footer-description-foreground": "#A7B9BE",
        "block-cursor-background": "#16333B",
        "block-cursor-foreground": "#EEF5F6",
        "block-cursor-text-style": "bold",
        "block-hover-background": "#16333B",
    },
)
LIGHT = Theme(
    name="athar-light",
    primary="#075E73",
    secondary="#5A5D61",
    accent="#075E73",
    foreground="#1C1D1F",
    background="#E6EAEC",
    surface="#FFFFFF",
    panel="#F2F4F5",
    boost="#DDECF0",
    success="#176344",
    warning="#7A4B08",
    error="#A13635",
    dark=False,
    variables={
        "muted": "#5A5D61",
        "selection": "#B9E3EB",
        "line": "#B9C3C7",
        "control-line": "#6C7B82",
        "link-ink": "#075E73",
        "action-bg": "#087B92",
        "action-fg": "#FFFFFF",
        "action-hover": "#055D70",
        "footer-background": "#F2F4F5",
        "footer-key-foreground": "#075E73",
        "footer-description-foreground": "#5A5D61",
        "block-hover-background": "#DDECF0",
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


def editor_theme(dark: bool) -> TextAreaTheme:
    """Keep SQL chrome and syntax inside the selected Athar theme."""
    fg, bg, muted, accent, selection = (
        ("#EEF5F6", "#0E1417", "#A7B9BE", "#82D5E5", "#16333B")
        if dark
        else ("#1C1D1F", "#FFFFFF", "#5A5D61", "#075E73", "#B9E3EB")
    )
    return TextAreaTheme(
        name="athar-sql",
        base_style=Style(color=fg, bgcolor=bg),
        gutter_style=Style(color=muted, bgcolor=bg),
        cursor_style=Style(color=bg, bgcolor=accent),
        cursor_line_style=Style(bgcolor=bg),
        cursor_line_gutter_style=Style(color=accent, bgcolor=bg),
        selection_style=Style(color=fg, bgcolor=selection),
        bracket_matching_style=Style(color=accent, bold=True),
        syntax_styles={
            "keyword": Style(color=accent, bold=True),
            "string": Style(color="#80CFA6" if dark else "#176344"),
            "number": Style(color="#F1C276" if dark else "#7A4B08"),
            "comment": Style(color=muted, italic=True),
        },
    )


def themed_json(data, *, dark: bool) -> JSON:
    """Use explicit theme colors instead of terminal-dependent ANSI JSON styles."""
    palette = DARK if dark else LIGHT
    colors = {
        "json.key": palette.primary,
        "json.str": palette.success,
        "json.number": palette.warning,
        "json.bool_true": palette.primary,
        "json.bool_false": palette.primary,
        "json.null": palette.variables["muted"],
    }
    if not dark:
        # Syntax types are not success/warning states. Keep long strings quiet.
        colors.update(
            {
                "json.key": "#164455",
                "json.str": "#171B1E",
                "json.number": "#68429A",
                "json.bool_true": "#68429A",
                "json.bool_false": "#68429A",
                "json.null": "#59656D",
                "json.brace": "#59656D",
            }
        )
    value = JSON.from_data(data, indent=2)
    value.text.style = palette.foreground
    value.text.spans = [
        Span(
            span.start,
            span.end,
            Style(
                color=colors.get(str(span.style), palette.foreground),
                bgcolor="#D6EAF0" if not dark and span.style == "json.key" else None,
                bold=span.style == "json.key"
                or (not dark and span.style in ("json.bool_true", "json.bool_false")),
                italic=not dark and span.style == "json.null",
            ),
        )
        for span in value.text.spans
    ]
    return value
