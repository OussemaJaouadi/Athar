"""Exercise actual TUI actions with real temporary storage and fake registry HTTP."""

import asyncio
import tempfile
from importlib.resources import files
from io import StringIO
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

import httpx
from rich.console import Console
from test_pipeline import registry_row
from textual.widgets import (
    Button,
    Collapsible,
    DataTable,
    Input,
    Label,
    ListView,
    Static,
    TabbedContent,
)

from athar_dataops.app import DataOpsApp
from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.registry import RegistryService
from athar_dataops.ui.dialogs import AboutScreen, HelpScreen
from athar_dataops.ui.panes import (
    DatabasePane,
    HistoryPane,
    RunPane,
)


def render_text(renderable):
    stream = StringIO()
    Console(file=stream, width=120, color_system=None).print(renderable)
    return stream.getvalue()


class WorkspaceTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = Settings(
            db_path=Path(self.directory.name) / "ui.db", theme="dark"
        )
        self.db = DatabaseService(self.config.db_path)
        await self.db.initialize()
        self.block = False
        self.http_status = 200
        self.fixture_rows = [registry_row(name="[bold]Literal company")]
        self.fetch_started = asyncio.Event()
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.respond))
        self.orchestrator = PipelineOrchestrator(
            ArtifactService(self.client, "https://registry.example"),
            RegistryService(),
            self.db,
        )

    async def respond(self, request):
        self.fetch_started.set()
        if self.block:
            await asyncio.Event().wait()
        return httpx.Response(self.http_status, json=self.fixture_rows)

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.db.close()
        self.directory.cleanup()

    def app(self):
        return DataOpsApp(self.orchestrator, self.db, self.config)

    async def wait_for_collection(self, app, pilot):
        async with asyncio.timeout(10):
            while app.query_one(RunPane).collecting:
                await pilot.pause(0.05)
        await pilot.pause()

    async def test_collection_inspection_table_preview_and_navigation(self):
        for size in ((80, 24), (120, 40)):
            with self.subTest(size=size):
                app = self.app()
                async with app.run_test(size=size) as pilot:
                    await pilot.pause()
                    self.assertTrue(await pilot.click("#run-pipeline"))
                    await self.wait_for_collection(app, pilot)
                    self.assertIn(
                        "COMPLETED",
                        render_text(app.query_one("#stat-status-val", Label).render()),
                    )
                    await pilot.press("ctrl+2")
                    await pilot.pause()
                    self.assertEqual(
                        app.query_one("#workspace", TabbedContent).active, "inspect"
                    )
                    self.assertEqual(
                        len(app.query_one("#records-list", ListView).children), 1
                    )
                    self.assertIn(
                        "Concrete product detail",
                        render_text(app.query_one("#detail-original", Static).render()),
                    )
                    self.assertIn(
                        "[bold]Literal company",
                        str(app.query_one("#detail-title", Label).render()),
                    )
                    await pilot.press("ctrl+3")
                    await pilot.pause()
                    self.assertEqual(
                        app.query_one("#workspace", TabbedContent).active, "history"
                    )
                    await pilot.press("ctrl+4")
                    await pilot.pause()
                    pane = app.query_one(DatabasePane)
                    pane._table = "source_rows"
                    await pane._show_table()
                    self.assertEqual(
                        app.query_one("#results-table", DataTable).row_count, 1
                    )
                    self.assertFalse(app.query("#sql-editor"))
                    self.assertFalse(app.query("#run-query"))
                    await pilot.press("ctrl+5", "f6")
                    self.assertEqual(app.theme, "athar-light")
                    await pilot.press("f6", "f1")
                    self.assertIsInstance(app.screen, HelpScreen)
                    await pilot.press("escape")
                    self.assertEqual(len(app.screen_stack), 1)

    async def test_cancellation_keeps_ui_responsive_and_restores_button(self):
        self.block = True
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.click("#run-pipeline")
            await asyncio.wait_for(self.fetch_started.wait(), 5)
            await pilot.press("ctrl+7")
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "settings"
            )
            await pilot.press("ctrl+1")
            await pilot.click("#cancel-pipeline")
            await self.wait_for_collection(app, pilot)
            self.assertFalse(app.query_one("#run-pipeline", Button).disabled)
            self.assertIn(
                "CANCELLED",
                render_text(app.query_one("#stat-status-val", Label).render()),
            )
            runs = await self.db.table_page("pipeline_runs")
            self.assertEqual(
                dict(zip(runs.columns, runs.rows[0]))["status"], "cancelled"
            )

    async def test_record_details_are_readable_and_source_is_on_demand(self):
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.press("ctrl+2")
            await pilot.pause()
            self.assertTrue(app.query_one("#records-list", ListView).has_focus)
            self.assertIn(
                "Concrete product detail",
                str(app.query_one("#detail-description", Static).render()),
            )
            source = app.query_one("#source-disclosure", Collapsible)
            self.assertTrue(source.collapsed)
            self.assertFalse(app.query_one("#records-pager").display)
            self.assertFalse(app.query_one("#review-section").display)
            source.collapsed = False
            await pilot.pause()
            self.assertIn(
                "synthetic-private-value",
                render_text(app.query_one("#detail-original", Static).render()),
            )

    async def test_empty_records_offer_collection_and_activity_starts_hidden(self):
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            self.assertFalse(app.query_one("#run-activity").display)
            self.assertFalse(app.query_one("#cancel-pipeline").display)
            await pilot.press("ctrl+2")
            await pilot.pause()
            self.assertTrue(app.query_one("#records-empty").display)
            self.assertFalse(app.query_one("#records-content").display)
            await pilot.click("#go-collect")
            await pilot.pause()
            self.assertEqual(app.query_one("#workspace", TabbedContent).active, "run")
            self.assertTrue(app.query_one("#run-pipeline", Button).has_focus)

    async def test_quit_cancels_before_services_close(self):
        self.block = True
        app = self.app()
        async with app.run_test() as pilot:
            await pilot.click("#run-pipeline")
            await asyncio.wait_for(self.fetch_started.wait(), 5)
            await pilot.press("ctrl+q")
        runs = await self.db.table_page("pipeline_runs")
        self.assertEqual(dict(zip(runs.columns, runs.rows[0]))["status"], "cancelled")

    async def test_http_failure_restores_controls(self):
        self.http_status = 503
        app = self.app()
        async with app.run_test() as pilot:
            await pilot.click("#run-pipeline")
            await self.wait_for_collection(app, pilot)
            self.assertFalse(app.query_one("#run-pipeline", Button).disabled)
            self.assertTrue(app.query_one("#cancel-pipeline", Button).disabled)
            self.assertIn(
                "FAILED", render_text(app.query_one("#stat-status-val", Label).render())
            )
            self.assertEqual(
                len((await self.db.table_page("source_snapshots")).rows), 0
            )

    async def test_search_finds_record_beyond_first_page_and_clears_stale_detail(self):
        self.fixture_rows = [
            registry_row(name=f"Company {i}", website=f"company{i}.example")
            for i in range(105)
        ]
        self.fixture_rows.append(registry_row(name="Needle", website="needle.example"))
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await pilot.press("ctrl+2")
            await pilot.pause()
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "inspect"
            )
            search = app.query_one("#records-search", Input)
            search.focus()
            search.value = "Needle"
            await pilot.pause()
            await app.workers.wait_for_complete()
            await pilot.pause()
            self.assertEqual(len(app.query_one("#records-list", ListView).children), 1)
            self.assertIn(
                "Needle", render_text(app.query_one("#detail-title", Label).render())
            )
            search.value = "absent"
            await pilot.pause()
            await app.workers.wait_for_complete()
            await pilot.pause()
            self.assertTrue(app.query_one("#records-no-match").display)
            self.assertFalse(app.query_one("#records-detail").display)
            self.assertNotIn(
                "Needle", render_text(app.query_one("#detail-title", Label).render())
            )
            search.value = "Company"
            await pilot.pause()
            await app.workers.wait_for_complete()
            await pilot.pause()
            self.assertTrue(await pilot.click("#records-next"))
            await pilot.pause()
            self.assertEqual(search.value, "Company")
            self.assertEqual(len(app.query_one("#records-list", ListView).children), 5)
            self.assertIn(
                "101–105 of 105",
                render_text(app.query_one("#records-count", Static).render()),
            )

    async def test_narrow_database_inspection_preserves_selected_row(self):
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.press("ctrl+4")
            pane = app.query_one(DatabasePane)
            pane._table = "entities"
            await pane._show_table()
            table = app.query_one("#results-table", DataTable)
            table.focus()
            await pilot.pause()
            self.assertFalse(app.query_one("#db-drawer").display)
            self.assertGreater(table.size.width, 35)
            await pilot.press("enter")
            await pilot.pause()
            self.assertTrue(app.query_one("#db-drawer").display)
            self.assertFalse(app.query_one("#db-detail").display)
            await pilot.press("escape")
            await pilot.pause()
            self.assertTrue(app.query_one("#db-detail").display)
            self.assertTrue(table.has_focus)
            self.assertEqual(table.cursor_row, 0)
            await pilot.resize_terminal(120, 40)
            await pilot.pause()
            self.assertTrue(app.query_one("#db-drawer").display)
            self.assertTrue(app.query_one("#db-detail").display)

    async def test_primary_button_contrast_and_honest_workspace_label(self):
        def luminance(color):
            channels = [v / 255 for v in color.rgb]
            linear = [
                v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
                for v in channels
            ]
            return sum(
                v * weight for v, weight in zip(linear, (0.2126, 0.7152, 0.0722))
            )

        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            button = app.query_one("#run-pipeline", Button)
            for theme in ("athar-light", "athar-dark"):
                app.set_appearance(theme)
                button.focus()
                await pilot.pause()
                a, b = sorted(
                    [
                        luminance(button.styles.color),
                        luminance(button.styles.background),
                    ]
                )
                self.assertGreaterEqual((b + 0.05) / (a + 0.05), 4.5)
            with patch.object(
                self.db, "get_overview_stats", side_effect=RuntimeError("Unavailable")
            ):
                await app.query_one(RunPane)._update_stats()
            self.assertIn(
                "UNKNOWN",
                render_text(app.query_one("#stat-status-val", Label).render()),
            )
            self.assertIn(
                "—", render_text(app.query_one("#stat-entities-val", Label).render())
            )
            self.assertNotIn(
                "OPERATIONAL",
                render_text(app.query_one("#masthead-status", Static).render()),
            )

    async def test_about_resizes(self):
        app = self.app()
        async with app.run_test(size=(120, 70)) as pilot:
            app.push_screen(AboutScreen())
            await pilot.pause()
            self.assertNotEqual(
                app.screen.query_one("#ascii-mark").styles.display, "none"
            )
            await pilot.resize_terminal(80, 24)
            await pilot.pause()
            self.assertEqual(app.screen.query_one("#ascii-mark").styles.display, "none")

    async def test_tab_switching_keybindings(self):
        app = self.app()
        async with app.run_test() as pilot:
            ws = app.query_one("#workspace", TabbedContent)
            self.assertEqual(ws.active, "run")

            # Test direct numbers
            await pilot.press("2")
            await pilot.pause()
            self.assertEqual(ws.active, "inspect")

            await pilot.press("3")
            await pilot.pause()
            self.assertEqual(ws.active, "history")

            await pilot.press("4")
            await pilot.pause()
            self.assertEqual(ws.active, "database")

            await pilot.press("5")
            await pilot.pause()
            self.assertEqual(ws.active, "logs")

            await pilot.press("6")
            await pilot.pause()
            self.assertEqual(ws.active, "probes")

            await pilot.press("7")
            await pilot.pause()
            self.assertEqual(ws.active, "settings")

            await pilot.press("1")
            await pilot.pause()
            self.assertEqual(ws.active, "run")

            # Test bracket cycling
            await pilot.press("]")
            await pilot.pause()
            self.assertEqual(ws.active, "inspect")

            await pilot.press("[")
            await pilot.pause()
            self.assertEqual(ws.active, "run")

            # Test Alt+Left / Alt+Right
            await pilot.press("alt+right")
            await pilot.pause()
            self.assertEqual(ws.active, "inspect")

            await pilot.press("alt+left")
            await pilot.pause()
            self.assertEqual(ws.active, "run")

    async def test_step_selection_filters_live_logs_and_preserves_tab_keys(self):
        from unittest.mock import Mock

        from textual.widgets import RichLog

        from athar_dataops.schemas.pipeline import StageProgress
        from athar_dataops.services.metrics import ProcessSample
        from athar_dataops.ui.widgets.log_view import LogView
        from athar_dataops.ui.widgets.run_timeline import RunTimeline

        self.block = True
        app = self.app()
        async with app.run_test(size=(120, 50)) as pilot:
            pane = app.query_one(RunPane)
            sampler = Mock()
            sampler.sample.return_value = ProcessSample(1, 0.2, 1048576)
            pane._sampler = sampler
            await pilot.click("#run-pipeline")
            await asyncio.wait_for(self.fetch_started.wait(), 5)
            timeline = pane.query_one(RunTimeline)
            timeline.focus()
            await pilot.press("down", "down")
            self.assertEqual(timeline.selected, "preserve")
            log = pane.query_one(LogView).query_one(RichLog)
            self.assertEqual(len(log.lines), 0)
            pane._progress(
                StageProgress("fetch", "running", "fetch-only message", run_id="demo")
            )
            self.assertEqual(len(log.lines), 0)
            pane._tick()
            self.assertIn(
                "CPU avg",
                render_text(pane.query_one("#run-resources", Static).render()),
            )
            await pilot.press("2")
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "inspect"
            )
            pane.cancel_collection()
            await self.wait_for_collection(app, pilot)
            before = sampler.sample.call_count
            pane._tick()
            self.assertEqual(sampler.sample.call_count, before)
            self.assertTrue(pane.query_one("#run-activity").display)

    async def test_compact_layout_stacks_run_and_probes_at_80x24(self):
        self.block = True
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.pause()
            self.assertTrue(app.has_class("compact"))
            operations = app.query_one("#run-operations").region
            context = app.query_one("#run-context").region
            self.assertEqual(operations.x, context.x)
            self.assertGreaterEqual(operations.width, 70)
            primary = app.query_one("#run-pipeline").region
            impact = app.query_one("#prepare-pipeline").region
            self.assertTrue(primary.y >= 0 and primary.y + primary.height <= 24)
            self.assertTrue(impact.y >= 0 and impact.y + impact.height <= 24)
            await pilot.click("#run-pipeline")
            await asyncio.wait_for(self.fetch_started.wait(), 5)
            await pilot.click("#cancel-pipeline")
            await self.wait_for_collection(app, pilot)
            self.assertFalse(app.query_one(RunPane).collecting)
            await pilot.press("6")
            await pilot.pause()
            registry = app.query_one("#checkpoint-registry").region
            prepare = app.query_one("#checkpoint-prepare-card").region
            self.assertEqual(registry.x, prepare.x)
            self.assertGreaterEqual(registry.width, 70)
            fetch = app.query_one("#checkpoint-fetch").region
            self.assertTrue(fetch.y >= 0 and fetch.y + fetch.height <= 24)
            await pilot.press("1")
            await pilot.pause()
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "run"
            )

    async def test_history_row_summary_fits_narrow_rail(self):
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.press("3")
            await pilot.pause()
            first_item = app.query_one("#history-list", ListView).children[0]
            meta = render_text(first_item.children[1].render())
            self.assertIn(" rec · ", meta)
            self.assertIn(" rev", meta)
            self.assertNotIn(" records", meta)
            detail = render_text(
                app.query_one("#history-detail-body", Static).render()
            )
            self.assertIn("Outcome: completed", detail)
            self.assertIn("Records:", detail)

    async def test_history_tab_loads_persisted_run_and_steps(self):
        result = await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.press("3")
            await pilot.pause()
            self.assertEqual(app.query_one("#workspace", TabbedContent).active, "history")
            self.assertGreaterEqual(len(app.query_one("#history-list", ListView).children), 1)
            history_list = app.query_one("#history-list", ListView)
            first_item = history_list.children[0]
            self.assertTrue(first_item.has_class("history-completed"))
            self.assertEqual(len(first_item.children), 2)
            self.assertIn("Collect", render_text(first_item.children[0].render()))
            await app.query_one(HistoryPane).select_run(
                ListView.Selected(history_list, history_list.children[0], 0)
            )
            await pilot.pause()
            detail = render_text(app.query_one("#history-detail-body", Static).render())
            self.assertIn("Outcome: completed", detail)
            self.assertIn("Started: ", detail)
            self.assertNotIn("Started: Unknown time", detail)
            self.assertIn("Completed: ", detail)
            self.assertNotIn("Completed: Unknown time", detail)
            self.assertIn("Run " + result.run_id[:8], render_text(app.query_one("#history-detail-title", Label).render()))
            self.assertIn("Steps", detail)

    async def test_history_refresh_loads_first_run_detail(self):
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.press("3")
            await pilot.pause()
            await pilot.click("#history-refresh")
            await pilot.pause()
            await app.workers.wait_for_complete()
            await pilot.pause()
            detail = render_text(app.query_one("#history-detail-body", Static).render())
            self.assertIn("Outcome: completed", detail)
            self.assertIn("Steps", detail)

        await self.db.start_run("legacy")
        await self.db.finish_failed_run("legacy", "failed", "Legacy error")
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.press("3")
            await pilot.pause()
            history = app.query_one(HistoryPane)
            await history._show_run("legacy")
            detail = render_text(app.query_one("#history-detail-body", Static).render())
            self.assertIn("Outcome: failed", detail)
            self.assertIn("Legacy error", detail)
            self.assertIn("No step details recorded", detail)
            self.assertIn("Started: ", detail)
            self.assertNotIn("Started: Unknown time", detail)


class PackagedAssetsTests(TestCase):
    def test_packaged_artwork_and_migration(self):
        root = files("athar_dataops")
        artwork = root.joinpath("assets/mark.txt").read_text()
        self.assertEqual(len(artwork.splitlines()), 54)
        self.assertTrue(artwork.splitlines()[0].isspace())
        self.assertIn(
            "CREATE TABLE source_snapshots",
            root.joinpath("migrations/001_registry.sql").read_text(),
        )
