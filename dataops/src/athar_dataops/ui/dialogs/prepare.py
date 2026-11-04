"""Confirmation before Prepare spends provider quota.

The preview used to be a block that scrolled off the Run tab; a decision that
costs quota gets a modal, like the two destructive actions.
"""

from typing import ClassVar

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static

from athar_dataops.schemas.preparation import PreparePreview


class PrepareConfirmScreen(ModalScreen[bool]):
    BINDINGS: ClassVar[list[tuple[str, str, str]]] = [
        ("escape", "dismiss(False)", "Cancel"),
        ("q", "dismiss(False)", "Cancel"),
    ]

    def __init__(self, preview: PreparePreview) -> None:
        super().__init__()
        self.preview = preview

    def compose(self) -> ComposeResult:
        preview = self.preview
        with VerticalScroll(id="prepare-preview"):
            yield Label(f"Prepare {preview['eligible']} descriptions?", classes="heading")
            profiles = "\n".join(
                f"  {entry['name']} · {entry['model']} · key {entry['fingerprint']}"
                for entry in preview["profiles"]
            )
            yield Static(
                f"Need a model call: {preview['uncached']}\n"
                f"Already prepared, reused: {preview['cached']}\n\n"
                f"Profiles:\n{profiles}\n\n"
                "Each call counts against that profile's daily Groq limit. "
                "Stopping keeps finished work.",
                id="prepare-preview-body",
                markup=False,
            )
            with Horizontal(classes="actions", id="prepare-actions"):
                yield Button(
                    "Start Prepare all",
                    id="prepare-confirm",
                    classes="impact",
                    disabled=preview["uncached"] == 0,
                )
                yield Button("Cancel", id="prepare-cancel")

    def on_mount(self) -> None:
        confirm = self.query_one("#prepare-confirm", Button)
        (confirm if not confirm.disabled else self.query_one("#prepare-cancel", Button)).focus()

    @on(Button.Pressed, "#prepare-confirm")
    def confirm(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#prepare-cancel")
    def cancel(self) -> None:
        self.dismiss(False)
