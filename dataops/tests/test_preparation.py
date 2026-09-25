"""Real temporary storage, mocked Groq; no inference credits or personal data."""

import asyncio
import json
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase

import httpx
from pydantic import SecretStr
from test_pipeline import registry_row

from athar_dataops.config import Settings
from athar_dataops.schemas.issues import classify_issue
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.preparation import PreparationService
from athar_dataops.services.registry import RegistryService


class PreparationTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db = DatabaseService(Path(self.directory.name) / "test.db")
        await self.db.initialize()
        self.config = Settings(_env_file=None, groq_api_key="fake-secret", groq_profile="account-a",
                               groq_profiles_path=Path(self.directory.name) / "none.toml")
        self.calls = 0
        self.status = 200
        self.mode = "valid"
        self.waiting = asyncio.Event()
        self.rows = [registry_row(desc="Le meilleur logiciel pour 12 magasins.")]
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self.respond))
        self.preparation = PreparationService(GroqPreparationClient(self.http, self.config), self.db)
        self.pipeline = PipelineOrchestrator(ArtifactService(self.http, "https://registry.example"),
                                             RegistryService(), self.db, preparation=self.preparation)
        await self.pipeline.run_pipeline()

    async def asyncTearDown(self):
        await self.http.aclose()
        await self.db.close()
        self.directory.cleanup()

    async def respond(self, request):
        if request.url.host == "registry.example":
            self.assertNotIn("authorization", request.headers)
            return httpx.Response(200, json=self.rows)
        self.calls += 1
        payload = json.loads(request.content)
        self.assertTrue(payload["response_format"]["json_schema"]["strict"])
        if self.mode == "block":
            self.waiting.set()
            await asyncio.Event().wait()
        if self.status != 200:
            return httpx.Response(self.status, text="fake-secret")
        output = {
            "detected_language": "fr", "cleaned_text": "Logiciel pour 12 magasins.",
            "english_translation": "Software for 12 shops.", "fluff_excerpts": ["Le meilleur"],
        }
        if self.mode == "hallucinated_excerpt":
            output["fluff_excerpts"] = ["not in source"]
        if self.mode == "lost_number":
            output["cleaned_text"] = "Logiciel."
        return httpx.Response(200, json={
            "id": "chatcmpl-test", "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "choices": [{"finish_reason": "stop", "message": {
                "content": "bad json fake-secret" if self.mode == "bad_json" else json.dumps(output),
                "refusal": "refused" if self.mode == "refused" else None,
            }}],
        })

    async def test_preparation_keeps_evidence_and_tracks_marker_and_tokens(self):
        before = (await self.db.list_records())[0].original
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.records_processed, 1)
        detail = (await self.db.list_records())[0]
        self.assertEqual(detail.original, before)
        self.assertEqual(detail.prepared["detected_language"], "fr")
        self.assertEqual(detail.prepared["english_translation"], "Software for 12 shops.")
        summary = (await self.db.preparation_usage_summary())[0]
        self.assertEqual((summary["profile"], summary["input_tokens"], summary["output_tokens"]), ("account-a", 100, 50))
        self.assertNotIn("fake-secret", str(summary))

    async def test_switching_keys_reuses_cache_and_new_inputs_keep_new_marker(self):
        await self.pipeline.run_preparation()
        config = self.config.model_copy(update={"groq_api_key": SecretStr("second-secret"), "groq_profile": "account-b"})
        self.pipeline._preparation = PreparationService(GroqPreparationClient(self.http, config), self.db)
        await self.pipeline.run_preparation()
        self.assertEqual(self.calls, 1)
        self.rows = [registry_row(desc="Le meilleur logiciel pour 12 magasins. Version suivante.")]
        await self.pipeline.run_pipeline()
        self.assertIsNone((await self.db.list_records())[0].prepared)
        await self.pipeline.run_preparation()
        self.assertEqual(self.calls, 2)
        summaries = await self.db.preparation_usage_summary()
        self.assertEqual([r["profile"] for r in summaries], ["account-a", "account-b"])
        self.assertNotEqual(summaries[0]["key_fingerprint"], summaries[1]["key_fingerprint"])

    async def test_removed_profile_never_joins_a_later_run(self):
        from athar_dataops.services.groq import GROQ_DEFAULT_QUOTAS, ProfileStatus

        await self.db.sync_profiles(
            [
                ProfileStatus(
                    name="a_removed",
                    model="qwen/qwen3.8-27b",
                    fingerprint="fp-removed",
                ),
                ProfileStatus(
                    name="account-a",
                    model="qwen/qwen3.8-27b",
                    fingerprint="fp-account-a",
                ),
            ],
            list(GROQ_DEFAULT_QUOTAS),
        )
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")
        summaries = await self.db.preparation_usage_summary()
        self.assertTrue(summaries)
        self.assertNotIn(
            "a_removed", [row["profile"] for row in summaries],
            "a removed profile must not be selected for rotation",
        )

    async def test_unchanged_description_in_new_snapshot_reuses_output_with_new_provenance(self):
        await self.pipeline.run_preparation()
        self.rows[0]["sector"] = "Updated sector"
        await self.pipeline.run_pipeline()
        await self.pipeline.run_preparation()
        self.assertEqual(self.calls, 1)
        self.assertIsNotNone((await self.db.list_records())[0].prepared)
        self.assertEqual(len((await self.db.table_page("text_preparations")).rows), 2)

    async def test_configured_profiles_visible_before_first_seeding(self):
        from textual.widgets import DataTable, Static

        from athar_dataops.app import DataOpsApp

        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test() as pilot:
            async with asyncio.timeout(5):
                while "configured" not in str(
                    app.query_one("#run-profiles-summary", Static).render()
                ):
                    await pilot.pause(0.05)
            summary = str(app.query_one("#run-profiles-summary", Static).render())
            self.assertIn("1 configured", summary)
            self.assertIn("0 registered", summary)
            self.assertIn("account-a", summary)
            app.action_navigate("settings")
            await pilot.pause()
            usage = app.query_one("#settings-usage", DataTable)
            async with asyncio.timeout(5):
                while not usage.rows:
                    await pilot.pause(0.05)
            row = usage.get_row_at(0)
            self.assertEqual(row[0], "account-a")
            self.assertEqual(row[2], "configured")

    async def test_preview_counts_every_cached_candidate_under_one_profile(self):
        self.rows = [
            registry_row(desc="Le meilleur logiciel pour 12 magasins.", website="one.example"),
            registry_row(name="Beta", desc="Le meilleur service pour écoles.", website="two.example"),
            registry_row(name="Gamma", desc="Le meilleur outil pour clients.", website="three.example"),
        ]
        await self.pipeline.run_pipeline()
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")
        self.assertEqual(self.calls, 3)
        preview = await self.preparation.preview()
        self.assertEqual(preview["eligible"], 3)
        self.assertEqual(preview["cached"], 3)
        self.assertEqual(preview["uncached"], 0)
        # A new description joins the three cached ones and must count as uncached.
        self.rows.append(
            registry_row(name="Delta", desc="Nouveau service pour 3 villes.", website="four.example")
        )
        await self.pipeline.run_pipeline()
        preview = await self.preparation.preview()
        self.assertEqual(preview["eligible"], 4)
        self.assertEqual(preview["cached"], 3)
        self.assertEqual(preview["uncached"], 1)

    async def test_unknown_token_usage_consumes_budget_after_restart(self):
        from athar_dataops.schemas.registry import utc_now
        from athar_dataops.services.groq import GROQ_DEFAULT_QUOTAS, ProfileStatus

        await self.db.sync_profiles(
            [
                ProfileStatus(
                    name="account-a",
                    model="qwen/qwen3.8-27b",
                    fingerprint="fp-account-a",
                )
            ],
            list(GROQ_DEFAULT_QUOTAS),
        )
        run_id = (await self.db._rows("SELECT id FROM pipeline_runs LIMIT 1"))[0]["id"]
        source_id = (await self.db._rows("SELECT id FROM source_rows LIMIT 1"))[0]["id"]
        await self.db._execute(
            """INSERT INTO preparation_usage
            (id, run_id, source_row_id, provider, model, profile, key_fingerprint,
             started_at, input_tokens, output_tokens, outcome)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                "attempt-unknown",
                run_id,
                source_id,
                "groq",
                "qwen/qwen3.8-27b",
                "account-a",
                "fp-account-a",
                utc_now(),
                100,
                None,
                "completed",
            ),
        )
        # Restart path: the ledger is reseeded from stored state, and the unknown
        # attempt must cost the same per-record estimate the live ledger applied.
        state = await self.db.preparation_quota_state(names=["account-a"])
        self.assertEqual(state[0]["tokens_today"], 1000.0)
        await self.db._execute(
            "UPDATE dataops_quotas SET limit_value=? WHERE metric='tokens_per_day'",
            (1500.0,),
        )
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "failed")
        self.assertIn("daily allowance", result.error)

    async def test_duplicate_cannot_hide_canonical_description_from_preparation(self):
        self.rows.append(dict(self.rows[0]))
        await self.pipeline.run_pipeline()
        candidates = await self.db.preparation_candidates()
        self.assertEqual(len(candidates), 1)
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.records_processed, 1)

    async def test_invalid_and_refused_outputs_are_retryable_and_accounted(self):
        for mode in ("bad_json", "refused", "hallucinated_excerpt", "lost_number"):
            self.mode = mode
            result = await self.pipeline.run_preparation()
            self.assertEqual(result.status, "failed")
            self.assertIsNone((await self.db.list_records())[0].prepared)
            self.assertNotIn("fake-secret", result.error)
        self.mode = "valid"
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")
        summary = (await self.db.preparation_usage_summary())[0]
        self.assertEqual(summary["calls"], 5)
        self.assertEqual(summary["input_tokens"], 500)

    async def test_auth_and_rate_limits_stop_without_rotation_or_token_guessing(self):
        for code in (401, 403, 429):
            # 401/403 persist a disabled profile; re-enable so each code fires once.
            await self.db.mark_profile_disabled("account-a", False)
            self.status = code
            previous = self.calls
            result = await self.pipeline.run_preparation()
            self.assertEqual(result.status, "failed")
            self.assertEqual(self.calls, previous + 1)
            self.assertNotIn("fake-secret", result.error)
        summary = (await self.db.preparation_usage_summary())[0]
        self.assertEqual(summary["unknown"], 3)
        self.assertIsNone(summary["input_tokens"])

    async def test_cancellation_records_unknown_consumption_and_can_resume(self):
        self.mode = "block"
        task = asyncio.create_task(self.pipeline.run_preparation())
        await asyncio.wait_for(self.waiting.wait(), 5)
        with self.assertRaisesRegex(RuntimeError, "already running"):
            await self.pipeline.run_preparation()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertFalse(self.pipeline._running)
        self.assertEqual((await self.db.preparation_usage_summary())[0]["unknown"], 1)
        self.mode = "valid"
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")

    async def test_missing_key_disables_only_preparation(self):
        config = self.config.model_copy(update={"groq_api_key": SecretStr("")})
        self.pipeline._preparation = PreparationService(GroqPreparationClient(self.http, config), self.db)
        self.assertFalse(self.pipeline.preparation_available)
        with self.assertRaisesRegex(RuntimeError, "GROQ_API_KEY"):
            await self.pipeline.run_preparation()
        self.assertEqual((await self.pipeline.run_clean_pipeline()).status, "completed")

    async def test_prepare_requires_confirmation_before_model_calls(self):
        from test_smoke import render_text
        from textual.widgets import Static

        from athar_dataops.app import DataOpsApp

        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test(size=(120, 50)) as pilot:
            await pilot.click("#prepare-pipeline")
            await pilot.pause()
            self.assertTrue(app.query_one("#prepare-preview").display)
            self.assertIn("Uncached model calls", render_text(app.query_one("#prepare-preview-body", Static).render()))
            self.assertEqual(len(await self.db.preparation_usage_summary()), 0)
            await pilot.click("#prepare-cancel")
            await pilot.pause()
            self.assertFalse(app.query_one("#prepare-preview").display)
            self.assertEqual(len(await self.db.preparation_usage_summary()), 0)

    async def test_prepare_button_records_panel_and_usage_panel(self):
        from test_smoke import render_text
        from textual.widgets import DataTable, Static

        from athar_dataops.app import DataOpsApp
        from athar_dataops.ui.panes.run_pane import RunPane

        app = DataOpsApp(self.pipeline, self.db, self.config)
        async with app.run_test(size=(120, 50)) as pilot:
            await pilot.click("#prepare-pipeline")
            await pilot.pause()
            self.assertTrue(app.query_one("#prepare-preview").display)
            self.assertIn("Uncached model calls", render_text(app.query_one("#prepare-preview-body", Static).render()))
            await pilot.click("#prepare-confirm")
            async with asyncio.timeout(10):
                while app.query_one(RunPane).collecting:
                    await pilot.pause(0.05)
            await pilot.pause()
            app.action_navigate("inspect")
            await pilot.pause()
            self.assertTrue(app.query_one("#prepared-disclosure").display)
            self.assertIn("Software for 12 shops", render_text(app.query_one("#detail-prepared", Static).render()))
            self.assertIn("PRODUCED BY", render_text(app.query_one("#detail-prepared", Static).render()))
            self.assertIn("account-a", render_text(app.query_one("#detail-prepared", Static).render()))
            app.action_navigate("settings")
            await pilot.pause()
            async with asyncio.timeout(10):
                while not app.query_one("#settings-usage", DataTable).rows:
                    await pilot.pause(0.05)
            usage = app.query_one("#settings-usage", DataTable)
            self.assertEqual(usage.get_row_at(0)[0], "account-a")
            self.assertNotIn("fake-secret", render_text(app.query_one("#settings-env-table", Static).render()))

    async def test_upgrade_reclassifies_existing_flags_without_losing_evidence(self):
        import hashlib
        import sqlite3
        from importlib.resources import files

        path = Path(self.directory.name) / "old.db"
        connection = sqlite3.connect(path)
        for migration in sorted(files("athar_dataops").joinpath("migrations").iterdir(), key=lambda p: p.name):
            version = int(migration.name.split("_")[0])
            if version >= 5:
                break
            connection.executescript(migration.read_text())
            connection.execute("INSERT INTO schema_migrations VALUES (?,?,?)", (version, hashlib.sha256(migration.read_bytes()).hexdigest(), "2026-01-01"))
        connection.execute("INSERT INTO source_snapshots VALUES ('s','https://example.org','hash','2026-01-01',?)", (b'original bytes',))
        connection.execute("INSERT INTO pipeline_runs (id,started_at,status,snapshot_id,review_count) VALUES ('r','2026-01-01','completed','s',3)")
        reasons = ["Missing or invalid desc", "Duplicate of row 1; same name and website", "Conflicting name/domain match; identity needs review"]
        for number, reason in enumerate(reasons, 1):
            connection.execute("INSERT INTO source_rows (id,snapshot_id,row_number,raw_json,is_duplicate) VALUES (?,'s',?,'{}',?)", (str(number), number, int(number == 2)))
            connection.execute("INSERT INTO entity_review_items (id,source_row_id,reason,resolved,created_at) VALUES (?,?,?,0,'2026-01-01')", (str(number), str(number), reason))
        connection.commit()
        connection.close()
        upgraded = DatabaseService(path)
        await upgraded.initialize()
        try:
            self.assertEqual((await upgraded.get_run("r")).review_count, 1)
            self.assertEqual((await upgraded.get_snapshot("s")).raw_content, b'original bytes')
            table = await upgraded.table_page("entity_review_items")
            issues = {row["code"]: row for row in (dict(zip(table.columns, values)) for values in table.rows)}
            self.assertEqual(issues["exact_duplicate"]["resolved"], 1)
            self.assertEqual(issues["incomplete_desc"]["category"], "incomplete")
            self.assertEqual(issues["identity_conflict"]["resolved"], 0)
        finally:
            await upgraded.close()

    async def test_missing_fields_and_duplicates_are_not_human_reviews(self):
        self.rows = [registry_row(desc=""), registry_row(desc=""), registry_row(name="No site", website="bad host")]
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.review_count, 0)
        result = await self.pipeline.run_clean_pipeline()
        self.assertEqual(result.review_count, 0)
        records = await self.db.list_records()
        self.assertTrue(all(not r.normalized.needs_review for r in records))
        table = await self.db.table_page("entity_review_items")
        issues = [dict(zip(table.columns, row)) for row in table.rows]
        duplicates = [i for i in issues if i["code"] == "exact_duplicate"]
        self.assertTrue(duplicates)
        self.assertTrue(all(i["resolved"] == 1 for i in duplicates))
        self.assertTrue(any(i["category"] == "incomplete" for i in issues))


class IssueTests(TestCase):
    def test_categories_preserve_real_conflicts_and_unknowns(self):
        self.assertEqual(classify_issue("Cohort predates creation year").category, "human")
        self.assertEqual(classify_issue("Conflicting name/domain match; identity needs review").category, "human")
        self.assertEqual(classify_issue("Missing or invalid desc").category, "incomplete")
        self.assertEqual(classify_issue("Duplicate of row 1; same name and website").category, "automatic")
        self.assertEqual(classify_issue("New unclassified reason").category, "human")
