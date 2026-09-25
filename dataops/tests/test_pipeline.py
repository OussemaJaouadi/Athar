"""Exercise real Turso persistence against synthetic registry evidence, never a provider."""

import asyncio
import hashlib
import json
import sqlite3
import tempfile
from contextlib import closing
from importlib.resources import files
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

import httpx
import turso

from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.registry import RegistryService


def registry_row(**changes):
    row = {
        "name": "Example",
        "desc": "Concrete product detail",
        "website": "www.example.com/product?q=1",
        "label": "01/2024",
        "creation_year": "2020",
        "founders": [" Example Person "],
        "sector": "Software",
        "industry": "Software",
        "extra": {"untouched": True},
        "phone": "synthetic-private-value",
    }
    return row | changes


class PipelineTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "test.db"
        self.db = DatabaseService(self.path)
        await self.db.initialize()
        self.body = json.dumps([registry_row()], ensure_ascii=False).encode()
        self.status_code = 200
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.respond))
        self.pipeline = PipelineOrchestrator(
            ArtifactService(self.client, "https://registry.example"),
            RegistryService(),
            self.db,
        )

    async def respond(self, request):
        return httpx.Response(self.status_code, content=self.body)

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.db.close()
        self.directory.cleanup()

    async def test_complete_flow_preserves_evidence_and_run_history(self):
        progress = []
        result = await self.pipeline.run_pipeline(progress.append)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.records_processed, 1)
        stored = await self.db.get_snapshot(result.snapshot_id)
        self.assertEqual(stored.raw_content, self.body)
        self.assertEqual(stored.content_hash, hashlib.sha256(self.body).hexdigest())
        (detail,) = await self.db.list_records()
        self.assertEqual(detail.original, registry_row())
        self.assertEqual(detail.normalized.description, "Concrete product detail")
        self.assertEqual(detail.normalized.website, "https://example.com/product?q=1")
        self.assertIsNotNone(detail.normalized.entity_id)
        self.assertEqual(await self.db.get_run(result.run_id), result)
        self.assertEqual(
            [p.stage_name for p in progress if p.status == "completed"],
            ["fetch", "preserve", "normalize", "resolve"],
        )

    async def test_run_steps_persist_timing_and_items_through_the_run(self):
        result = await self.pipeline.run_pipeline()
        steps = await self.db.get_run_steps(result.run_id)
        by_name = {step["step_name"]: step for step in steps}
        self.assertEqual(list(by_name), ["fetch", "preserve", "normalize", "resolve"])
        for name, expected in [
            ("fetch", 0),
            ("preserve", 1),
            ("normalize", 1),
            ("resolve", 1),
        ]:
            step = by_name[name]
            self.assertEqual(step["status"], "completed")
            self.assertEqual(step["items_processed"], expected)
            self.assertIsNotNone(step["started_at"])
            self.assertIsNotNone(step["completed_at"])
            self.assertGreaterEqual(step["completed_at"], step["started_at"])

    async def test_committed_steps_survive_later_reporting_failure(self):
        original = self.db.record_step

        async def fail_final_report(run_id, name, **values):
            if name in ("resolve", "reconcile") and values["status"] == "completed":
                raise RuntimeError("Reporting unavailable")
            await original(run_id, name, **values)

        with patch.object(self.db, "record_step", side_effect=fail_final_report):
            for operation in (
                self.pipeline.run_pipeline,
                self.pipeline.run_clean_pipeline,
            ):
                progress = []
                result = await operation(progress.append)
                self.assertEqual(result.status, "completed")
                self.assertEqual(progress[-1].status, "completed")
                steps = await self.db.get_run_steps(result.run_id)
                self.assertEqual(steps[-1]["status"], "completed")
                self.assertIsNotNone(steps[-1]["completed_at"])

    async def test_failed_start_does_not_write_an_orphan_step(self):
        with patch.object(
            self.db, "start_run", side_effect=RuntimeError("Cannot start")
        ):
            result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error, "Cannot start")
        self.assertFalse(self.pipeline._running)

    async def test_reimport_and_reordered_snapshot_reuse_identity(self):
        first = await self.pipeline.run_pipeline()
        first_id = (await self.db.list_records())[0].normalized.entity_id
        second = await self.pipeline.run_pipeline()
        self.assertEqual(first.snapshot_id, second.snapshot_id)
        self.assertEqual(len((await self.db.table_page("entities")).rows), 1)
        self.body = json.dumps(
            [
                registry_row(name="Other", website="other.example"),
                registry_row(desc="Changed"),
            ]
        ).encode()
        await self.pipeline.run_pipeline()
        records = await self.db.list_records()
        self.assertEqual(records[1].normalized.entity_id, first_id)
        self.assertEqual(len((await self.db.table_page("entities")).rows), 2)

    async def test_ambiguous_and_malformed_rows_are_inspectable(self):
        self.body = json.dumps(
            [
                registry_row(website="one.example"),
                registry_row(website="two.example"),
                registry_row(name="Broken", website="bad host", label="unknown"),
                42,
            ]
        ).encode()
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.review_count, 2)  # Only the two conflicting identities.
        records = await self.db.list_records()
        self.assertEqual(len(records), 4)
        self.assertTrue(all(record.normalized.entity_id is None for record in records))
        self.assertIsNone(records[2].normalized.cohort_date)
        self.assertEqual(records[3].original, 42)
        self.assertEqual(len((await self.db.table_page("source_rows")).rows), 4)

    async def test_conflict_with_previous_identity_is_not_merged(self):
        await self.pipeline.run_pipeline()
        self.body = json.dumps([registry_row(website="different.example")]).encode()
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.review_count, 1)
        self.assertIsNone((await self.db.list_records())[0].normalized.entity_id)
        self.assertEqual(len((await self.db.table_page("entities")).rows), 1)

    async def test_bad_json_retains_bytes_and_previous_inspection(self):
        first = await self.pipeline.run_pipeline()
        self.body = b"{bad json"
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertEqual(
            (await self.db.get_snapshot(result.snapshot_id)).raw_content, self.body
        )
        self.assertEqual(
            (await self.db.list_records())[0].snapshot_id, first.snapshot_id
        )
        self.assertEqual((await self.db.get_run(result.run_id)).status, "failed")

    async def test_non_array_response_is_failure_with_preserved_source(self):
        self.body = b'{"changed": "upstream shape"}'
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertIn("JSON array", result.error)
        self.assertEqual(
            (await self.db.get_snapshot(result.snapshot_id)).raw_content, self.body
        )

    async def test_http_failure_does_not_create_snapshot(self):
        self.status_code = 503
        result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertEqual((await self.db.table_page("source_snapshots")).rows, [])

    async def test_derived_write_failure_rolls_back_entities_and_records(self):
        execute = self.db._execute

        async def fail_final_write(sql, parameters=()):
            if "status='completed'" in sql:
                raise RuntimeError("injected persistence failure")
            return await execute(sql, parameters)

        with patch.object(self.db, "_execute", fail_final_write):
            result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertEqual((await self.db.table_page("entities")).rows, [])
        self.assertEqual((await self.db.table_page("normalized_records")).rows, [])
        self.assertEqual(len((await self.db.table_page("source_rows")).rows), 1)
        self.assertEqual((await self.db.get_run(result.run_id)).status, "failed")

    async def test_cancellation_keeps_preserved_source_and_restores_runner(self):
        entered = asyncio.Event()

        async def wait_before_save(*args):
            entered.set()
            await asyncio.Event().wait()

        with patch.object(self.db, "complete_run", wait_before_save):
            task = asyncio.create_task(self.pipeline.run_pipeline())
            await entered.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        runs = await self.db.table_page("pipeline_runs")
        run = dict(zip(runs.columns, runs.rows[0]))
        self.assertEqual(run["status"], "cancelled")
        self.assertEqual(
            (await self.db.get_snapshot(run["snapshot_id"])).raw_content, self.body
        )
        self.assertEqual((await self.pipeline.run_pipeline()).status, "completed")

    async def test_cancel_during_derived_transaction_rolls_back(self):
        execute = self.db._execute
        entered = asyncio.Event()

        async def pause_after_record(sql, parameters=()):
            await execute(sql, parameters)
            if "INSERT INTO normalized_records" in sql:
                entered.set()
                await asyncio.Event().wait()

        with patch.object(self.db, "_execute", pause_after_record):
            task = asyncio.create_task(self.pipeline.run_pipeline())
            await entered.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertEqual((await self.db.table_page("entities")).rows, [])
        self.assertEqual((await self.db.table_page("normalized_records")).rows, [])
        self.assertEqual(len((await self.db.table_page("source_rows")).rows), 1)

    async def test_timeout_is_persisted_failure(self):
        async def slow_fetch():
            await asyncio.Event().wait()

        self.pipeline._timeout_seconds = 0.05
        with patch.object(self.pipeline._artifact, "fetch", slow_fetch):
            result = await self.pipeline.run_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertIn("exceeded", result.error)
        self.assertEqual((await self.db.get_run(result.run_id)).status, "failed")

    async def test_schema_and_bounded_pages(self):
        self.body = json.dumps(
            [
                registry_row(name=f"Company {i}", website=f"company{i}.example")
                for i in range(103)
            ]
        ).encode()
        await self.pipeline.run_pipeline()
        schema = await self.db.schema()
        self.assertIn("raw_content", schema["source_snapshots"])
        first = await self.db.table_page("source_rows")
        last = await self.db.table_page("source_rows", 100)
        self.assertEqual(len(first.rows), 100)
        self.assertTrue(first.has_more)
        self.assertEqual(len(last.rows), 3)
        self.assertFalse(last.has_more)
        self.assertEqual(len(await self.db.list_records(100)), 3)
        with self.assertRaises(ValueError):
            await self.db.table_page("entities; DROP TABLE entities")

    async def test_search_covers_later_pages_and_unicode(self):
        rows = [
            registry_row(name=f"Company {i}", website=f"company{i}.example")
            for i in range(105)
        ]
        rows.append(
            registry_row(
                name="École 100%",
                website="school.example",
                desc="Unusual sensor system",
            )
        )
        self.body = json.dumps(rows).encode()
        await self.pipeline.run_pipeline()
        page = await self.db.record_page("e\u0301COLE")
        self.assertEqual(page.total, 1)
        self.assertEqual(page.unfiltered_total, 106)
        self.assertEqual(page.records[0].normalized.name, "École 100%")
        self.assertEqual((await self.db.record_page("100%")).total, 1)
        self.assertEqual((await self.db.record_page("unusual sensor")).total, 1)
        self.assertEqual((await self.db.record_page("absent")).records, [])
        self.assertEqual((await self.db.record_page("company", offset=100)).total, 105)
        self.assertEqual(
            len((await self.db.record_page("company", offset=100)).records), 5
        )

    async def test_overview_failure_is_not_reported_as_ready(self):
        with patch.object(
            self.db, "_rows", side_effect=RuntimeError("database unavailable")
        ), self.assertRaisesRegex(RuntimeError, "database unavailable"):
            await self.db.get_overview_stats()

    async def test_reopen_preserves_data_and_migration_history(self):
        result = await self.pipeline.run_pipeline()
        await self.db.close()
        self.db = DatabaseService(self.path)
        await self.db.initialize()
        self.assertEqual((await self.db.get_run(result.run_id)).status, "completed")
        migration_dir = files("athar_dataops").joinpath("migrations")
        expected = sum(1 for path in migration_dir.iterdir() if path.is_file())
        self.assertEqual(
            len((await self.db.table_page("schema_migrations")).rows), expected
        )
        self.assertEqual(
            (await self.db.get_snapshot(result.snapshot_id)).raw_content, self.body
        )

    async def test_foreign_keys_reject_orphan_source_row(self):
        with self.assertRaises(turso.Error):
            await self.db.preserve_rows("missing-snapshot", [{}])
        self.assertEqual((await self.db.table_page("source_rows")).rows, [])

    async def test_unknown_legacy_database_is_refused_without_losing_rows(self):
        path = Path(self.directory.name) / "legacy.db"
        with closing(sqlite3.connect(path)) as conn:
            conn.execute("CREATE TABLE startups (name TEXT)")
            conn.execute("INSERT INTO startups VALUES ('Keep me')")
            conn.commit()
        other = DatabaseService(path)
        with self.assertRaisesRegex(RuntimeError, "Unrecognized"):
            await other.initialize()
        with closing(sqlite3.connect(path)) as conn:
            self.assertEqual(
                conn.execute("SELECT name FROM startups").fetchone()[0], "Keep me"
            )

    async def test_upgrade_from_001_schema_preserves_stored_evidence(self):
        path = Path(self.directory.name) / "upgrade.db"
        one = files("athar_dataops").joinpath("migrations").joinpath("001_registry.sql")
        with closing(sqlite3.connect(path)) as conn:
            for statement in one.read_text().split(";"):
                if statement.strip():
                    conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations VALUES (?, ?, ?)",
                (
                    1,
                    hashlib.sha256(one.read_bytes()).hexdigest(),
                    "2024-01-01T00:00:00Z",
                ),
            )
            conn.execute(
                "INSERT INTO source_snapshots VALUES (?, ?, ?, ?, ?)",
                (
                    "s1",
                    "https://registry.example",
                    "hash",
                    "2024-01-01T00:00:00Z",
                    b"[]",
                ),
            )
            for number, name in ((1, "Example"), (2, "Second")):
                conn.execute(
                    "INSERT INTO source_rows VALUES (?, ?, ?)",
                    (
                        "s1",
                        number,
                        json.dumps(registry_row(name=name), ensure_ascii=False),
                    ),
                )
                conn.execute(
                    "INSERT INTO normalized_records VALUES (?, ?, ?, ?, ?)",
                    ("s1", number, None, name, "{}"),
                )
            conn.commit()
        upgraded = DatabaseService(path)
        await upgraded.initialize()
        try:
            rows = await upgraded.table_page("source_rows")
            self.assertEqual(len(rows.rows), 2)
            self.assertIn("id", rows.columns)
            records = await upgraded.table_page("normalized_records")
            self.assertEqual(len(records.rows), 2)
            migrations = await upgraded.table_page("schema_migrations")
            self.assertEqual(len(migrations.rows), 7)
        finally:
            await upgraded.close()

    async def test_clean_pipeline_is_offline_and_writes_relational_rows(self):
        await self.pipeline.run_pipeline()

        async def fail_if_fetched(*args, **kwargs):
            raise AssertionError("Clean pipeline must stay offline")

        with patch.object(
            self.pipeline._artifact, "fetch", side_effect=fail_if_fetched
        ):
            result = await self.pipeline.run_clean_pipeline()
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.records_processed, 1)
        self.assertEqual(result.review_count, 0)
        (detail,) = await self.db.list_records()
        self.assertIsNotNone(detail.normalized.entity_id)
        founders = await self.db.table_page("entity_founders")
        self.assertIn("Example Person", [row[2] for row in founders.rows])

    async def test_clean_pipeline_retains_incomplete_notes_without_human_review(self):
        self.body = json.dumps([registry_row(website="bad host")]).encode()
        await self.pipeline.run_pipeline()
        result = await self.pipeline.run_clean_pipeline()
        self.assertEqual(result.status, "completed")
        # One record parked in review; its identity and website entries stay open.
        self.assertEqual(result.review_count, 0)
        reviews = await self.db.table_page("entity_review_items")
        self.assertIn(
            "Invalid website; original retained", [row[3] for row in reviews.rows]
        )

    async def test_repeated_clean_pipeline_keeps_founders_unique(self):
        await self.pipeline.run_pipeline()
        await self.pipeline.run_clean_pipeline()
        await self.pipeline.run_clean_pipeline()
        founders = await self.db.table_page("entity_founders")
        self.assertEqual([row[2] for row in founders.rows], ["Example Person"])

    async def test_repeated_clean_pipeline_keeps_review_items_unique(self):
        self.body = json.dumps([registry_row(website="bad host")]).encode()
        await self.pipeline.run_pipeline()
        await self.pipeline.run_clean_pipeline()
        await self.pipeline.run_clean_pipeline()
        reviews = await self.db.table_page("entity_review_items")
        self.assertEqual(
            sorted(row[3] for row in reviews.rows),
            sorted(
                [
                    "Identity needs a valid name and website",
                    "Invalid website; original retained",
                ]
            ),
        )

    async def test_clean_pipeline_reports_missing_snapshot(self):
        result = await self.pipeline.run_clean_pipeline()
        self.assertEqual(result.status, "failed")
        self.assertIn("No snapshots found", result.error)

    async def _legacy_corpus(self):
        """Collect a two-company duplicate plus an unrelated row, then erase the
        derived records a pre-004 corpus would not have (no dup flags, no founders,
        no descriptions, no duplicate review entries)."""
        self.body = json.dumps(
            [
                registry_row(name="DupCo", website="dup.co"),
                registry_row(name="DupCo", website="dup.co"),
                registry_row(name="Other", website="other.co"),
            ],
            ensure_ascii=False,
        ).encode()
        await self.pipeline.run_pipeline()
        await self.db._execute("UPDATE source_rows SET is_duplicate=0")
        await self.db._execute("UPDATE normalized_records SET is_duplicate=0")
        await self.db._execute("DELETE FROM entity_founders")
        await self.db._execute("UPDATE entities SET description=''")
        reviews = await self.db._rows(
            "SELECT id FROM entity_review_items WHERE reason = 'Duplicate of row 1; same name and website'"
        )
        for row in reviews:
            await self.db._execute(
                "DELETE FROM entity_review_items WHERE id=?", (row["id"],)
            )

    async def test_reconcile_marks_shadows_backfills_and_cleans(self):
        await self._legacy_corpus()
        result = await self.pipeline.run_clean_pipeline()
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.records_processed, 3)

        flags = await self.db._rows(
            "SELECT row_number, is_duplicate FROM normalized_records ORDER BY row_number"
        )
        self.assertEqual([f["is_duplicate"] for f in flags], [0, 1, 0])
        visible = await self.db.list_records()
        self.assertEqual(sorted(r.normalized.name for r in visible), ["DupCo", "Other"])
        self.assertEqual(len((await self.db.table_page("source_rows")).rows), 3)

        reviews = await self.db.table_page("entity_review_items")
        self.assertIn(
            "Duplicate of row 1; same name and website",
            [row[3] for row in reviews.rows],
        )
        founders = await self.db.table_page("entity_founders")
        self.assertEqual(
            ["Example Person", "Example Person"], [row[2] for row in founders.rows]
        )
        entities = await self.db._rows("SELECT name, description FROM entities")
        self.assertTrue(all(bool(entity["description"]) for entity in entities))

    async def test_reconcile_is_idempotent(self):
        await self._legacy_corpus()
        await self.pipeline.run_clean_pipeline()
        flags_after_first = await self.db._rows(
            "SELECT row_number, is_duplicate FROM normalized_records ORDER BY row_number"
        )
        founders_after_first = await self.db._rows(
            "SELECT full_name FROM entity_founders ORDER BY full_name"
        )
        reviews_after_first = await self.db._rows(
            "SELECT reason FROM entity_review_items ORDER BY reason"
        )
        await self.pipeline.run_clean_pipeline()
        self.assertEqual(
            [f["is_duplicate"] for f in flags_after_first],
            [
                f["is_duplicate"]
                for f in await self.db._rows(
                    "SELECT row_number, is_duplicate FROM normalized_records ORDER BY row_number"
                )
            ],
        )
        self.assertEqual(
            founders_after_first,
            await self.db._rows(
                "SELECT full_name FROM entity_founders ORDER BY full_name"
            ),
        )
        self.assertEqual(
            reviews_after_first,
            await self.db._rows(
                "SELECT reason FROM entity_review_items ORDER BY reason"
            ),
        )

    async def test_collection_flags_within_run_duplicates(self):
        self.body = json.dumps(
            [
                registry_row(name="DupCo", website="dup.co"),
                registry_row(name="DupCo", website="dup.co"),
            ],
            ensure_ascii=False,
        ).encode()
        await self.pipeline.run_pipeline()
        flags = await self.db._rows(
            "SELECT row_number, is_duplicate FROM normalized_records ORDER BY row_number"
        )
        self.assertEqual([f["is_duplicate"] for f in flags], [0, 1])
        visible = await self.db.list_records()
        self.assertEqual([record.normalized.name for record in visible], ["DupCo"])

    async def test_record_step_upserts_preserving_started_at(self):
        run_id = "run-steps-test"
        await self.db.start_run(run_id)
        await self.db.record_step(
            run_id, "fetch", status="running", started_at="2024-01-01T00:00:00+00:00"
        )
        await self.db.record_step(
            run_id,
            "fetch",
            status="completed",
            completed_at="2024-01-01T00:00:10+00:00",
            items=5,
            message="done",
        )
        steps = await self.db.get_run_steps(run_id)
        self.assertEqual(steps[0]["status"], "completed")
        self.assertEqual(steps[0]["started_at"], "2024-01-01T00:00:00+00:00")
        self.assertEqual(steps[0]["items_processed"], 5)
        self.assertEqual((await self.db.get_run(run_id)).status, "running")


class NormalizationTests(TestCase):
    def test_invalid_values_remain_missing_and_are_flagged(self):
        row = registry_row(
            label="13/2024", creation_year="unknown", website="https://bad host/a"
        )
        record = RegistryService().normalize([row])[0]
        self.assertIsNone(record.cohort_date)
        self.assertIsNone(record.creation_year)
        self.assertIsNone(record.website)
        self.assertGreaterEqual(len(record.review_reasons), 3)
        self.assertEqual(row["label"], "13/2024")

    def test_relative_database_path_is_rejected(self):
        with self.assertRaises(ValueError):
            Settings(db_path=Path("data/athar.db"))
