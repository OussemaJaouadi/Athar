"""Unit tests for the LogsPane component."""

from unittest import IsolatedAsyncioTestCase

from textual.app import App, ComposeResult
from textual.widgets import Button, Input, RichLog, Static

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.log_format import render_entry
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
        self.assertIn("COMPLETED  12345678  Finding des…", plain)
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

            # Search query, applied once typing pauses
            search_input = app.query_one("#logs-search", Input)
            search_input.value = "timeout"
            await pilot.pause()
            await app.workers.wait_for_complete()
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
            await app.workers.wait_for_complete()

            # Escape when search is empty should refocus console
            await pilot.press("escape")
            self.assertTrue(log_widget.has_focus)

            # Ctrl+L clears logs
            await pilot.press("ctrl+l")
            self.assertEqual(len(pane._entries), 0)

    async def test_full_buffer_evicts_oldest_without_rebuilding_console(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            pane.clear_logs()
            rebuilds = []
            original = pane._rebuild_console
            pane._rebuild_console = lambda: rebuilds.append(1) or original()
            for index in range(LogsPane.MAX_ENTRIES + 150):
                pane.log_entry(f"entry {index}", "error" if index % 2 else "info")
            self.assertEqual(rebuilds, [], "a full buffer must not redraw the console per entry")
            self.assertEqual(len(pane._entries), LogsPane.MAX_ENTRIES)
            self.assertEqual(pane._entries[0].message, "entry 150")
            self.assertTrue(
                app.query_one("#filter-all", Button).label.plain.endswith(str(LogsPane.MAX_ENTRIES))
            )
            self.assertTrue(app.query_one("#filter-error", Button).label.plain.endswith("1000"))
            self.assertTrue(app.query_one("#filter-info", Button).label.plain.endswith("1000"))
            app.query_one("#logs-console", RichLog)
            self.assertIn(f"2000 of {LogsPane.MAX_ENTRIES}", str(app.query_one("#logs-title", Static).render()))
            # Filter changes still rebuild once and recount visible entries.
            app.query_one("#filter-error", Button).press()
            await pilot.pause()
            self.assertEqual(len(rebuilds), 1)
            self.assertIn("1000 of 2000", str(app.query_one("#logs-title", Static).render()))

    async def test_search_rebuild_is_one_batched_write_of_the_newest_matches(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            pane.clear_logs()
            for index in range(1200):
                pane.log_entry(f"entry {index}", "info")
            console = app.query_one("#logs-console", RichLog)
            writes = []
            original = console.write
            console.write = lambda content, *a, **k: writes.append(content) or original(content, *a, **k)
            app.query_one("#logs-search", Input).value = "entry"
            await pilot.pause()
            await app.workers.wait_for_complete()
            await pilot.pause()
            self.assertEqual(len(writes), 1, "a rebuild must be one write, not one per entry")
            self.assertEqual(len(console.lines), LogsPane.REBUILD_LIMIT + 1)
            self.assertIn("700 earlier matching entries", str(console.lines[0].text))
            self.assertIn("entry 1199", str(console.lines[-1].text))
            self.assertIn("1200 of 1200", str(app.query_one("#logs-title", Static).render()))

    async def test_rail_arrows_cycle_focus(self):
        app = LogsTestApp()
        async with app.run_test() as pilot:
            pane = app.query_one(LogsPane)
            pane.clear_logs()

            search = app.query_one("#logs-search", Input)
            search.focus()
            await pilot.pause()
            await pilot.press("right")
            await pilot.pause()
            self.assertIs(app.focused, search, "arrows in the search box must not move focus")

            app.query_one("#filter-all", Button).focus()
            await pilot.pause()
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
                await pilot.press("right")
                self.assertEqual(app.focused.id, button_id)

            await pilot.press("left")
            self.assertEqual(app.focused.id, "clear-logs")

