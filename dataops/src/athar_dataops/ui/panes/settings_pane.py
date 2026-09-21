"""Session appearance, configuration, and application identity."""

from rich import box
from rich.table import Table
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.widgets import Label, Select, Static

from athar_dataops.config import Settings
from athar_dataops.themes import DARK, LIGHT


class SettingsPane(VerticalScroll):
    def __init__(self, config: Settings, **kwargs):
        super().__init__(**kwargs)
        self._config = config

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
