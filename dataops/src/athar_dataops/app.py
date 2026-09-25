"""Athar's DataOps TUI application shell."""

from contextlib import suppress
from typing import ClassVar

from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal
from textual.widgets import (
    Button,
    Collapsible,
    Footer,
    Input,
    Label,
    Select,
    Static,
    TabbedContent,
    TabPane,
    Tabs,
)

from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.metrics import ProcessSampler
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.registry import RegistryService
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.dialogs import AboutScreen, HelpScreen
from athar_dataops.ui.panes import (
    CheckpointsPane,
    DatabasePane,
    HistoryPane,
    InspectPane,
    LogsPane,
    RunPane,
    SettingsPane,
)


class Workspace(TabbedContent):
    """Tabbed workspace that ignores focus-restoration tab reverts.

    When a programmatic tab switch hides the previously active pane, Textual
    repairs focus into a widget of that pane; the stock `TabPane.Focused`
    handler then yanks `active` back to the pane being left, swallowing the
    switch. A focus event can only legitimately originate from a *visible*
    pane, so ignore `TabPane.Focused` for hidden panes. `prevent_default()`
    keeps the base class handler from also running.
    """

    def _on_tab_pane_focused(self, event: TabPane.Focused) -> None:
        event.stop()
        event.prevent_default()
        if not event.tab_pane.display:
            return
        if event.tab_pane.id != self.active:
            self.active = event.tab_pane.id


