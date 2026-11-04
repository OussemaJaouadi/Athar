"""Unboxed tables: one way to lay out labels and values, no frames, one rule under a header.

Every bordered Rich table in the panes used to sit inside a bordered Static
inside a bordered column. These helpers draw nothing but the text and let the
surrounding whitespace do the grouping.
"""

from collections.abc import Iterable

from rich import box
from rich.table import Table
from rich.text import Text
from textual.theme import Theme


def plain_table(palette: Theme, **kwargs) -> Table:
    """A Rich table with no outer box: a bold header in the link color over one rule.

    Headerless tables draw nothing but text; whitespace groups them.
    """
    variables = palette.variables
    kwargs.setdefault("header_style", f"bold {variables['link-ink']}")
    kwargs.setdefault("border_style", variables["line"])
    kwargs.setdefault("expand", True)
    frame = box.SIMPLE_HEAD if kwargs.get("show_header", True) else None
    return Table(box=frame, pad_edge=False, show_edge=False, **kwargs)


def key_value(
    rows: Iterable[tuple[str, str | Text]], palette: Theme, key_width: int = 12
) -> Table:
    """Label column in muted bold, value column in the text color, values fold."""
    table = plain_table(palette, show_header=False)
    table.add_column(style=f"bold {palette.variables['muted']}", width=key_width, no_wrap=True)
    table.add_column(style=palette.foreground, overflow="fold")
    for key, value in rows:
        table.add_row(key, value if isinstance(value, Text) else Text(str(value)))
    return table
