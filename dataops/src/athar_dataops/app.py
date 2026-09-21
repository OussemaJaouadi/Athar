"""Athar's DataOps TUI application shell."""

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
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.dialogs import AboutScreen, HelpScreen
from athar_dataops.ui.panes import (
    DatabasePane,
    InspectPane,
    LogsPane,
    RunPane,
    SettingsPane,
)
from athar_dataops.ui.widgets.progress import PipelineProgress


class DataOpsApp(App[None]):
    """Main DataOps TUI application."""

    TITLE = "Athar DataOps"
    CSS_PATH = "app.tcss"
    ENABLE_COMMAND_PALETTE = False

    PANES = ["run", "inspect", "database", "logs", "settings"]

    BINDINGS = [
        Binding("1", "navigate('run')", "Collect", priority=False),
        Binding("2", "navigate('inspect')", "Records", priority=False),
        Binding("3", "navigate('database')", "Database", priority=False),
        Binding("4", "navigate('logs')", "Logs", priority=False),
        Binding("5", "navigate('settings')", "Settings", priority=False),
        Binding("ctrl+1", "navigate('run')", "Collect", show=False, priority=True),
        Binding("ctrl+2", "navigate('inspect')", "Records", show=False, priority=True),
        Binding(
            "ctrl+3", "navigate('database')", "Database", show=False, priority=True
        ),
        Binding("ctrl+4", "navigate('logs')", "Logs", show=False, priority=True),
        Binding(
            "ctrl+5", "navigate('settings')", "Settings", show=False, priority=True
        ),
        Binding("alt+1", "navigate('run')", "Collect", show=False, priority=True),
        Binding("alt+2", "navigate('inspect')", "Records", show=False, priority=True),
        Binding("alt+3", "navigate('database')", "Database", show=False, priority=True),
        Binding("alt+4", "navigate('logs')", "Logs", show=False, priority=True),
        Binding("alt+5", "navigate('settings')", "Settings", show=False, priority=True),
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
    ) -> None:
        super().__init__()
        self._orchestrator = orchestrator
        self._database = database
        self._config = config
        self.register_theme(DARK)
        self.register_theme(LIGHT)
        self.theme = "athar-dark"

    def compose(self) -> ComposeResult:
        # Workspace identity; this label makes no health claim.
        with Horizontal(id="masthead"):
            yield Label("athar", id="wordmark")
            yield Label("DataOps", id="app-name")
            yield Static("Local workspace", id="masthead-status", markup=False)

        # Main workspace tabs
        with TabbedContent(initial="run", id="workspace"):
            with TabPane("Collect", id="run"):
                yield RunPane(self._orchestrator, database=self._database)
            with TabPane("Records", id="inspect"):
                yield InspectPane(self._database)
            with TabPane("Database", id="database"):
                yield DatabasePane(self._database)
            with TabPane("Logs", id="logs"):
                yield LogsPane()
            with TabPane("Settings", id="settings"):
                yield SettingsPane(self._config)

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

    def action_toggle_source(self) -> None:
        if isinstance(self.focused, Input):
            return
        ws = self.query_one("#workspace", TabbedContent)
        if ws.active != "inspect":
            self.action_navigate("inspect")
        try:
            col = self.query_one("#source-disclosure", Collapsible)
            col.collapsed = not col.collapsed
            if not col.collapsed:
                col.scroll_visible()
        except Exception:
            pass

    def action_prev_page(self) -> None:
        if isinstance(self.focused, Input):
            return
        tabbed = self.query_one("#workspace", TabbedContent)
        active = tabbed.active
        if active == "inspect":
            try:
                self.query_one(InspectPane).action_prev_page()
            except Exception:
                pass
        elif active == "database":
            try:
                self.query_one(DatabasePane).action_prev_page()
            except Exception:
                pass

    def action_next_page(self) -> None:
        if isinstance(self.focused, Input):
            return
        tabbed = self.query_one("#workspace", TabbedContent)
        active = tabbed.active
        if active == "inspect":
            try:
                self.query_one(InspectPane).action_next_page()
            except Exception:
                pass
        elif active == "database":
            try:
                self.query_one(DatabasePane).action_next_page()
            except Exception:
                pass

    def action_navigation(self) -> None:
        if len(self.screen_stack) == 1:
            try:
                self.query_one(Tabs).focus()
            except Exception:
                pass

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
        try:
            self.query_one("#theme-picker", Select).value = theme
        except Exception:
            pass
        self.log_workspace_event(f"Appearance theme switched to '{theme}'", "info")
        try:
            self.query_one(LogsPane).on_theme_changed()
        except Exception:
            pass
        try:
            self.query_one(InspectPane).on_theme_changed()
        except Exception:
            pass
        self.query_one(DatabasePane).on_theme_changed()
        self.query_one(PipelineProgress).on_theme_changed()
        try:
            self.query_one(SettingsPane).on_theme_changed()
        except Exception:
            pass

    def log_workspace_event(self, message: str, level: str = "info") -> None:
        try:
            self.query_one(LogsPane).log_entry(message, level)
        except Exception:
            pass

    def focus_pane(self) -> None:
        pane = self.query_one("#workspace", TabbedContent).active
        selectors = {
            "run": "#cancel-pipeline"
            if self.query_one(RunPane).collecting
            else "#run-pipeline",
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
            "settings": "#theme-picker",
        }
        if pane in selectors:
            self.query_one(selectors[pane]).focus()

    @on(RunPane.CollectionFinished)
    async def collection_finished(self) -> None:
        self.log_workspace_event(
            "Collection completed · refreshed Records and Database views", "stage"
        )
        await self.query_one(InspectPane).refresh_records()
        await self.query_one(DatabasePane).refresh_schema()

    @on(Button.Pressed, "#about")
    def show_about(self) -> None:
        self.push_screen(AboutScreen())
