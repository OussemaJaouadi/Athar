"""Embedded Turso storage. One connection, serialized transactions, no arbitrary SQL UI."""

import asyncio
import hashlib
import json
import unicodedata
from contextlib import asynccontextmanager
from importlib.resources import files
from pathlib import Path
from typing import Any
from uuid import uuid4

import turso.aio

from athar_dataops.schemas.database import RecordPage, TablePage
from athar_dataops.schemas.pipeline import PipelineRunResult
from athar_dataops.schemas.registry import (
    NormalizedRecord,
    RecordDetail,
    RegistrySnapshot,
    utc_now,
)


class DatabaseService:
    def __init__(self, path: Path):
        self.path = path
        self._conn: turso.aio.Connection | None = None
        self._lock = asyncio.Lock()

    @property
    def connection(self) -> turso.aio.Connection:
        if self._conn is None:
            raise RuntimeError("Database has not been initialized")
        return self._conn

    async def _execute(self, sql: str, parameters: tuple = ()) -> None:
        cursor = await self.connection.execute(sql, parameters)
        await cursor.close()

    async def _rows(self, sql: str, parameters: tuple = ()) -> list[dict[str, Any]]:
        cursor = await self.connection.execute(sql, parameters)
        try:
            columns = [column[0] for column in cursor.description or ()]
            return [dict(zip(columns, row)) for row in await cursor.fetchall()]
        finally:
            await cursor.close()

    @asynccontextmanager
    async def _transaction(self):
        # Inspection must not share the connection while a write transaction is open.
        async with self._lock:
            await self._execute("BEGIN")
            try:
                yield
                # Cancellation must not leave an indeterminate commit in the driver queue.
                commit = asyncio.create_task(self._execute("COMMIT"))
                try:
                    await asyncio.shield(commit)
                except asyncio.CancelledError:
                    await commit
                    raise
            except BaseException:
                # ROLLBACK after an already completed COMMIT has no work to undo.
                await self.connection.rollback()
                raise

    async def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = await turso.aio.connect(str(self.path), isolation_level=None)
        try:
            existing = await self._rows(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
            names = {row["name"] for row in existing}
            if names and "schema_migrations" not in names:
                raise RuntimeError(
                    "Unrecognized database schema. Keep this file and choose a new DB_PATH; automatic conversion is not supported."
                )
            migration_dir = files("athar_dataops").joinpath("migrations")
            migrations = sorted(migration_dir.iterdir(), key=lambda path: path.name)
            applied = (
                await self._rows(
                    "SELECT version, checksum FROM schema_migrations ORDER BY version"
                )
                if names
                else []
            )
            known = {int(path.name.split("_")[0]): path for path in migrations}
            if any(row["version"] not in known for row in applied):
                raise RuntimeError("Database schema is newer than this application")
            for row in applied:
                checksum = hashlib.sha256(
                    known[row["version"]].read_bytes()
                ).hexdigest()
                if row["checksum"] != checksum:
                    raise RuntimeError(
                        "Applied migration checksum does not match; no changes made"
                    )
            applied_versions = {row["version"] for row in applied}
            await self._execute("PRAGMA foreign_keys = ON")
            for version, path in known.items():
                if version in applied_versions:
                    continue
                sql = path.read_text()
                async with self._transaction():
                    # These packaged migrations contain simple SQL statements, no triggers.
                    for statement in sql.split(";"):
                        if statement.strip():
                            await self._execute(statement)
                    await self._execute(
                        "INSERT INTO schema_migrations VALUES (?, ?, ?)",
                        (
                            version,
                            hashlib.sha256(path.read_bytes()).hexdigest(),
                            utc_now(),
                        ),
                    )
        except BaseException:
            await self.close()
            raise

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def start_run(self, run_id: str) -> None:
        async with self._lock:
            await self._execute(
                "INSERT INTO pipeline_runs (id, started_at, status) VALUES (?, ?, 'running')",
                (run_id, utc_now()),
            )

    async def preserve_snapshot(
        self, run_id: str, snapshot: RegistrySnapshot
    ) -> RegistrySnapshot:
        async with self._transaction():
            rows = await self._rows(
                "SELECT * FROM source_snapshots WHERE content_hash = ?",
                (snapshot.content_hash,),
            )
            if rows:
                snapshot = RegistrySnapshot(**rows[0])
            else:
                await self._execute(
                    "INSERT INTO source_snapshots VALUES (?, ?, ?, ?, ?)",
                    (
                        snapshot.id,
                        snapshot.source_url,
                        snapshot.content_hash,
                        snapshot.fetched_at,
                        snapshot.raw_content,
                    ),
                )
            await self._execute(
                "UPDATE pipeline_runs SET snapshot_id = ? WHERE id = ?",
                (snapshot.id, run_id),
            )
        return snapshot

    async def preserve_rows(self, snapshot_id: str, rows: list[Any]) -> dict[int, str]:
        """Store raw rows with UUID PKs. Returns {row_number: row_id} for FK use."""
        row_ids: dict[int, str] = {}
        async with self._transaction():
            for number, row in enumerate(rows, start=1):
                row_id = str(uuid4())
                await self._execute(
                    "INSERT INTO source_rows (id, snapshot_id, row_number, raw_json) VALUES (?, ?, ?, ?) ON CONFLICT (snapshot_id, row_number) DO NOTHING",
                    (row_id, snapshot_id, number, json.dumps(row, ensure_ascii=False)),
                )
                existing = await self._rows(
                    "SELECT id FROM source_rows WHERE snapshot_id = ? AND row_number = ?",
                    (snapshot_id, number),
                )
                row_ids[number] = existing[0]["id"]
        return row_ids

    async def get_snapshot(self, snapshot_id: str) -> RegistrySnapshot:
        async with self._lock:
            rows = await self._rows(
                "SELECT * FROM source_snapshots WHERE id = ?", (snapshot_id,)
            )
        if not rows:
            raise LookupError("Snapshot not found")
        return RegistrySnapshot(**rows[0])

    async def get_latest_snapshot_rows(self) -> tuple[str, list[Any], dict[int, str]]:
        async with self._lock:
            snapshots = await self._rows(
                "SELECT id FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1"
            )
            if not snapshots:
                raise LookupError("No snapshots found to clean")
            snapshot_id = snapshots[0]["id"]
            rows = await self._rows(
                "SELECT id, row_number, raw_json FROM source_rows WHERE snapshot_id = ? ORDER BY row_number",
                (snapshot_id,),
            )
            row_ids = {row["row_number"]: row["id"] for row in rows}
            return snapshot_id, [json.loads(row["raw_json"]) for row in rows], row_ids

    async def complete_run(
        self, run_id: str, snapshot_id: str, records: list[NormalizedRecord], row_ids: dict[int, str]
    ) -> PipelineRunResult:
        """Resolve conservative identities and commit records with the success marker."""
        async with self._transaction():
            identities = await self._rows("SELECT id, name_key, domain FROM entities")
            by_key = {(row["name_key"], row["domain"]): row["id"] for row in identities}
            names: dict[str, set[str]] = {}
            domains: dict[str, set[str]] = {}
            candidates = [
                (self._name_key(record.name), record.domain)
                for record in records
                if record.name and record.domain
            ]
            for name, domain in list(by_key) + candidates:
                names.setdefault(name, set()).add(domain)
                domains.setdefault(domain, set()).add(name)
            seen_keys: dict[tuple[str, str], int] = {}
            for record in records:
                name = self._name_key(record.name)
                domain = record.domain
                source_row_id = row_ids.get(record.row_number)
                is_duplicate = False
                if not name or not domain:
                    record.review_reasons.append(
                        "Identity needs a valid name and website"
                    )
                elif len(names[name]) > 1 or len(domains[domain]) > 1:
                    record.review_reasons.append(
                        "Conflicting name/domain match; identity needs review"
                    )
                else:
                    key = (name, domain)
                    now_str = utc_now()
                    if key not in by_key:
                        by_key[key] = str(uuid4())
                        await self._execute(
                            """INSERT INTO entities (
                                id, name_key, domain, name, website, description, sector,
                                cohort_label, cohort_date, creation_year,
                                first_snapshot_id, latest_snapshot_id, latest_row_id,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                by_key[key], name, domain, record.name, record.website,
                                record.description, record.sector, record.cohort_label,
                                record.cohort_date, record.creation_year,
                                snapshot_id, snapshot_id, source_row_id,
                                now_str, now_str,
                            ),
                        )
                        # Founders are written once at entity creation; a re-clean
                        # updates fields but never duplicates the founder rows.
                        if record.founders:
                            for founder in record.founders:
                                await self._execute(
                                    "INSERT INTO entity_founders (id, entity_id, full_name, created_at) VALUES (?, ?, ?, ?)",
                                    (str(uuid4()), by_key[key], founder, now_str),
                                )
                    else:
                        await self._execute(
                            """UPDATE entities SET
                                name = ?, website = ?, description = ?, sector = ?,
                                cohort_label = ?, cohort_date = ?, creation_year = ?,
                                latest_snapshot_id = ?, latest_row_id = ?, updated_at = ?
                               WHERE id = ?""",
                            (
                                record.name, record.website, record.description, record.sector,
                                record.cohort_label, record.cohort_date, record.creation_year,
                                snapshot_id, source_row_id, now_str,
                                by_key[key],
                            ),
                        )
                    record.entity_id = by_key[key]
                    # A row with the same name and website already seen in this run
                    # is a duplicate listing, kept as evidence but hidden from views.
                    if key in seen_keys:
                        is_duplicate = True
                        record.review_reasons.append(
                            f"Duplicate of row {seen_keys[key]}; same name and website"
                        )
                    else:
                        seen_keys[key] = record.row_number
                if is_duplicate and source_row_id:
                    await self._execute(
                        "UPDATE source_rows SET is_duplicate=1 WHERE id=?", (source_row_id,)
                    )
                if record.review_reasons:
                    now_str = utc_now()
                    for reason in record.review_reasons:
                        # One open item per row and reason, so repeated cleans are idempotent.
                        seen = await self._rows(
                            "SELECT 1 FROM entity_review_items WHERE entity_id IS ? AND source_row_id IS ? AND reason = ?",
                            (record.entity_id, source_row_id, reason),
                        )
                        if seen:
                            continue
                        await self._execute(
                            """INSERT INTO entity_review_items (
                                id, entity_id, source_row_id, reason, resolved, created_at
                            ) VALUES (?, ?, ?, ?, 0, ?)""",
                            (str(uuid4()), record.entity_id, source_row_id, reason, now_str),
                        )
                await self._execute(
                    "INSERT INTO normalized_records (snapshot_id, row_number, entity_id, name, record_json, is_duplicate) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(snapshot_id, row_number) DO UPDATE SET entity_id=excluded.entity_id, name=excluded.name, record_json=excluded.record_json, is_duplicate=excluded.is_duplicate",
                    (
                        snapshot_id,
                        record.row_number,
                        record.entity_id,
                        record.name,
                        record.model_dump_json(),
                        int(is_duplicate),
                    ),
                )
            review_count = sum(bool(record.review_reasons) for record in records)
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status='completed', records_processed=?, review_count=?, snapshot_id=? WHERE id=?",
                (utc_now(), len(records), review_count, snapshot_id, run_id),
            )
        return PipelineRunResult(
            run_id, "completed", snapshot_id, len(records), review_count
        )

    @staticmethod
    def _name_key(name: str | None) -> str:
        return " ".join((name or "").casefold().split())

    async def reconcile_corpus(
        self,
        run_id: str,
        snapshot_id: str,
        records: list[NormalizedRecord],
        row_ids: dict[int, str],
    ) -> PipelineRunResult:
        """Offline pass over the stored corpus: mark exact duplicates, backfill
        founders and descriptions. Evidence rows are never deleted or rewritten."""
        async with self._transaction():
            stored = await self._rows(
                "SELECT row_number, entity_id, record_json, is_duplicate FROM normalized_records"
            )
            now_str = utc_now()

            shadow_count = 0
            groups: dict[tuple[str, str], list[tuple[int, str | None]]] = {}
            for row in stored:
                parsed = NormalizedRecord.model_validate_json(row["record_json"])
                key = (self._name_key(parsed.name), parsed.domain or "")
                if not key[0] or not key[1]:
                    continue
                groups.setdefault(key, []).append((row["row_number"], row["entity_id"]))
            for key, members in groups.items():
                if len(members) < 2:
                    continue
                members.sort()
                canonical_row, _ = members[0]
                for shadow_number, shadow_entity in members[1:]:
                    sid = row_ids.get(shadow_number)
                    await self._execute(
                        "UPDATE source_rows SET is_duplicate=1 WHERE snapshot_id=? AND row_number=?",
                        (snapshot_id, shadow_number),
                    )
                    await self._execute(
                        "UPDATE normalized_records SET is_duplicate=1 WHERE snapshot_id=? AND row_number=?",
                        (snapshot_id, shadow_number),
                    )
                    if sid:
                        dup_reason = (
                            f"Duplicate of row {canonical_row}; same name and website"
                        )
                        await self._execute(
                            "DELETE FROM entity_review_items WHERE source_row_id=? AND reason != ?",
                            (sid, dup_reason),
                        )
                        seen_dup = await self._rows(
                            "SELECT 1 FROM entity_review_items WHERE source_row_id=? AND reason=?",
                            (sid, dup_reason),
                        )
                        if not seen_dup:
                            await self._execute(
                                """INSERT INTO entity_review_items (
                                    id, entity_id, source_row_id, reason, resolved, created_at
                                ) VALUES (?, ?, ?, ?, 0, ?)""",
                                (
                                    str(uuid4()),
                                    shadow_entity,
                                    sid,
                                    dup_reason,
                                    now_str,
                                ),
                            )
                    shadow_count += 1

            rows_with_entity = await self._rows(
                "SELECT entity_id, record_json FROM normalized_records WHERE entity_id IS NOT NULL AND is_duplicate=0"
            )
            existing_founders_rows = await self._rows(
                "SELECT entity_id, full_name FROM entity_founders"
            )
            existing_founders: dict[str, set[str]] = {}
            for row in existing_founders_rows:
                existing_founders.setdefault(row["entity_id"], set()).add(
                    row["full_name"]
                )
            founder_count = 0
            descriptions: dict[str, str] = {}
            for row in rows_with_entity:
                entity_id = row["entity_id"]
                parsed = NormalizedRecord.model_validate_json(row["record_json"])
                if parsed.description and entity_id not in descriptions:
                    descriptions[entity_id] = parsed.description
                have = existing_founders.setdefault(entity_id, set())
                for founder in parsed.founders:
                    if founder in have:
                        continue
                    have.add(founder)
                    await self._execute(
                        "INSERT INTO entity_founders (id, entity_id, full_name, created_at) VALUES (?, ?, ?, ?)",
                        (str(uuid4()), entity_id, founder, now_str),
                    )
                    founder_count += 1

            desc_count = 0
            for entity_id, description in descriptions.items():
                current = await self._rows(
                    "SELECT description FROM entities WHERE id=?", (entity_id,)
                )
                if current and not current[0]["description"]:
                    await self._execute(
                        "UPDATE entities SET description=? WHERE id=?",
                        (description, entity_id),
                    )
                    desc_count += 1

            open_reviews = await self._rows(
                "SELECT COUNT(*) AS count FROM entity_review_items WHERE resolved=0"
            )
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status='completed', records_processed=?, review_count=?, snapshot_id=? WHERE id=?",
                (utc_now(), len(records), open_reviews[0]["count"], snapshot_id, run_id),
            )
        return PipelineRunResult(
            run_id,
            "completed",
            snapshot_id,
            len(records),
            open_reviews[0]["count"],
        )

    async def record_step(
        self,
        run_id: str,
        step_name: str,
        *,
        status: str,
        started_at: str | None = None,
        completed_at: str | None = None,
        items: int = 0,
        message: str = "",
    ) -> None:
        async with self._lock:
            await self._execute(
                """INSERT INTO run_steps (run_id, step_name, status, started_at, completed_at, items_processed, message)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(run_id, step_name) DO UPDATE SET
                       status=excluded.status,
                       started_at=COALESCE(excluded.started_at, run_steps.started_at),
                       completed_at=excluded.completed_at,
                       items_processed=excluded.items_processed,
                       message=excluded.message""",
                (
                    run_id,
                    step_name,
                    status,
                    started_at,
                    completed_at,
                    items,
                    message,
                ),
            )

    async def get_run_steps(self, run_id: str) -> list[dict[str, Any]]:
        async with self._lock:
            return await self._rows(
                "SELECT step_name, status, started_at, completed_at, items_processed, message FROM run_steps WHERE run_id=? ORDER BY rowid",
                (run_id,),
            )

    async def list_recent_runs(self, limit: int = 8) -> list[dict[str, Any]]:
        async with self._lock:
            return await self._rows(
                "SELECT id, status, started_at, completed_at, records_processed, review_count, snapshot_id FROM pipeline_runs ORDER BY started_at DESC LIMIT ?",
                (limit,),
            )

    async def finish_failed_run(self, run_id: str, status: str, error: str) -> None:
        if status not in ("failed", "cancelled"):
            raise ValueError("Expected failed or cancelled")
        async with self._lock:
            # A cancellation arriving just after commit must not relabel durable success.
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status=?, error=? WHERE id=? AND status='running'",
                (utc_now(), status, error, run_id),
            )

    async def get_run(self, run_id: str) -> PipelineRunResult:
        async with self._lock:
            rows = await self._rows(
                "SELECT id AS run_id, status, snapshot_id, records_processed, review_count, error FROM pipeline_runs WHERE id=?",
                (run_id,),
            )
        return PipelineRunResult(**rows[0])

    async def get_overview_stats(self) -> dict[str, Any]:
        """Report stored counts and the last collection, never infer system health."""
        async with self._lock:
            snapshots = await self._rows(
                "SELECT COUNT(*) AS count FROM source_snapshots"
            )
            entities = await self._rows("SELECT COUNT(*) AS count FROM entities")
            last_run = await self._rows(
                "SELECT status, records_processed, review_count FROM pipeline_runs ORDER BY started_at DESC LIMIT 1"
            )
            return {
                "snapshots": snapshots[0]["count"],
                "entities": entities[0]["count"],
                "records": last_run[0]["records_processed"] if last_run else 0,
                "reviews": last_run[0]["review_count"] if last_run else 0,
                "status": last_run[0]["status"] if last_run else "idle",
            }

    async def list_records(self, offset: int = 0) -> list[RecordDetail]:
        return (await self.record_page(offset=offset)).records

    async def record_page(self, query: str = "", offset: int = 0) -> RecordPage:
        """Search the latest completed snapshot, then load at most 100 original rows."""

        def search_text(value: str) -> str:
            return unicodedata.normalize("NFC", value).casefold()

        needle = search_text(query.strip())
        async with self._lock:
            snapshots = await self._rows(
                "SELECT snapshot_id FROM pipeline_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1"
            )
            if not snapshots:
                return RecordPage([], 0, 0)
            snapshot_id = snapshots[0]["snapshot_id"]
            candidates = await self._rows(
                "SELECT row_number, record_json FROM normalized_records WHERE snapshot_id=? AND is_duplicate=0 ORDER BY row_number",
                (snapshot_id,),
            )
            # Python's Unicode casefold treats French and other scripts consistently;
            # SQLite-compatible lower() is ASCII-only. The registry is a small corpus.
            matches = []
            for candidate in candidates:
                record = NormalizedRecord.model_validate_json(candidate["record_json"])
                fields = (record.name, record.sector, record.description)
                if not needle or any(
                    needle in search_text(field or "") for field in fields
                ):
                    matches.append(record)
            offset = max(0, offset)
            selected = matches[offset : offset + 100]
            if not selected:
                return RecordPage([], len(matches), len(candidates))
            placeholders = ",".join("?" for _ in selected)
            rows = await self._rows(
                f"""SELECT r.row_number, r.raw_json, s.source_url, s.content_hash
                FROM source_rows r JOIN source_snapshots s ON s.id=r.snapshot_id
                WHERE r.snapshot_id=? AND r.row_number IN ({placeholders}) ORDER BY r.row_number""",
                (snapshot_id, *(record.row_number for record in selected)),
            )
        originals = {row["row_number"]: row for row in rows}
        details = []
        for record in selected:
            source = originals[record.row_number]
            details.append(
                RecordDetail(
                    snapshot_id,
                    source["source_url"],
                    source["content_hash"],
                    json.loads(source["raw_json"]),
                    record,
                )
            )
        return RecordPage(details, len(matches), len(candidates))

    async def schema(self) -> dict[str, list[str]]:
        async with self._lock:
            tables = await self._rows(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            result = {}
            for table in tables:
                name = table["name"]
                quoted = name.replace('"', '""')
                columns = await self._rows(f'PRAGMA table_info("{quoted}")')
                result[name] = [row["name"] for row in columns]
            return result

    async def table_page(self, table: str, offset: int = 0) -> TablePage:
        schema = await self.schema()
        if table not in schema:
            raise ValueError("Unknown table")
        quoted = table.replace('"', '""')
        async with self._lock:
            cursor = await self.connection.execute(
                f'SELECT * FROM "{quoted}" ORDER BY rowid LIMIT 101 OFFSET ?',
                (max(0, offset),),
            )
            try:
                rows = await cursor.fetchall()
            finally:
                await cursor.close()
        return TablePage(schema[table], rows[:100], len(rows) > 100)
