"""Confirmation for wiping workspace data; schema and migrations are kept."""

from typing import ClassVar

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static


class WipeConfirmScreen(ModalScreen[bool]):
    """Explicit confirmation before a destructive, irreversible wipe."""

    BINDINGS: ClassVar[list[tuple[str, str, str]]] = [
        ("escape", "dismiss", "Close"),
        ("q", "dismiss", "Close"),
        ("enter", "dismiss", "Close"),
    ]

    def __init__(self, *, registry_only: bool = False) -> None:
        super().__init__()
        self.registry_only = registry_only

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="wipe-dialog"):
            yield Label(
                "Reset registry data?" if self.registry_only else "Wipe all data?",
                classes="heading",
            )
            yield Static(
                (
                    "This deletes registry snapshots and rows, entities, founders, "
                    "related startups, findings, embeddings, prepared text, and run history.\n\n"
                    "Groq profiles, limits, and usage counts stay. The tables and "
                    "migrations stay. This cannot be undone."
                    if self.registry_only else
                    "This permanently deletes every stored row except the applied "
                    "migrations: source snapshots and rows, startups, run history, prepared "
                    "text, usage, profiles, and their limits.\n\n"
                    "The schema stays in place, migrations stay recorded, and profiles "
                    "re-seed from dataops/.env.profiles.toml on the next Prepare run. "
                    "This cannot be undone."
                ),
                id="wipe-warning",
                classes="muted",
            )
            with Horizontal(id="wipe-actions"):
                yield Button(
                    "Reset registry data" if self.registry_only else "Wipe all data",
                    id="wipe-confirm", variant="warning",
                )
                yield Button("Cancel", id="wipe-cancel", variant="primary")

    @on(Button.Pressed, "#wipe-confirm")
    def confirm_wipe(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#wipe-cancel")
    def cancel_wipe(self) -> None:
        self.dismiss(False)