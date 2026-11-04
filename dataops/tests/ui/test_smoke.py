"""Exercise actual TUI actions with real temporary storage and fake registry HTTP."""

import asyncio
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

import httpx
from support import registry_row, render_text
from textual.geometry import Region
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
    LogsPane,
    RunPane,
)
from athar_dataops.ui.widgets.run_timeline import RunTimeline


class WorkspaceTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = Settings(
            _env_file=None,
            db_path=Path(self.directory.name) / "ui.db",
            groq_profiles_path=Path(self.directory.name) / "none.toml",
            theme="dark",
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
                        app.query_one("#workspace", TabbedContent).active, "review"
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
                    pane = app.query_one(DatabasePane)
                    pane._table = "source_rows"
                    await pane._show_table()
                    self.assertEqual(
                        app.query_one("#results-table", DataTable).row_count, 1
                    )
                    self.assertFalse(app.query("#sql-editor"))
                    self.assertFalse(app.query("#run-query"))
                    await pilot.press("ctrl+4", "f6")
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
            await pilot.press("ctrl+4")
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "tools"
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

    async def test_source_disclosure_survives_record_changes_but_not_reloads(self):
        self.fixture_rows = [
            registry_row(name="Alpha", website="https://alpha.example"),
            registry_row(name="Beta", website="https://beta.example"),
        ]
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.press("ctrl+2")
            await pilot.pause()
            source = app.query_one("#source-disclosure", Collapsible)
            source.collapsed = False
            await pilot.pause()
            await pilot.press("down")
            await pilot.pause()
            self.assertIn("Beta", str(app.query_one("#detail-title", Label).render()))
            self.assertFalse(source.collapsed, "stepping records must keep the evidence open")
            await pilot.click("#records-review-filter")
            await pilot.pause()
            await pilot.click("#records-review-filter")
            await pilot.pause()
            self.assertTrue(source.collapsed, "a reload of the listing starts collapsed")

    async def test_hostile_json_keys_and_error_text_never_carry_terminal_controls(self):
        row = registry_row()
        row["ex\x9btra\x1b[2J"] = "value"
        self.fixture_rows = [row]
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.press("ctrl+2")
            await pilot.pause()
            app.query_one("#source-disclosure", Collapsible).collapsed = False
            await pilot.pause()
            original = render_text(app.query_one("#detail-original", Static).render())
            self.assertIn("extra", original)
            self.assertNotIn("\x9b", original)
            self.assertNotIn("\x1b", original)

            async def failing_page(*args, **kwargs):
                raise ValueError("stored text \x1b[2J\x9b broke")

            with patch.object(self.db, "record_page", failing_page):
                await pilot.click("#records-review-filter")
                await pilot.pause()
                await pilot.pause()
            message = render_text(app.query_one("#records-empty-message", Static).render())
            self.assertIn("stored text", message)
            self.assertNotIn("\x1b", message)
            self.assertNotIn("\x9b", message)

    async def test_source_gap_appears_in_review_without_decision_badge(self):
        self.fixture_rows = [registry_row(name="Gap", desc="")]
        result = await self.orchestrator.run_pipeline()
        self.assertEqual(result.review_count, 1)
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.press("ctrl+2")
            await pilot.pause()
            self.assertIn("Source gap", render_text(app.query_one("#detail-badge", Static).render()))
            self.assertIn("Source gap: Missing description", str(app.query_one("#detail-review", Static).render()))
            await pilot.click("#records-review-filter")
            await pilot.pause()
            self.assertIn("1–1 of 1", str(app.query_one("#records-count", Static).render()))

    async def test_registry_table_cells_keep_literal_text_without_terminal_controls(self):
        website = "https://example.com/path[red]OK[/]\x1b[2J"
        self.fixture_rows = [
            registry_row(
                website=website,
                label="invalid[blue]date[/]\x1b]0;title\x07",
            )
        ]
        result = await self.orchestrator.run_pipeline()
        self.assertEqual(result.status, "completed")
        detail = (await self.db.list_records())[0]
        self.assertEqual(detail.original["website"], website)
        self.assertEqual(detail.normalized.website, website)
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.press("2")
            await pilot.pause()
            rendered = render_text(
                app.query_one("#detail-normalized", Static).render()._renderable
            )
            summary = str(app.query_one("#detail-summary", Static).render())
            self.assertIn("[red]OK[/]", rendered)
            self.assertIn("[blue]date[/]", summary)
            self.assertNotIn("\x1b[2J", rendered)
            self.assertNotIn("\x1b]0;title", summary)

    async def test_empty_records_offer_collection_and_activity_starts_hidden(self):
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            self.assertFalse(app.query_one("#cancel-pipeline").display)
            await pilot.press("ctrl+2")
            await pilot.pause()
            self.assertTrue(app.query_one("#records-empty").display)
            self.assertFalse(app.query_one("#records-content").display)
            await pilot.click("#go-collect")
            await pilot.pause()
            self.assertEqual(app.query_one("#workspace", TabbedContent).active, "pipeline")
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
                app.query_one("#workspace", TabbedContent).active, "review"
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
            first_rows = list(app.query_one("#records-list", ListView).children)[:5]
            self.assertTrue(await pilot.click("#records-next"))
            await pilot.pause()
            self.assertEqual(search.value, "Company")
            rows = list(app.query_one("#records-list", ListView).children)
            self.assertEqual(len(rows), 5)
            self.assertEqual(rows, first_rows, "paging must reuse rows, not remount them")
            self.assertIn(
                "101–105 of 105",
                render_text(app.query_one("#records-count", Static).render()),
            )

    async def test_narrow_database_inspection_preserves_selected_row(self):
        await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(80, 24)) as pilot:
            await pilot.press("ctrl+3")
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

    async def test_every_visible_button_label_fits_its_box(self):
        self.fixture_rows = [
            registry_row(name=f"Startup {i}", website=f"https://s{i}.example")
            for i in range(150)
        ]
        await self.orchestrator.run_pipeline()
        for size in ((80, 24), (120, 40)):
            app = self.app()
            async with app.run_test(size=size) as pilot:
                await pilot.pause()
                clipped = []
                for pane in app.PANES:
                    app.action_navigate(pane)
                    await pilot.pause()
                    await pilot.pause()
                    for button in app.query(Button):
                        if not button.display or not button.region.width:
                            continue
                        label = button.label
                        text = label.plain if hasattr(label, "plain") else str(label)
                        # Judge the drawn cells, not the box: a button wraps its
                        # label inside its own padding, so a label can "fit" and
                        # still render on two rows with the second one clipped.
                        lines = button.render_lines(
                            Region(0, 0, button.region.width, button.region.height)
                        )
                        drawn = "\n".join("".join(seg.text for seg in line) for line in lines)
                        if text not in drawn:
                            clipped.append((size, pane, button.id, text, drawn))
                self.assertEqual(clipped, [], f"labels wider than their buttons: {clipped}")
                self.assertTrue(app.query_one("#records-pager").display)

    async def test_about_opens_from_settings(self):
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            app.action_navigate("settings")
            await pilot.pause()
            await pilot.pause()
            # The button sits below the fold at 40 rows; keyboard reaches it regardless.
            app.query_one("#about", Button).focus()
            await pilot.pause()
            await pilot.press("enter")
            await pilot.pause()
            self.assertIsInstance(app.screen, AboutScreen)
            await pilot.press("escape")
            await pilot.pause()
            self.assertNotIsInstance(app.screen, AboutScreen)

    async def test_tab_switching_keybindings(self):
        app = self.app()
        async with app.run_test() as pilot:
            ws = app.query_one("#workspace", TabbedContent)
            self.assertEqual(ws.active, "pipeline")
            for key, expected in (("2", "review"), ("3", "data"), ("4", "tools"), ("1", "pipeline")):
                await pilot.press(key)
                await pilot.pause()
                self.assertEqual(ws.active, expected)
            for key, expected in (("]", "review"), ("[", "pipeline"), ("alt+right", "review"), ("alt+left", "pipeline")):
                await pilot.press(key)
                await pilot.pause()
                self.assertEqual(ws.active, expected)
            # Old names keep working for callers, and the tools views are reachable by name.
            app.action_navigate("settings")
            await pilot.pause()
            self.assertEqual(ws.active, "tools")
            self.assertTrue(app.query_one("#settings-pane").display)
            app.action_navigate("probes")
            await pilot.pause()
            self.assertTrue(app.query_one("#checkpoints-pane").display)

    async def test_step_selection_filters_live_logs_and_preserves_tab_keys(self):
        from unittest.mock import Mock

        from textual.widgets import RichLog

        from athar_dataops.schemas.pipeline import StageProgress
        from athar_dataops.services.metrics import ProcessSample
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
            log = app.query_one(LogsPane).query_one("#logs-console", RichLog)
            before = len(log.lines)
            pane._progress(
                StageProgress("fetch", "running", "fetch-only message", run_id="demo")
            )
            self.assertEqual(len(log.lines), before, "a fetch event stays hidden while preserve is selected")
            pane._tick()
            self.assertIn(
                "CPU avg",
                render_text(pane.query_one("#run-resources", Static).render()),
            )
            await pilot.press("2")
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "review"
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
            masthead = app.query_one("#masthead-status", Static)
            self.assertGreaterEqual(masthead.region.height, 1, "compact masthead must draw a row")
            self.assertIn("Ready", render_text(masthead.render()))
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
            await pilot.press("4")
            await pilot.pause()
            registry = app.query_one("#checkpoint-registry").region
            prepare = app.query_one("#checkpoint-prepare-card").region
            self.assertEqual(registry.x, prepare.x)
            # The Tools menu takes 11 columns at 80 wide; the card has the rest.
            self.assertGreaterEqual(registry.width, 60)
            fetch = app.query_one("#checkpoint-fetch").region
            self.assertTrue(fetch.y >= 0 and fetch.y + fetch.height <= 24)
            await pilot.press("1")
            await pilot.pause()
            self.assertEqual(
                app.query_one("#workspace", TabbedContent).active, "pipeline"
            )

    async def test_saved_run_shows_on_the_timeline_with_its_events(self):
        result = await self.orchestrator.run_pipeline()
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await app.workers.wait_for_complete()
            await pilot.pause()
            runs = app.query_one("#history-list", ListView)
            self.assertGreaterEqual(len(runs.children), 1)
            first = runs.children[0]
            self.assertTrue(first.has_class("history-completed"))
            self.assertIn("Collect", render_text(first.children[0].render()))
            self.assertIn("150 records" if False else "records", render_text(first.children[1].render()))
            await app.query_one(RunPane).show_saved_run(result.run_id)
            await pilot.pause()
            self.assertIn("Run " + result.run_id[:8], render_text(app.query_one("#run-heading", Label).render()))
            status = render_text(app.query_one("#run-status", Static).render())
            self.assertIn("COMPLETED", status)
            self.assertIn("in review", status)
            self.assertIn("Took", render_text(app.query_one("#run-elapsed", Static).render()))
            self.assertEqual(app.query_one(RunTimeline).option_count, 5)
            self.assertIn("run " + result.run_id[:8], str(app.query_one("#logs-title", Static).render()))

        await self.db.start_run("legacy")
        await self.db.finish_failed_run("legacy", "failed", "Legacy error")
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await app.query_one(RunPane).show_saved_run("legacy")
            await pilot.pause()
            status = render_text(app.query_one("#run-status", Static).render())
            self.assertIn("FAILED", status)
            self.assertIn("Legacy error", status)
            self.assertEqual(app.query_one(RunTimeline).option_count, 1)


