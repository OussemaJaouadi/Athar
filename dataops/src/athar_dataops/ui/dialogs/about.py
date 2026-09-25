"""About dialog with ASCII mark."""

from typing import ClassVar

from textual import on
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static

from athar_dataops.ui.widgets.ascii_mark import AsciiMark


class AboutScreen(ModalScreen):
    """About dialog with ASCII mark."""

    BINDINGS: ClassVar[list[tuple[str, str, str]]] = [
        ("escape", "dismiss", "Close"),
        ("q", "dismiss", "Close"),
        ("enter", "dismiss", "Close"),
    ]

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="about-dialog"):
            yield Label("Athar · DataOps", classes="heading")
            yield Static(
                "An evidence-backed memory of Tunisian startups.\n"
                "Terminal workspace · Local-first · Evidence-first",
                classes="muted",
            )
            yield AsciiMark(id="ascii-mark")
            yield Static(
                "The ASCII mark appears when the terminal is ≥110×64.",
                id="mark-hint",
                classes="muted note",
            )
            yield Button("Close", id="close-about")

    def on_resize(self) -> None:
        # The mark may be hidden, so its own Resize event is not sufficient.
        for mark in self.query(AsciiMark):
            self.call_after_refresh(mark.refresh_artwork)

    @on(Button.Pressed, "#close-about")
    def close_about(self) -> None:
        self.dismiss()
