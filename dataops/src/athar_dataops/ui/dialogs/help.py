"""Help dialog with structured shortcut reference."""

from typing import ClassVar

from rich import box
from rich.table import Table
from textual import on
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static

from athar_dataops.themes import DARK, LIGHT


class HelpScreen(ModalScreen):
    """Keyboard shortcuts and workspace usage guide."""

    BINDINGS: ClassVar[list[tuple[str, str, str]]] = [
        ("escape", "dismiss", "Close"),
        ("f1", "dismiss", "Close"),
        ("q", "dismiss", "Close"),
        ("enter", "dismiss", "Close"),
    ]

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="help-dialog"):
            yield Label(
                "Athar DataOps · Keyboard Shortcuts", classes="heading", id="help-title"
            )

            is_dark = getattr(self.app, "theme", "athar-dark") != "athar-light"
            pri = (DARK if is_dark else LIGHT).primary

            table = Table(
                box=box.ROUNDED,
                expand=True,
                show_header=True,
                header_style=f"bold {pri}",
            )
            table.add_column("Key", style=f"bold {pri}", width=18)
            table.add_column("Action / Scope")

            table.add_row(
                "1 – 7 / Alt+1–7",
                "Switch tab: Run · Records · History · Database · Logs · Probes · Settings",
            )
            table.add_row("[  /  ]", "Cycle previous / next workspace tab")
            table.add_row("Alt+← / Alt+→", "Cycle previous / next workspace tab")
            table.add_row("Ctrl+PgUp / PgDn", "Cycle previous / next workspace tab")
            table.add_row("Esc", "Close row inspector, otherwise focus workspace tabs")
            table.add_row(
                "Enter", "Inspect selected database row; Esc returns to table"
            )
            table.add_row("Tab / Shift+Tab", "Move focus between controls & panels")
            table.add_row(
                "s  /  e",
                "Toggle Source Evidence & raw JSON (in Records)",
            )
            table.add_row(
                "p  /  n",
                "Previous / Next page (Records & Database)",
            )
            table.add_row(
                "Ctrl+← / Ctrl+→",
                "Previous / Next page (Records & Database)",
            )
            table.add_row("/  /  Ctrl+F", "Search all records / filter logs")
            table.add_row("Ctrl+L", "Clear operational logs console (in Logs)")
            table.add_row(
                "PageUp / PageDown", "Previous / next page (Records & Database)"
            )
            table.add_row("↑  /  ↓", "Navigate records, tables, and rows")
            table.add_row("Prepare all", "Preview uncached model work, then confirm before starting")
            table.add_row("F1", "Toggle this Help modal")
            table.add_row("F6", "Toggle light / dark theme")
            table.add_row("Ctrl+Q", "Graceful quit (cancels active pipeline safely)")
            table.add_row("Esc / q / Enter", "Close this Help guide")

            yield Static(table, id="help-table")
            yield Button("Close Help (Esc)", id="close-help", variant="primary")

    @on(Button.Pressed, "#close-help")
    def close_help(self) -> None:
        self.dismiss()
