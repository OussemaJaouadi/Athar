"""Unit tests for the LogsPane component."""

from unittest import IsolatedAsyncioTestCase

from textual.app import App, ComposeResult
from textual.widgets import Button, Input, RichLog

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.log_format import render_entry, severity_color
from athar_dataops.ui.panes.logs_pane import LogsPane


class LogsTestApp(App[None]):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.register_theme(DARK)
        self.register_theme(LIGHT)
        self.theme = "athar-dark"

    def compose(self) -> ComposeResult:
        yield LogsPane()


class LogsPaneTests(IsolatedAsyncioTestCase):
    async def test_log_entry_formatting(self):
        app = LogsTestApp()
        async with app.run_test():
            pane = app.query_one(LogsPane)
            pane.clear_logs()

            pane.log_entry("System starting up", "stage")
            pane.log_entry("Found 42 entities", "info")
            pane.log_entry("Deprecated API call", "warning")
            pane.log_entry("Database disconnected", "error")

            log_widget = app.query_one("#logs-console", RichLog)
            self.assertEqual(len(log_widget.lines), 4)

            # Stage line format
            stage_line = str(log_widget.lines[0].text)
            self.assertIn("STAGE", stage_line)
            self.assertIn("│", stage_line)
            self.assertIn("System starting up", stage_line)
            # No brackets around level tag
            self.assertNotIn("[STAGE]", stage_line)
            self.assertNotIn("[ STAGE ]", stage_line)

            # Error line format
            error_line = str(log_widget.lines[3].text)
            self.assertIn("ERROR", error_line)
            self.assertIn("│", error_line)
            self.assertIn("Database disconnected", error_line)
            self.assertNotIn("[ERROR]", error_line)

    async def test_log_line_keeps_fixed_metadata_columns(self):
        entry = LogEntry.create(
            "Provider answered",
            "completed",
            run_id="12345678-abcd",
            step="Finding descriptions to prepare",
        )
        plain = render_entry(entry, dark=True).plain
        self.assertIn("COMPLETED  12345678  Finding descr…", plain)
        self.assertIn("│ Provider answered", plain)
        wrapped = render_entry(
            LogEntry.create(
                "CPU 3.2%\nRSS 45.0 MiB",
                "running",
                run_id="12345678-abcd",
                step="fetch",
            ),
            dark=True,
        ).plain
        self.assertNotIn("\n", wrapped)
        self.assertIn("CPU 3.2% · RSS 45.0 MiB", wrapped)

    async def test_filter_and_search(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            pane.clear_logs()

            pane.log_entry("System starting up", "stage")
            pane.log_entry("Database query ok", "info")
            pane.log_entry("Database query timeout", "error")

            # Filter by error
            await pilot.click("#filter-error")
            log_widget = app.query_one("#logs-console", RichLog)
            self.assertEqual(len(log_widget.lines), 1)
            self.assertIn("Database query timeout", str(log_widget.lines[0].text))

            # Filter all
            await pilot.click("#filter-all")
            self.assertEqual(len(log_widget.lines), 3)

            # Search query
            search_input = app.query_one("#logs-search", Input)
            search_input.value = "timeout"
            await pilot.pause()
            self.assertEqual(len(log_widget.lines), 1)

    async def test_keybindings_and_escape(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            log_widget = app.query_one("#logs-console", RichLog)
            search_input = app.query_one("#logs-search", Input)

            # Bare 'c' and 'a' should NOT clear logs or break console
            initial_count = len(pane._entries)
            await pilot.press("c")
            self.assertEqual(len(pane._entries), initial_count)
            await pilot.press("a")
            self.assertTrue(pane._auto_scroll)

            # Slash should focus search
            await pilot.press("slash")
            self.assertTrue(search_input.has_focus)

            # Type in search
            search_input.value = "test search"
            await pilot.pause()

            # Escape when search has text should clear search
            await pilot.press("escape")
            self.assertEqual(search_input.value, "")

            # Escape when search is empty should refocus console
            await pilot.press("escape")
            self.assertTrue(log_widget.has_focus)

            # Ctrl+L clears logs
            await pilot.press("ctrl+l")
            self.assertEqual(len(pane._entries), 0)

    async def test_light_mode_rebuild(self):
        app = LogsTestApp()
        async with app.run_test():
            pane = app.query_one(LogsPane)
            pane.clear_logs()
            pane.log_entry("Sample info log", "info")
            app.theme = "athar-light"
            pane.on_theme_changed()
            log_widget = app.query_one("#logs-console", RichLog)
            self.assertEqual(len(log_widget.lines), 1)
            line_text = str(log_widget.lines[0].text)
            self.assertIn("INFO", line_text)
            self.assertIn("Sample info log", line_text)

    async def test_rail_labels_are_colored_and_aligned(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            pane.clear_logs()
            pane.log_entry("System starting up", "stage")
            pane.log_entry("Found 42 entities", "info")
            pane.log_entry("Deprecated API call", "warning")
            pane.log_entry("Database disconnected", "error")
            await pilot.pause()

            expected = {
                "#filter-all": ("All", severity_color("all", DARK)),
                "#filter-stage": ("Stage", severity_color("stage", DARK)),
                "#filter-info": ("Info", severity_color("info", DARK)),
                "#filter-warning": ("Warning", severity_color("warning", DARK)),
                "#filter-error": ("Error", severity_color("error", DARK)),
            }

            def span_rgb(label):
                return {
                    tuple(span.style.foreground.rgb)
                    for span in label.spans
                    if span.style.foreground is not None
                }

            for btn_id, (name, color) in expected.items():
                label = app.query_one(btn_id, Button).label
                self.assertNotIsInstance(label, str)
                self.assertTrue(label.plain.startswith(f"● {name.ljust(10)}"))
                self.assertIn(tuple(int(color[i : i + 2], 16) for i in (1, 3, 5)), span_rgb(label))
            self.assertTrue(
                app.query_one("#filter-error", Button).label.plain.endswith("1")
            )

    async def test_rail_arrows_cycle_focus(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            pane.clear_logs()

            self.assertEqual(app.focused.id, "filter-all")

            for button_id in (
                "filter-stage",
                "filter-info",
                "filter-warning",
                "filter-error",
                "toggle-scroll",
                "clear-logs",
                "filter-all",
            ):
                await pilot.press("down")
                self.assertEqual(app.focused.id, button_id)

            await pilot.press("up")
            self.assertEqual(app.focused.id, "clear-logs")

