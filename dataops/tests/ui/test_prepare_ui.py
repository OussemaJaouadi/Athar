"""Prepare as the operator sees it: confirmation gate, Records and Settings after a run."""

import asyncio
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

from support import PreparationFixture, registry_row, render_text
from textual.widgets import DataTable, Static

from athar_dataops.app import DataOpsApp
from athar_dataops.config import Settings
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.dialogs.prepare import PrepareConfirmScreen
from athar_dataops.ui.panes.run_pane import RunPane
from athar_dataops.ui.panes.settings_pane import SettingsPane


class PrepareWorkspaceTests(PreparationFixture):
    async def test_configured_profiles_visible_before_first_seeding(self):
        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test() as pilot:
            async with asyncio.timeout(5):
                while "profile" not in str(
                    app.query_one("#run-profiles-summary", Static).render()
                ):
                    await pilot.pause(0.05)
            summary = str(app.query_one("#run-profiles-summary", Static).render())
            self.assertIn("1 profile", summary)
            self.assertNotIn("registered", summary)
            self.assertIn("account-a", summary)
            app.action_navigate("settings")
            await pilot.pause()
            usage = app.query_one("#settings-usage", DataTable)
            async with asyncio.timeout(5):
                while not usage.rows:
                    await pilot.pause(0.05)
            row = usage.get_row_at(0)
            self.assertEqual(str(row[0]), "account-a")
            self.assertEqual(str(row[1]), "Not used yet")

    async def test_prepare_requires_confirmation_before_model_calls(self):
        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test(size=(120, 50)) as pilot:
            await pilot.click("#prepare-pipeline")
            await pilot.pause()
            await pilot.pause()
            self.assertIsInstance(app.screen, PrepareConfirmScreen)
            self.assertIn("Need a model call", render_text(app.screen.query_one("#prepare-preview-body", Static).render()))
            self.assertEqual(len(await self.db.preparation_usage_summary()), 0)
            await pilot.click("#prepare-cancel")
            await pilot.pause()
            self.assertNotIsInstance(app.screen, PrepareConfirmScreen)
            self.assertEqual(len(await self.db.preparation_usage_summary()), 0)

    async def test_prepare_button_records_panel_and_usage_panel(self):
        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test(size=(120, 50)) as pilot:
            await pilot.click("#prepare-pipeline")
            await pilot.pause()
            await pilot.pause()
            self.assertIsInstance(app.screen, PrepareConfirmScreen)
            await pilot.click("#prepare-confirm")
            async with asyncio.timeout(10):
                while app.query_one(RunPane).collecting:
                    await pilot.pause(0.05)
            await pilot.pause()
            app.action_navigate("inspect")
            await pilot.pause()
            self.assertTrue(app.query_one("#prepared-disclosure").display)
            prepared = render_text(app.query_one("#detail-prepared", Static).render())
            self.assertIn("Software for 12 shops", prepared)
            self.assertIn("Produced by", prepared)
            self.assertIn("account-a", prepared)
            app.action_navigate("settings")
            await pilot.pause()
            async with asyncio.timeout(10):
                while not app.query_one("#settings-usage", DataTable).rows:
                    await pilot.pause(0.05)
            usage = app.query_one("#settings-usage", DataTable)
            self.assertEqual(str(usage.get_row_at(0)[0]), "account-a")
            self.assertNotIn("fake-secret", render_text(app.query_one("#settings-env-table", Static).render()))

    async def test_combined_descriptions_show_secondary_text_and_summary(self):
        self.rows = [
            registry_row(name="Dual", website="dual.example", desc="Software for 12 shops."),
            registry_row(name="Dual", website="dual.example", desc="Software for schools."),
        ]
        await self.pipeline.run_pipeline()
        self.mode = "multi"
        self.assertEqual((await self.pipeline.run_preparation()).status, "completed")
        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test(size=(120, 50)) as pilot:
            app.action_navigate("inspect")
            await pilot.pause()
            self.assertIn("Software for schools",
                          render_text(app.query_one("#detail-secondary", Static).render()))
            self.assertIn("Combined English summary",
                          render_text(app.query_one("#detail-prepared", Static).render()))


class SettingsUsageTests(IsolatedAsyncioTestCase):
    async def test_settings_usage_caps_many_profiles(self):
        from textual.app import App, ComposeResult

        class SettingsHarness(App[None]):
            def __init__(self, pane):
                super().__init__()
                self._pane = pane
                self.register_theme(DARK)
                self.register_theme(LIGHT)
                self.theme = "athar-dark"

            def compose(self) -> ComposeResult:
                yield self._pane

        with tempfile.TemporaryDirectory() as directory:
            config = Settings(_env_file=None, groq_profiles_path=Path(directory) / "none.toml")
            rows = [
                {"name": f"profile-{i}", "model": "llama-3.3-70b", "disabled": i % 2 == 0,
                 "calls": i, "requests_today": i, "tokens_today": i * 100, "key_fingerprint": "fp"}
                for i in range(9)
            ]
            harness = SettingsHarness(SettingsPane(config))
            async with harness.run_test() as pilot:
                await pilot.pause()
                harness.query_one(SettingsPane)._profile_usage(rows)
                table = harness.query_one("#settings-usage", DataTable)
                rendered = " ".join(str(cell) for key in table.rows for cell in table.get_row(key))
                for name in ("profile-0", "profile-1", "profile-5"):
                    self.assertIn(name, rendered)
                self.assertNotIn("profile-7", rendered)
                self.assertNotIn("profile-8", rendered)
                self.assertIn("… and 3 more profiles", rendered)
