"""Session appearance, configuration, and provider usage. About is its own dialog."""

from contextlib import suppress

from rich.text import Text
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.css.query import NoMatches
from textual.widgets import Label, Select, Static

from athar_dataops.config import Settings
from athar_dataops.schemas.preparation import ProfileOverview
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import PROVIDER
from athar_dataops.themes import palette_for
from athar_dataops.ui.arabic import describe_error
from athar_dataops.ui.widgets.keyvalue import key_value, plain_table

PROFILE_CAP = 6
USAGE_COLUMNS = ("Profile", "State", "Calls", "Today", "Last minute", "Tokens today")
LIMIT_COLUMNS = ("Profile", "Records/day", "Requests/min", "Tokens/day", "Est. tokens/record")


def _limit(value: object) -> str:
    """A quota limit as a whole number with thousands separators; unknown is a dash."""
    if value is None or value == "—":
        return "—"
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return str(value)


class SettingsPane(VerticalScroll):
    def __init__(self, config: Settings, database: DatabaseService | None = None, **kwargs):
        super().__init__(**kwargs)
        self._config = config
        self._database = database
        self._overview: list[ProfileOverview] | None = None
        self._usage_message = "Loading…"

    def compose(self) -> ComposeResult:
        yield Label("Appearance", classes="heading")
        yield Label("Theme", classes="field-label")
        yield Select(
            [("Athar Dark", "athar-dark"), ("Athar Light", "athar-light")],
            value="athar-light" if self._config.theme == "light" else "athar-dark",
            allow_blank=False,
            id="theme-picker",
        )
        yield Label("Configuration", classes="heading", id="settings-env-heading")
        yield Static(id="settings-env-table")
        yield Label("Groq usage", classes="heading")
        yield Static("Loading…", id="settings-usage", classes="muted", markup=False)
        yield Label("Provider limits", classes="heading")
        yield Static("Loading…", id="settings-limits", classes="muted", markup=False)

    def on_mount(self) -> None:
        self.update_tables()

    def on_show(self) -> None:
        if self._database:
            self.run_worker(self._load_usage(), exclusive=True, group="usage", exit_on_error=False)
        else:
            self._show_message("No database")

    async def _load_usage(self) -> None:
        try:
            rows = await self._database.profile_overview()
            # Configured-but-unregistered profiles are shown immediately so a
            # working .env/.env.profiles.toml never looks broken on first launch.
            registered = {entry["name"] for entry in rows}
            for profile in self._config.groq_profiles:
                if profile.name not in registered:
                    rows.append(
                        ProfileOverview(
                            name=profile.name,
                            provider=PROVIDER,
                            model=profile.model or self._config.groq_model,
                            fingerprint="",
                            registered=False,
                            disabled=False,
                            quotas={},
                            calls=0,
                            requests_today=0,
                            requests_minute=0,
                            tokens_today=0.0,
                            input_tokens=0,
                            output_tokens=0,
                            unknown_tokens=0,
                        )
                    )
            self._overview = rows
            self._profile_usage(rows)
            self._profile_limits(rows)
        except Exception as exc:  # noqa: BLE001 - usage is optional UI; never crash the settings tab
            self._show_message(f"Usage unavailable: {describe_error(exc)}", "Limits unavailable")

    def _show_message(self, usage: str, limits: str | None = None) -> None:
        """Replace both tables with one muted line each; nothing to tabulate."""
        self._overview = None
        self._usage_message = usage
        for widget_id, message in (("settings-usage", usage), ("settings-limits", limits or usage)):
            widget = self.query_one(f"#{widget_id}", Static)
            widget.update(message)
            widget.set_classes("muted")

    def _show_table(self, widget_id: str, columns: tuple[str, ...], rows: list[tuple[str, ...]]) -> None:
        """Columns size to their content; words keep one line, numbers sit right-aligned."""
        table = plain_table(
            palette_for(self.app), show_header=True, expand=False, padding=(0, 2), collapse_padding=True,
        )
        for index, column in enumerate(columns):
            words = index < 2 or columns is LIMIT_COLUMNS and index < 1
            table.add_column(
                column, no_wrap=words, overflow="ellipsis" if words else "fold",
                justify="left" if words else "right",
            )
        for row in rows:
            table.add_row(*(Text(str(cell)) for cell in row))
        widget = self.query_one(f"#{widget_id}", Static)
        widget.update(table)
        widget.set_classes("")

    def _profile_usage(self, rows: list[ProfileOverview]) -> None:
        if not rows:
            self._show_message("No Groq profile yet")
            return
        self._overview = rows
        table_rows: list[tuple[str, ...]] = []
        for entry in rows[:PROFILE_CAP]:
            if not entry.get("registered", True):
                state = "Not used yet"
            elif entry.get("disabled"):
                state = "Disabled (key rejected)"
            else:
                state = "Ready"
            tokens_today = entry.get("tokens_today")
            table_rows.append((
                str(entry.get("name", "—")),
                state,
                str(entry.get("calls", 0)),
                str(entry.get("requests_today", 0)),
                str(entry.get("requests_minute", 0)),
                "—" if tokens_today is None else f"{round(tokens_today):,}",
            ))
        if len(rows) > PROFILE_CAP:
            table_rows.append((f"… and {len(rows) - PROFILE_CAP} more profiles", "", "", "", "", ""))
        self._show_table("settings-usage", USAGE_COLUMNS, table_rows)

    def _profile_limits(self, rows: list[ProfileOverview]) -> None:
        if not rows:
            self._show_message("No Groq profile yet")
            return
        table_rows: list[tuple[str, ...]] = []
        for entry in rows[:PROFILE_CAP]:
            quotas = entry.get("quotas", {})
            table_rows.append((
                str(entry.get("name", "—")),
                *(
                    _limit(quotas.get(key, {}).get("limit"))
                    for key in ("records_per_day", "requests_per_minute", "tokens_per_day", "estimate_tokens_per_record")
                ),
            ))
        if len(rows) > PROFILE_CAP:
            table_rows.append((f"… and {len(rows) - PROFILE_CAP} more profiles", "", "", "", ""))
        self._show_table("settings-limits", LIMIT_COLUMNS, table_rows)

    def _profiles_summary(self) -> str:
        names = [profile.name for profile in self._config.groq_profiles]
        if not names:
            warning = self._config.groq_profiles_warning
            return f"not configured · {warning}" if warning else "not configured"
        if len(names) <= 2:
            return ", ".join(names)
        return f"{len(names)} profiles · {names[0]}, {names[1]} …"

    def on_theme_changed(self) -> None:
        self.update_tables()
        if self._overview is not None:
            self._profile_usage(self._overview)
            self._profile_limits(self._overview)

    def update_tables(self) -> None:
        palette = palette_for(self.app)
        env_table = key_value([
            ("Registry URL", str(self._config.registry_url)),
            ("Database", str(self._config.db_path)),
            ("Groq profiles", self._profiles_summary()),
            ("Default model", self._config.groq_model),
            ("Run timeout", f"{self._config.pipeline_timeout_seconds}s"),
        ], palette, key_width=14)
        with suppress(NoMatches):
            self.query_one("#settings-env-table", Static).update(env_table)

