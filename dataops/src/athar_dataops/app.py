"""Athar's DataOps TUI application shell."""

from contextlib import suppress
from typing import ClassVar

from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal
from textual.css.query import NoMatches
from textual.widgets import (
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
    DatabasePane,
    InspectPane,
    LogsPane,
    RunPane,
    ToolsPane,
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

    PANES: ClassVar[list[str]] = ["pipeline", "review", "data", "tools"]
    # Old names still navigate, so callers and tests that say "run" or "settings" keep working.
    ALIASES: ClassVar[dict[str, tuple[str, str | None]]] = {
        "run": ("pipeline", None), "history": ("pipeline", None), "logs": ("pipeline", None),
        "inspect": ("review", None), "database": ("data", None),
        "probes": ("tools", "probes"), "settings": ("tools", "settings"), "about": ("tools", "about"),
    }

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("1", "navigate('pipeline')", "Pipeline", priority=False),
        Binding("2", "navigate('review')", "Review", priority=False),
        Binding("3", "navigate('data')", "Data", priority=False),
        Binding("4", "navigate('tools')", "Tools", priority=False),
        Binding("ctrl+1", "navigate('pipeline')", "Pipeline", show=False, priority=True),
        Binding("ctrl+2", "navigate('review')", "Review", show=False, priority=True),
        Binding("ctrl+3", "navigate('data')", "Data", show=False, priority=True),
        Binding("ctrl+4", "navigate('tools')", "Tools", show=False, priority=True),
        Binding("alt+1", "navigate('pipeline')", "Pipeline", show=False, priority=True),
        Binding("alt+2", "navigate('review')", "Review", show=False, priority=True),
        Binding("alt+3", "navigate('data')", "Data", show=False, priority=True),
        Binding("alt+4", "navigate('tools')", "Tools", show=False, priority=True),
        Binding("[", "prev_tab", "Prev Tab", show=False, priority=False),
        Binding("]", "next_tab", "Next Tab", show=False, priority=False),
        Binding("left_square_bracket", "prev_tab", "Prev Tab", show=False, priority=False),
        Binding("right_square_bracket", "next_tab", "Next Tab", show=False, priority=False),
        Binding("alt+left", "prev_tab", "Prev Tab", show=False, priority=True),
        Binding("alt+right", "next_tab", "Next Tab", show=False, priority=True),
        Binding("ctrl+pageup", "prev_tab", "Prev Tab", show=False, priority=True),
        Binding("ctrl+pagedown", "next_tab", "Next Tab", show=False, priority=True),
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

        with Workspace(initial="pipeline", id="workspace"):
            with TabPane("Pipeline", id="pipeline"):
                yield RunPane(
                    self._orchestrator,
                    database=self._database,
                    sampler=self._sampler,
                    profiles_warning=self._config.groq_profiles_warning,
                )
            with TabPane("Review", id="review"):
                yield InspectPane(self._database)
            with TabPane("Data", id="data"):
                yield DatabasePane(self._database, orchestrator=self._orchestrator)
            with TabPane("Tools", id="tools"):
                yield ToolsPane(
                    self._config,
                    self._database,
                    artifact=self._artifact,
                    registry=self._registry_service,
                    groq=self._groq,
                )
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
        if len(self.screen_stack) != 1:
            return
        target, view = self.ALIASES.get(pane, (pane, None))
        self.query_one("#workspace", TabbedContent).active = target
        if view:
            self.query_one(ToolsPane).show(view)
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

    def action_navigation(self) -> None:
        """Escape backs out one level: a pane may consume it, else the tab bar takes focus."""
        if len(self.screen_stack) != 1:
            return
        active = self.query_one("#workspace", TabbedContent).active
        pane = {
            "pipeline": RunPane, "review": InspectPane, "data": DatabasePane, "tools": ToolsPane,
        }.get(active)
        if pane is not None:
            with suppress(NoMatches):
                handler = getattr(self.query_one(pane), "handle_escape", None)
                if handler is not None and handler():
                    return
        with suppress(NoMatches):
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
        with suppress(NoMatches):
            self.query_one("#theme-picker", Select).value = theme
        self.log_workspace_event(f"Appearance theme switched to '{theme}'", "info")
        for pane in (RunPane, InspectPane, DatabasePane, ToolsPane):
            with suppress(NoMatches):
                self.query_one(pane).on_theme_changed()

    def log_workspace_event(self, message: str, level: str = "info") -> None:
        with suppress(NoMatches):
            self.query_one(LogsPane).log_entry(message, level)

    def focus_pane(self) -> None:
        pane = self.query_one("#workspace", TabbedContent).active
        selectors = {
            "pipeline": "#cancel-pipeline" if self.query_one(RunPane).collecting else "#run-pipeline",
            "review": (
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
            "data": "#schema-tree",
            "tools": "#tools-menu",
        }
        if pane in selectors:
            with suppress(NoMatches):
                self.query_one(selectors[pane]).focus()

    @on(RunPane.CollectionFinished)
    async def collection_finished(self) -> None:
        self.log_workspace_event("Run completed · Review and Data refreshed", "stage")
        await self.query_one(InspectPane).refresh_records()
        await self.query_one(DatabasePane).refresh_schema()

    @on(RunPane.RegistryReset)
    async def registry_reset(self, event: RunPane.RegistryReset) -> None:
        self.log_workspace_event(
            f"Registry data reset · {event.deleted} rows deleted · Groq usage kept",
            "stage",
        )
        await self.query_one(InspectPane).refresh_records()
        await self.query_one(DatabasePane).refresh_schema()

    @on(DatabasePane.DatabaseWiped)
    async def database_wiped(self, event: DatabasePane.DatabaseWiped) -> None:
        self.log_workspace_event(
            f"Workspace data wiped · {event.deleted} rows deleted · "
            "schema and migrations kept",
            "stage",
        )
        await self.query_one(InspectPane).refresh_records()
        await self.query_one(RunPane).refresh_overview()
        await self.query_one(RunPane).refresh_runs()
