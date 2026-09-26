"""Checkpoint probes, migration verification, and data wipe — no live providers."""

import asyncio
import json
import tempfile
from importlib.resources import files
from io import StringIO
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

import httpx
from rich.console import Console
from test_pipeline import registry_row
from textual.visual import RichVisual
from textual.widgets import Button, Static, TextArea

from athar_dataops.app import DataOpsApp
from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.registry import RegistryService
from athar_dataops.ui.dialogs import WipeConfirmScreen
from athar_dataops.ui.panes import CheckpointsPane

PREPARED = {
    "detected_language": "fr",
    "cleaned_text": "Produit concret en détail",
    "english_translation": "Concrete product in detail",
    "fluff_excerpts": ["wow"],
}


def render_text(renderable):
    stream = StringIO()
    Console(file=stream, width=120, color_system=None).print(renderable)
    return stream.getvalue()


class CheckpointTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        profiles = Path(self.directory.name) / "profiles.toml"
        profiles.write_text('[[profile]]\nname = "check"\napi_key = "sk-test"\n')
        self.config = Settings(
            db_path=Path(self.directory.name) / "ui.db",
            groq_profiles_path=profiles,
            theme="dark",
        )
        self.db = DatabaseService(self.config.db_path)
        await self.db.initialize()
        self.registry_rows = [
            registry_row(name="Alpha", desc="Machine learning saas wow"),
            registry_row(name="Beta", desc="Clean energy producer"),
        ]
        self.groq_status = 200
        self.registry_client = httpx.AsyncClient(
            transport=httpx.MockTransport(self.respond_registry)
        )
        self.groq_http = httpx.AsyncClient(
            transport=httpx.MockTransport(self.respond_groq)
        )
        self.registry = RegistryService()
        self.artifact = ArtifactService(
            self.registry_client, "https://registry.example"
        )
        self.pipeline = PipelineOrchestrator(self.artifact, self.registry, self.db)
        self.groq = GroqPreparationClient(self.groq_http, self.config)

    async def respond_registry(self, request):
        return httpx.Response(
            200,
            content=json.dumps(self.registry_rows, ensure_ascii=False).encode(),
        )

    async def respond_groq(self, request):
        if self.groq_status != 200:
            return httpx.Response(
                self.groq_status, json={"error": {"message": "denied"}}
            )
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-checkpoint123",
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(PREPARED)},
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 20},
            },
        )

    async def asyncTearDown(self):
        await self.registry_client.aclose()
        await self.groq_http.aclose()
        await self.db.close()
        self.directory.cleanup()

    def app(self):
        return DataOpsApp(
            self.pipeline,
            self.db,
            self.config,
            artifact=self.artifact,
            registry=self.registry,
            groq=self.groq,
        )

    async def wait_until(self, pilot, predicate, timeout=10):
        async with asyncio.timeout(timeout):
            while not predicate():
                await pilot.pause(0.02)

    async def _press(self, pilot, selector, root=None):
        query = root or pilot.app
        query.query_one(selector, Button).focus()
        await pilot.pause()
        await pilot.press("enter")

    def _status(self, app):
        return render_text(app.query_one("#checkpoint-status", Static).render())

    def _idle(self, app):
        return not app.query_one("#checkpoint-fetch", Button).disabled

    async def _go_checkpoints(self, pilot):
        await pilot.press("6")
        await pilot.pause()
        self.assertEqual(
            pilot.app.query_one("#workspace").active, "probes"
        )
        self.assertTrue(pilot.app.query_one(CheckpointsPane).display)

    async def test_registry_checkpoint_renders_and_writes_nothing(self):
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            pane = app.query_one(CheckpointsPane)
            pane.query_one("#checkpoint-row").value = "2"
            await self._press(pilot, "#checkpoint-fetch")
            await self.wait_until(
                pilot,
                lambda: "Fetched + normalized" in self._status(app),
            )
            status = self._status(app)
            self.assertIn("no database writes", status)
            chip = app.query_one("#checkpoint-registry-chip", Static)
            self.assertTrue(chip.display)
            self.assertIn("row 2 of", str(chip.render()))
            pane = app.query_one(CheckpointsPane)
            record = pane._registry_result["record"]
            self.assertEqual(record.name, "Beta")
            self.assertIn("Clean energy producer", record.description)
            self.assertIsInstance(
                app.query_one("#checkpoint-registry-output", Static).render(),
                RichVisual,
            )
            self.assertFalse(app.query_one("#checkpoint-cancel").display)
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM source_snapshots"))[
                    0
                ]["n"],
                0,
            )
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM source_rows"))[0]["n"],
                0,
            )
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM entities"))[0]["n"], 0
            )

    async def test_probe_result_label_escapes_markup_and_controls(self):
        self.registry_rows[1] = registry_row(
            name="Beta[bold red]FAKE\x1b]0;pwn\x07"
        )
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            pane = app.query_one(CheckpointsPane)
            pane.query_one("#checkpoint-row").value = "2"
            await self._press(pilot, "#checkpoint-fetch")
            await self.wait_until(
                pilot,
                lambda: "Fetched + normalized" in self._status(app),
            )
            label = render_text(
                app.query_one("#checkpoint-registry-result-label", Static).render()
            )
            self.assertIn("[bold red]FAKE", label)
            self.assertNotIn("\x1b", label)
            self.assertNotIn("\x07", label)

    async def test_registry_checkpoint_out_of_range_row(self):
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            app.query_one(CheckpointsPane).query_one("#checkpoint-row").value = "9"
            await self._press(pilot, "#checkpoint-fetch")
            await self.wait_until(
                pilot,
                lambda: "out of range" in self._status(app),
            )

    async def test_prepare_checkpoint_valid_reply_and_no_writes(self):
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            pane = app.query_one(CheckpointsPane)
            self.assertEqual(pane.query_one("#checkpoint-profile").value, "check")
            pane.query_one("#checkpoint-desc", TextArea).text = (
                "Amazing startup wow in Tunis"
            )
            await self._press(pilot, "#checkpoint-prepare")
            await self.wait_until(
                pilot,
                lambda: "Reply validated" in self._status(app),
            )
            status = self._status(app)
            self.assertIn("Reply validated", status)
            self.assertIn("no cache, quota, or DB writes", status)
            self.assertTrue(app.query_one("#checkpoint-prepare-chip", Static).display)
            pane = app.query_one(CheckpointsPane)
            reply = pane._prepare_reply
            self.assertIsNotNone(reply)
            self.assertEqual(reply.profile, "check")
            self.assertEqual(reply.input_tokens, 10)
            self.assertEqual(reply.output_tokens, 20)
            self.assertEqual(reply.output.detected_language, "fr")
            self.assertEqual(reply.output.english_translation, "Concrete product in detail")
            self.assertIsInstance(
                app.query_one("#checkpoint-prepare-output", Static).render(),
                RichVisual,
            )
            for table in ("text_preparations", "preparation_usage", "pipeline_runs"):
                rows = await self.db._rows(f"SELECT COUNT(*) AS n FROM {table}")
                self.assertEqual(rows[0]["n"], 0, table)

    async def test_prepare_checkpoint_authentication_error(self):
        self.groq_status = 401
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            pane = app.query_one(CheckpointsPane)
            pane.query_one("#checkpoint-desc", TextArea).text = "Hello wow world"
            await self._press(pilot, "#checkpoint-prepare")
            await self.wait_until(
                pilot,
                lambda: "authentication" in self._status(app),
            )
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM source_snapshots"))[
                    0
                ]["n"],
                0,
            )

    async def test_records_review_filter_toggles_scope(self):
        self.registry_rows = [
            registry_row(website="one.example"),
            registry_row(website="two.example"),
            registry_row(name="Beta", website="beta.example"),
        ]
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.review_count, 2)

        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await pilot.press("2")
            count = lambda: render_text(
                app.query_one("#records-count", Static).render()
            )
            await self.wait_until(pilot, lambda: "of 3" in count())
            self.assertEqual(len(app.query_one("#records-list").children), 3)

            await self._press(pilot, "#records-review-filter")
            await self.wait_until(pilot, lambda: "of 2 · in review" in count())
            self.assertTrue(
                app.query_one("#records-review-filter").has_class("in-review")
            )
            self.assertEqual(len(app.query_one("#records-list").children), 2)

            await self._press(pilot, "#records-review-filter")
            await self.wait_until(
                pilot, lambda: "of 3" in count() and "· in review" not in count()
            )
            self.assertFalse(
                app.query_one("#records-review-filter").has_class("in-review")
            )
            self.assertEqual(len(app.query_one("#records-list").children), 3)

    async def test_prepare_checkpoint_disabled_without_profiles(self):
        bare = Settings(
            db_path=Path(self.directory.name) / "ui.db",
            groq_profiles_path=Path(self.directory.name) / "none.toml",
            theme="dark",
        )
        app = DataOpsApp(self.pipeline, self.db, bare, artifact=self.artifact)
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            self.assertTrue(
                app.query_one("#checkpoint-prepare", Button).disabled
            )
            self.assertFalse(app.query_one("#checkpoint-fetch", Button).disabled)
            from textual.css.query import NoMatches
            from textual.widgets import Select

            with self.assertRaises(NoMatches):
                app.query_one("#checkpoint-profile", Select)
            pane = app.query_one(CheckpointsPane)
            self.assertFalse(pane.busy)
            await self._press(pilot, "#checkpoint-fetch")
            await self.wait_until(pilot, lambda: not pane.busy)
            self.assertNotIn(
                "Traceback",
                render_text(app.query_one("#checkpoint-status", Static).render()),
            )

    async def test_checkpoints_has_two_probes_and_no_tbd_card(self):
        from textual.css.query import NoMatches

        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await self._go_checkpoints(pilot)
            app.query_one("#checkpoint-registry")
            app.query_one("#checkpoint-prepare-card")
            self.assertFalse(app.query_one("#checkpoint-registry-chip", Static).display)
            self.assertFalse(app.query_one("#checkpoint-prepare-chip", Static).display)
            with self.assertRaises(NoMatches):
                app.query_one("#checkpoint-embed")
            cancel = app.query_one("#checkpoint-cancel", Button)
            self.assertTrue(cancel.disabled)
            self.assertTrue(cancel.display is False)

    async def test_migration_status_reports_fresh_tampered_and_unknown(self):
        migrations = sorted(
            files("athar_dataops").joinpath("migrations").iterdir(),
            key=lambda path: path.name,
        )
        status = await self.db.migration_status()
        self.assertEqual(len(status), len(migrations))
        self.assertTrue(all(row["status"] == "ok" for row in status))
        self.assertTrue(all(row["applied_at"] for row in status))

        await self.db._execute(
            "UPDATE schema_migrations SET checksum='deadbeef' WHERE version=6"
        )
        status = await self.db.migration_status()
        states = {row["version"]: row["status"] for row in status}
        self.assertEqual(states[6], "mismatch")
        self.assertEqual(states[5], "ok")

        await self.db._execute(
            "INSERT INTO schema_migrations VALUES (99, 'abc', '2026-01-01T00:00:00+00:00')"
        )
        status = await self.db.migration_status()
        states = {row["version"]: row["status"] for row in status}
        self.assertEqual(states[99], "unknown")

    async def test_wipe_clears_rows_keeps_schema_and_migrations(self):
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "completed")
        self.assertEqual(
            (await self.db._rows("SELECT COUNT(*) AS n FROM source_rows"))[0]["n"], 2
        )

        wiped = await self.db.wipe_data()
        self.assertGreater(wiped, 0)

        schema = await self.db.schema()
        self.assertIn("schema_migrations", schema)
        for table in schema:
            if table == "schema_migrations":
                continue
            count = (await self.db._rows(f'SELECT COUNT(*) AS n FROM "{table}"'))[0][
                "n"
            ]
            self.assertEqual(count, 0, table)

        await self.db.close()
        reopened = DatabaseService(self.config.db_path)
        await reopened.initialize()
        migrated = await reopened.migration_status()
        self.assertTrue(all(row["status"] == "ok" for row in migrated))
        self.assertEqual(await reopened.wipe_data(), 0)
        await reopened.close()

        again = DatabaseService(self.config.db_path)
        await again.initialize()
        await again.close()

    async def test_wipe_ui_flow_confirms_and_refreshes(self):
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "completed")
        app = self.app()
        async with app.run_test(size=(120, 40)) as pilot:
            await pilot.pause()
            await pilot.press("3")
            await pilot.pause()
            await self._press(pilot, "#db-wipe")
            await pilot.pause()
            self.assertIsInstance(app.screen, WipeConfirmScreen)
            await pilot.press("escape")
            await pilot.pause()
            self.assertEqual(len(app.screen_stack), 1)
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM source_rows"))[0]["n"],
                2,
            )

            await self._press(pilot, "#db-wipe")
            await pilot.pause()
            self.assertEqual(app.screen.query_one("#wipe-confirm").variant, "warning")
            await self._press(pilot, "#wipe-confirm", root=app.screen)
            await self.wait_until(
                pilot,
                lambda: "Wiped"
                in render_text(
                    app.query_one("#db-migrations-summary", Static).render()
                ),
            )
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM source_rows"))[0]["n"],
                0,
            )
            self.assertEqual(
                (await self.db._rows("SELECT COUNT(*) AS n FROM source_snapshots"))[
                    0
                ]["n"],
                0,
            )