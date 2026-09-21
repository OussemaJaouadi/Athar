"""Exercise real Turso persistence against synthetic registry evidence, never a provider."""

import asyncio
import hashlib
import json
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

import httpx

from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.registry import RegistryService


def registry_row(**changes):
    row = dict(
        name="Example",
        desc="Concrete product detail",
        website="www.example.com/product?q=1",
        label="01/2024",
        creation_year="2020",
        founders=[" Example Person "],
        sector="Software",
        industry="Software",
        extra={"untouched": True},
        phone="synthetic-private-value",
    )
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
            ["collect", "normalize", "save"],
        )

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
        self.assertEqual(result.review_count, 4)
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
        ):
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                await self.db.get_overview_stats()

    async def test_reopen_preserves_data_and_migration_history(self):
        result = await self.pipeline.run_pipeline()
        await self.db.close()
        self.db = DatabaseService(self.path)
        await self.db.initialize()
        self.assertEqual((await self.db.get_run(result.run_id)).status, "completed")
        self.assertEqual(len((await self.db.table_page("schema_migrations")).rows), 1)
        self.assertEqual(
            (await self.db.get_snapshot(result.snapshot_id)).raw_content, self.body
        )

    async def test_foreign_keys_reject_orphan_source_row(self):
        with self.assertRaises(Exception):
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
