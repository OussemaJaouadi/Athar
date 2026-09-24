"""Session appearance, configuration, and application identity."""

from rich import box
from rich.table import Table
from rich.text import Text
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.widgets import Label, Select, Static

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
                yield Static("No requests recorded", id="settings-usage", markup=False)

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

    def on_show(self) -> None:
        if self._database:
            self.run_worker(self._load_usage(), exclusive=True, group="usage", exit_on_error=False)

    async def _load_usage(self) -> None:
        try:
            rows = await self._database.profile_overview()
            self.query_one("#settings-usage", Static).update(
                self._profile_usage(rows)
            )
        except Exception:  # noqa: BLE001 - usage is optional UI; never crash the settings tab
            self.query_one("#settings-usage", Static).update("Usage unavailable")

    def _profile_usage(self, rows: list[dict]) -> Text:
        """Compact per-profile lines capped for many profiles."""
        dark = getattr(self.app, "theme", "athar-dark") != "athar-light"
        pal = DARK if dark else LIGHT
        text = Text()
        for entry in rows[:PROFILE_CAP]:
            dot_style = pal.error if entry["disabled"] else pal.success
            state = "disabled" if entry["disabled"] else "active"
            text.append("● ", style=f"bold {dot_style}")
            text.append(f"{entry['name']} · {entry['model']}", style=pal.foreground)
            text.append(f"  {state}", style=pal.variables["muted"])
            text.append("\n")
            today = entry["tokens_today"]
            text.append(
                f"    {entry['calls']} calls · {entry['requests_today']} today · "
                f"{today if today is not None else '—'} tokens today",
                style=pal.variables["muted"],
            )
            text.append("\n")
        if len(rows) > PROFILE_CAP:
            text.append(
                f"… and {len(rows) - PROFILE_CAP} more profiles",
                style=pal.variables["muted"],
            )
        text.rstrip()
        if not rows:
            return Text("No Groq profiles registered", style=pal.variables["muted"])
        return text

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
        try:
            self.query_one("#settings-env-table", Static).update(env_table)
        except Exception:
            pass

        try:
            self.query_one("#settings-tagline", Static).update(
                f"[bold {pri}]An evidence-backed directory of Tunisian startups.[/]\n"
                "Explore entities, track cohorts, review provenance, and verify records against original sources.\n"
            )
        except Exception:
            pass

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
        try:
            self.query_one("#settings-arch-table", Static).update(about_table)
        except Exception:
            pass
