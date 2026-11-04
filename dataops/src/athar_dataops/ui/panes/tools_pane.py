"""Maintainer utilities behind one small menu: probes, settings, about."""

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.widgets import ContentSwitcher, Label, ListItem, ListView

from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.registry import RegistryService
from athar_dataops.ui.dialogs.about import AboutScreen
from athar_dataops.ui.panes.checkpoints_pane import CheckpointsPane
from athar_dataops.ui.panes.settings_pane import SettingsPane

VIEWS = (("probes", "Probes"), ("settings", "Settings"), ("about", "About"))


class ToolsPane(Horizontal):
    def __init__(
        self,
        config: Settings,
        database: DatabaseService | None = None,
        *,
        artifact: ArtifactService | None = None,
        registry: RegistryService | None = None,
        groq: GroqPreparationClient | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._config = config
        self._database = database
        self._artifact = artifact
        self._registry = registry
        self._groq = groq

    def compose(self) -> ComposeResult:
        with ListView(id="tools-menu"):
            for key, title in VIEWS:
                item = ListItem(Label(title))
                item.data = key
                yield item
        with ContentSwitcher(id="tools-view", initial="checkpoints-pane"):
            yield CheckpointsPane(
                self._config,
                artifact=self._artifact,
                registry=self._registry,
                groq=self._groq,
                id="checkpoints-pane",
            )
            yield SettingsPane(self._config, self._database, id="settings-pane")

    @property
    def current(self) -> str:
        return "settings" if self.query_one("#tools-view", ContentSwitcher).current == "settings-pane" else "probes"

    def show(self, view: str) -> None:
        """Switch the right side; About is a dialog, not a view."""
        if view == "about":
            self.app.push_screen(AboutScreen())
            return
        target = "settings-pane" if view == "settings" else "checkpoints-pane"
        self.query_one("#tools-view", ContentSwitcher).current = target
        menu = self.query_one("#tools-menu", ListView)
        index = next(i for i, (key, _) in enumerate(VIEWS) if key == (view if view != "about" else "probes"))
        if menu.index != index:
            menu.index = index

    @on(ListView.Highlighted, "#tools-menu")
    def _highlighted(self, event: ListView.Highlighted) -> None:
        key = getattr(event.item, "data", None)
        if key in ("probes", "settings"):
            self.show(key)

    @on(ListView.Selected, "#tools-menu")
    def _selected(self, event: ListView.Selected) -> None:
        key = getattr(event.item, "data", None)
        if key == "about":
            self.show("about")
        elif key == "probes":
            self.query_one("#checkpoint-fetch").focus()
        elif key == "settings":
            self.query_one("#theme-picker").focus()

    def on_theme_changed(self) -> None:
        self.query_one(CheckpointsPane).on_theme_changed()
        self.query_one(SettingsPane).on_theme_changed()
