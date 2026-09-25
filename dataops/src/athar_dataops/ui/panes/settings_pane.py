"""Session appearance, configuration, and application identity."""

from contextlib import suppress

from rich import box
from rich.table import Table
from rich.text import Text
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.widgets import DataTable, Label, Select, Static

from athar_dataops.config import Settings
from athar_dataops.services.database import DatabaseService
from athar_dataops.themes import DARK, LIGHT

PROFILE_CAP = 6


class SettingsPane(VerticalScroll):
    def __init__(self, config: Settings, database: DatabaseService | None = None, **kwargs):
        super().__init__(**kwargs)
        self._config = config
        self._database = database

    def compose(self) -> ComposeResult:
        with Horizontal(classes="split", id="settings-split"):
            # Left Column: Configuration & Preferences
            with VerticalScroll(classes="rail", id="settings-config-card"):
                yield Label("Preferences & Appearance", classes="heading")
                yield Label("Theme Appearance", classes="field-label")
                yield Select(
                    [("Athar Dark", "athar-dark"), ("Athar Light", "athar-light")],
                    value=(
                        "athar-light" if self._config.theme == "light" else "athar-dark"
                    ),
                    allow_blank=False,
                    id="theme-picker",
                )

                yield Label(
                    "Workspace Settings", classes="heading", id="settings-env-heading"
                )
                yield Static(id="settings-env-table")
                yield Label("Groq usage", classes="heading")
                yield DataTable(id="settings-usage", cursor_type="row", zebra_stripes=True)
                yield Label("Provider limits", classes="heading")
                yield DataTable(id="settings-limits", cursor_type="row", zebra_stripes=True)

            # Right Column: Application Identity (No modal, no internal dev fluff)
            with VerticalScroll(classes="detail", id="settings-about-card"):
                yield Label("About Athar", classes="heading")
                yield Static(id="settings-tagline", markup=True)
                yield Static(id="settings-arch-table")
                yield Static(
                    "\n[dim]All claims remain traceable to durable, preserved source artifacts.[/]",
                    markup=True,
                    id="settings-footer-note",
                )

    def on_mount(self) -> None:
        self.update_tables()
        self._configure_tables()

    def on_show(self) -> None:
        if self._database:
            self.run_worker(self._load_usage(), exclusive=True, group="usage", exit_on_error=False)
        else:
            self._set_table_message(self.query_one("#settings-usage", DataTable), "No database")
            self._set_table_message(self.query_one("#settings-limits", DataTable), "No database")

    def _configure_tables(self) -> None:
        self.query_one("#settings-usage", DataTable).add_columns(
            "Profile", "Model", "State", "Calls", "Req today", "Req/min", "Tokens today"
        )
        self.query_one("#settings-limits", DataTable).add_columns(
            "Profile", "Records/day", "Req/min", "Tokens/day", "Est./record"
        )

    async def _load_usage(self) -> None:
        try:
            rows = await self._database.profile_overview()
            self._profile_usage(rows)
            self._profile_limits(rows)
        except Exception:  # noqa: BLE001 - usage is optional UI; never crash the settings tab
            self._set_table_message(self.query_one("#settings-usage", DataTable), "Usage unavailable")
            self._set_table_message(self.query_one("#settings-limits", DataTable), "Limits unavailable")

    def _clear_table(self, table: DataTable) -> None:
        table.clear()
        table.cursor_type = "row"
        table.zebra_stripes = True

    def _set_table_message(self, table: DataTable, message: str) -> None:
        self._clear_table(table)
        table.add_row(message, *["" for _ in range(len(table.columns) - 1)])

    def _profile_usage(self, rows: list[dict]) -> None:
        table = self.query_one("#settings-usage", DataTable)
        self._clear_table(table)
        if not rows:
            self._set_table_message(table, "No Groq profiles registered")
            return
        for entry in rows[:PROFILE_CAP]:
            state = "disabled" if entry.get("disabled") else "active"
            tokens_today = entry.get("tokens_today")
            table.add_row(
                str(entry.get("name", "—")),
                str(entry.get("model", "—")),
                state,
                str(entry.get("calls", 0)),
                str(entry.get("requests_today", 0)),
                str(entry.get("requests_minute", 0)),
                "—" if tokens_today is None else str(tokens_today),
                key=str(entry.get("name", "")),
            )
        if len(rows) > PROFILE_CAP:
            table.add_row(f"… and {len(rows) - PROFILE_CAP} more profiles", *["" for _ in range(6)])
        return Text(
            " ".join(str(entry.get("name", "—")) for entry in rows[:PROFILE_CAP])
            + (f" … and {len(rows) - PROFILE_CAP} more profiles" if len(rows) > PROFILE_CAP else "")
        )

    def _profile_limits(self, rows: list[dict]) -> None:
        table = self.query_one("#settings-limits", DataTable)
        self._clear_table(table)
        if not rows:
            self._set_table_message(table, "No provider profiles configured")
            return
        for entry in rows[:PROFILE_CAP]:
            quotas = entry.get("quotas", {})
            estimate = quotas.get("estimate_tokens_per_record", {}).get("limit", "—")
            table.add_row(
                str(entry.get("name", "—")),
                str(quotas.get("records_per_day", {}).get("limit", "—")),
                str(quotas.get("requests_per_minute", {}).get("limit", "—")),
                str(quotas.get("tokens_per_day", {}).get("limit", "—")),
                str(estimate),
                key=str(entry.get("name", "")),
            )
        if len(rows) > PROFILE_CAP:
            table.add_row(f"… and {len(rows) - PROFILE_CAP} more profiles", *["" for _ in range(4)])

    def _profiles_summary(self) -> str:
        names = [profile.name for profile in self._config.groq_profiles]
        if not names:
            return "not configured"
        if len(names) <= 2:
            return ", ".join(names)
        return f"{len(names)} profiles · {names[0]}, {names[1]} …"

    def on_theme_changed(self) -> None:
        self.update_tables()

    def update_tables(self) -> None:
        is_dark = getattr(self.app, "theme", "athar-dark") != "athar-light"
        pri = (DARK if is_dark else LIGHT).primary

        env_table = Table(
            box=box.ROUNDED,
            expand=True,
            show_header=True,
            header_style=f"bold {pri}",
        )
        env_table.add_column("Setting", style=f"bold {pri}", width=16)
        env_table.add_column("Value")
        env_table.add_row("Registry Source", str(self._config.registry_url))
        env_table.add_row("Database Location", str(self._config.db_path))
        env_table.add_row("Groq profiles", self._profiles_summary())
        env_table.add_row("Groq default model", self._config.groq_model)
        env_table.add_row(
            "Pipeline Timeout", f"{self._config.pipeline_timeout_seconds}s"
        )
        with suppress(Exception):
            self.query_one("#settings-env-table", Static).update(env_table)

        with suppress(Exception):
            self.query_one("#settings-tagline", Static).update(
                f"[bold {pri}]An evidence-backed directory of Tunisian startups.[/]\n"
                "Explore entities, track cohorts, review provenance, and verify records against original sources.\n"
            )

        about_table = Table(
            box=box.ROUNDED,
            expand=True,
            show_header=True,
            header_style=f"bold {pri}",
        )
        about_table.add_column("Property", style=f"bold {pri}", width=18)
        about_table.add_column("Details")
        about_table.add_row("Application", "Athar DataOps")
        about_table.add_row("Version", "0.1.0")
        about_table.add_row("Dataset Scope", "Tunisian Startup Registry & Ecosystem")
        about_table.add_row(
            "Data Guarantee", "Immutable snapshots with byte-exact SHA-256 verification"
        )
        about_table.add_row(
            "Workspace Mode", "Local-first desktop research environment"
        )
        with suppress(Exception):
            self.query_one("#settings-arch-table", Static).update(about_table)