class DataOpsApp(App[None]):
    """Main DataOps TUI application."""

    TITLE = "Athar DataOps"
    CSS_PATH = "app.tcss"
    ENABLE_COMMAND_PALETTE = False

    PANES: ClassVar[list[str]] = ["run", "inspect", "history", "database", "logs", "probes", "settings"]

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("1", "navigate('run')", "Collect", priority=False),
        Binding("2", "navigate('inspect')", "Records", priority=False),
        Binding("3", "navigate('history')", "History", priority=False),
        Binding("4", "navigate('database')", "Database", priority=False),
        Binding("5", "navigate('logs')", "Logs", priority=False),
        Binding("6", "navigate('probes')", "Probes", priority=False),
        Binding("7", "navigate('settings')", "Settings", priority=False),
        Binding("ctrl+1", "navigate('run')", "Collect", show=False, priority=True),
        Binding("ctrl+2", "navigate('inspect')", "Records", show=False, priority=True),
        Binding("ctrl+3", "navigate('history')", "History", show=False, priority=True),
        Binding("ctrl+4", "navigate('database')", "Database", show=False, priority=True),
        Binding("ctrl+5", "navigate('logs')", "Logs", show=False, priority=True),
        Binding("ctrl+6", "navigate('probes')", "Probes", show=False, priority=True),
        Binding("ctrl+7", "navigate('settings')", "Settings", show=False, priority=True),
        Binding("alt+1", "navigate('run')", "Collect", show=False, priority=True),
        Binding("alt+2", "navigate('inspect')", "Records", show=False, priority=True),
        Binding("alt+3", "navigate('history')", "History", show=False, priority=True),
        Binding("alt+4", "navigate('database')", "Database", show=False, priority=True),
        Binding("alt+5", "navigate('logs')", "Logs", show=False, priority=True),
        Binding("alt+6", "navigate('probes')", "Probes", show=False, priority=True),
        Binding("alt+7", "navigate('settings')", "Settings", show=False, priority=True),
        Binding("[", "prev_tab", "Prev Tab", show=False, priority=False),
        Binding("]", "next_tab", "Next Tab", show=False, priority=False),
        Binding(
            "left_square_bracket", "prev_tab", "Prev Tab", show=False, priority=False
        ),
        Binding(
            "right_square_bracket", "next_tab", "Next Tab", show=False, priority=False
        ),
        Binding("alt+left", "prev_tab", "Prev Tab", show=False, priority=True),
        Binding("alt+right", "next_tab", "Next Tab", show=False, priority=True),
        Binding("ctrl+pageup", "prev_tab", "Prev Tab", show=False, priority=True),
        Binding("ctrl+pagedown", "next_tab", "Next Tab", show=False, priority=True),
        Binding("s", "toggle_source", "Source", show=False, priority=False),
        Binding("e", "toggle_source", "Evidence", show=False, priority=False),
        Binding("ctrl+s", "toggle_source", "Source", show=False, priority=True),
        Binding("ctrl+e", "toggle_source", "Evidence", show=False, priority=True),
        Binding("p", "prev_page", "Prev Page", show=False, priority=False),
        Binding("n", "next_page", "Next Page", show=False, priority=False),
        Binding("ctrl+left", "prev_page", "Prev Page", show=False, priority=True),
        Binding("ctrl+right", "next_page", "Next Page", show=False, priority=True),
        Binding("ctrl+p", "prev_page", "Prev Page", show=False, priority=True),
        Binding("ctrl+n", "next_page", "Next Page", show=False, priority=True),
        Binding("f1", "help", "Help"),
        Binding("f6", "toggle_theme", "Theme"),
        Binding("escape", "navigation", "Tabs", show=False),
        Binding("ctrl+q", "quit", "Quit", priority=True),
    ]

    def __init__(
        self,
        orchestrator: PipelineOrchestrator,
        database: DatabaseService,
        config: Settings,
        sampler: ProcessSampler | None = None,
        *,
        artifact: ArtifactService | None = None,
        registry: RegistryService | None = None,
        groq: GroqPreparationClient | None = None,
    ) -> None:
        super().__init__()
        self._orchestrator = orchestrator
        self._database = database
        self._config = config
        self._sampler = sampler
        self._artifact = artifact
        self._registry_service = registry
        self._groq = groq
        self.register_theme(DARK)
        self.register_theme(LIGHT)
        self.theme = "athar-light" if self._config.theme == "light" else "athar-dark"

    def compose(self) -> ComposeResult:
        with Horizontal(id="masthead"):
            yield Label("athar", id="wordmark")
            yield Label("DataOps", id="app-name")
            yield Static("Ready · no active operation", id="masthead-status", markup=False)

        with Workspace(initial="run", id="workspace"):
            with TabPane("Run", id="run"):
                yield RunPane(
                    self._orchestrator, database=self._database, sampler=self._sampler
                )
            with TabPane("Records", id="inspect"):
                yield InspectPane(self._database)
            with TabPane("History", id="history"):
                yield HistoryPane(self._database)
            with TabPane("Database", id="database"):
                yield DatabasePane(self._database, orchestrator=self._orchestrator)
            with TabPane("Logs", id="logs"):
                yield LogsPane()
            with TabPane("Probes", id="probes"):
                yield CheckpointsPane(
                    self._config,
                    artifact=self._artifact,
                    registry=self._registry_service,
                    groq=self._groq,
                    id="checkpoints-pane",
                )
            with TabPane("Settings", id="settings"):
                yield SettingsPane(self._config, self._database)
        yield Footer()

    def on_mount(self) -> None:
        self.call_after_refresh(self.focus_pane)

    def on_resize(self) -> None:
        self.set_class(self.size.width < 100, "compact")

    async def action_quit(self) -> None:
        await self.query_one(RunPane).stop_collection()
        self.exit()

    def action_navigate(self, pane: str) -> None:
        if isinstance(self.screen, (HelpScreen, AboutScreen)):
            self.pop_screen()
        if len(self.screen_stack) == 1:
            self.query_one("#workspace", TabbedContent).active = pane
            self.call_after_refresh(self.focus_pane)

    def action_prev_tab(self) -> None:
        if isinstance(self.focused, Input):
            return
        current = self.query_one("#workspace", TabbedContent).active
        if current in self.PANES:
            idx = self.PANES.index(current)
            self.action_navigate(self.PANES[(idx - 1) % len(self.PANES)])

    def action_next_tab(self) -> None:
        if isinstance(self.focused, Input):
            return
        current = self.query_one("#workspace", TabbedContent).active
        if current in self.PANES:
            idx = self.PANES.index(current)
            self.action_navigate(self.PANES[(idx + 1) % len(self.PANES)])

    def set_workspace_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#masthead-status", Static)
        status.update(text)
        status.set_classes(state)

    def is_operation_running(self) -> bool:
        return self._orchestrator.running

    def action_toggle_source(self) -> None:
        if isinstance(self.focused, Input):
            return
        ws = self.query_one("#workspace", TabbedContent)
        if ws.active != "inspect":
            self.action_navigate("inspect")
        with suppress(Exception):
            col = self.query_one("#source-disclosure", Collapsible)
            col.collapsed = not col.collapsed
            if not col.collapsed:
                col.scroll_visible()

    def action_prev_page(self) -> None:
        if isinstance(self.focused, Input):
            return
        tabbed = self.query_one("#workspace", TabbedContent)
        active = tabbed.active
        if active == "inspect":
            with suppress(Exception):
                self.query_one(InspectPane).action_prev_page()
        elif active == "database":
            with suppress(Exception):
                self.query_one(DatabasePane).action_prev_page()

    def action_next_page(self) -> None:
        if isinstance(self.focused, Input):
            return
        tabbed = self.query_one("#workspace", TabbedContent)
        active = tabbed.active
        if active == "inspect":
            with suppress(Exception):
                self.query_one(InspectPane).action_next_page()
        elif active == "database":
            with suppress(Exception):
                self.query_one(DatabasePane).action_next_page()

    def action_navigation(self) -> None:
        if len(self.screen_stack) == 1:
            with suppress(Exception):
                self.query_one(Tabs).focus()

    def action_help(self) -> None:
        if isinstance(self.screen, HelpScreen):
            self.pop_screen()
        elif len(self.screen_stack) == 1:
            self.push_screen(HelpScreen())

    def action_toggle_theme(self) -> None:
        if len(self.screen_stack) == 1:
            self.set_appearance(
                "athar-light" if self.theme == "athar-dark" else "athar-dark"
            )

    @on(Select.Changed, "#theme-picker")
    def theme_selected(self, event: Select.Changed) -> None:
        if event.value in ("athar-dark", "athar-light"):
            self.set_appearance(str(event.value))

    def set_appearance(self, theme: str) -> None:
        self.theme = theme
        with suppress(Exception):
            self.query_one("#theme-picker", Select).value = theme
        self.log_workspace_event(f"Appearance theme switched to '{theme}'", "info")
        with suppress(Exception):
            self.query_one(LogsPane).on_theme_changed()
        with suppress(Exception):
            self.query_one(InspectPane).on_theme_changed()
        self.query_one(DatabasePane).on_theme_changed()
        with suppress(Exception):
            self.query_one(RunPane).on_theme_changed()
        with suppress(Exception):
            self.query_one(CheckpointsPane).on_theme_changed()
        with suppress(Exception):
            self.query_one(SettingsPane).on_theme_changed()

    def log_workspace_event(self, message: str, level: str = "info") -> None:
        with suppress(Exception):
            self.query_one(LogsPane).log_entry(message, level)

    def focus_pane(self) -> None:
        pane = self.query_one("#workspace", TabbedContent).active
        selectors = {
            "run": "#cancel-pipeline"
            if self.query_one(RunPane).collecting
            else "#run-pipeline",
            "history": "#history-list",
            "inspect": (
                "#records-list"
                if self.query_one("#records-detail").display
                else "#records-search"
            )
            if self.query_one("#records-content").display
            else (
                "#retry-records"
                if self.query_one("#retry-records").display
                else "#go-collect"
            ),
            "database": "#schema-tree",
            "logs": "#filter-all",
            "probes": "#checkpoint-fetch",
            "settings": "#theme-picker",
        }
        if pane in selectors:
            with suppress(Exception):
                self.query_one(selectors[pane]).focus()

    @on(RunPane.CollectionFinished)
    async def collection_finished(self) -> None:
        self.log_workspace_event(
            "Collection completed · refreshed Records and Database views", "stage"
        )
        await self.query_one(InspectPane).refresh_records()
        await self.query_one(DatabasePane).refresh_schema()
        await self.query_one(HistoryPane).refresh_runs()

    @on(DatabasePane.DatabaseWiped)
    async def database_wiped(self, event: DatabasePane.DatabaseWiped) -> None:
        self.log_workspace_event(
            f"Workspace data wiped · {event.deleted} rows deleted · "
            "schema and migrations kept",
            "stage",
        )
        await self.query_one(InspectPane).refresh_records()
        await self.query_one(RunPane).refresh_overview()
        await self.query_one(HistoryPane).refresh_runs()

    @on(Button.Pressed, "#about")
    def show_about(self) -> None:
        self.push_screen(AboutScreen())
