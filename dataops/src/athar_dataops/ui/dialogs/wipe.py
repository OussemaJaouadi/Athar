"""Confirmation for wiping workspace data; schema and migrations are kept."""

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static


class WipeConfirmScreen(ModalScreen[bool]):
    """Explicit confirmation before a destructive, irreversible wipe."""

    BINDINGS = [
        ("escape", "dismiss", "Close"),
        ("q", "dismiss", "Close"),
        ("enter", "dismiss", "Close"),
    ]

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="wipe-dialog"):
            yield Label("Wipe all data?", classes="heading")
            yield Static(
                "This permanently deletes every stored row except the migration "
                "ledger: source snapshots and rows, entries, run history, prepared "
                "text, usage, profiles, and their quotas.\n\n"
                "The schema stays in place, migrations stay recorded, and profiles "
                "re-seed from dataops/.env.profiles.toml on the next Prepare run. "
                "This cannot be undone.",
                id="wipe-warning",
                classes="muted",
            )
            with Horizontal(id="wipe-actions"):
                yield Button("Wipe everything", id="wipe-confirm", variant="error")
                yield Button("Cancel", id="wipe-cancel", variant="primary")

    @on(Button.Pressed, "#wipe-confirm")
    def confirm_wipe(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#wipe-cancel")
    def cancel_wipe(self) -> None:
        self.dismiss(False)