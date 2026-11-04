"""Help dialog with structured shortcut reference."""

from typing import ClassVar

from textual import on
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static

from athar_dataops.themes import DARK, LIGHT, palette_for
from athar_dataops.ui.widgets.keyvalue import plain_table


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
                "Keyboard shortcuts", classes="heading", id="help-title"
            )

            is_dark = getattr(self.app, "theme", "athar-dark") != "athar-light"
            pri = (DARK if is_dark else LIGHT).primary

            table = plain_table(palette_for(self.app), show_header=True,
                header_style=f"bold {pri}")
            table.add_column("Key", style=f"bold {pri}", width=18)
            table.add_column("Action")

            table.add_row("1 to 7, Alt+1 to 7", "Open a tab: Run, Records, History, Database, Logs, Probes, Settings")
            table.add_row("[ and ], Alt+← →, Ctrl+PgUp PgDn", "Previous or next tab")
            table.add_row("Tab, Shift+Tab", "Move between controls")
            table.add_row("↑ ↓", "Move through records, runs, and rows")
            table.add_row("Enter", "Database: inspect the selected row")
            table.add_row("Esc", "Close the row inspector, else focus the tab bar")
            table.add_row("s or e", "Records: show or hide the source row")
            table.add_row("p and n, Ctrl+← →, PgUp PgDn", "Records and Database: previous or next page")
            table.add_row("/ or Ctrl+F", "Records: search names, sectors, descriptions. Logs: filter")
            table.add_row("Ctrl+L", "Logs: clear the log")
            table.add_row("F1", "Show or hide this help")
            table.add_row("F6", "Switch light and dark theme")
            table.add_row("Ctrl+Q", "Quit; a running operation is cancelled first")

            yield Static(table, id="help-table")
            yield Static(
                "Prepare all previews the model calls and asks for confirmation. "
                "Reset registry data deletes registry rows and runs; Groq usage stays.",
                classes="muted",
                id="help-operations",
            )
            yield Button("Close", id="close-help", variant="primary")

    @on(Button.Pressed, "#close-help")
    def close_help(self) -> None:
        self.dismiss()
