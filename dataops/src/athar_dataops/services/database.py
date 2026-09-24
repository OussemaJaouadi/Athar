"""Embedded Turso storage. One connection, serialized transactions, no arbitrary SQL UI."""

import asyncio
import hashlib
import json
import unicodedata
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from importlib.resources import files
from pathlib import Path
from typing import Any
from uuid import uuid4

import turso.aio

from athar_dataops.schemas.database import RecordPage, TablePage
from athar_dataops.schemas.issues import classify_issue
from athar_dataops.schemas.pipeline import PipelineRunResult
from athar_dataops.schemas.registry import (
    NormalizedRecord,
    RecordDetail,
    RegistrySnapshot,
    utc_now,
)
from athar_dataops.services.groq import ProfileStatus


def _day_window() -> tuple[str, str]:
    now = datetime.now(UTC)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat(), now.isoformat()


def _minute_window() -> tuple[str, str]:
    now = datetime.now(UTC)
    return (now - timedelta(seconds=60)).isoformat(), now.isoformat()


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
                    if version == 5:
                        # Upgrade classifications without deleting reasons or evidence.
                        findings = await self._rows("SELECT id, reason FROM entity_review_items")
                        for finding in findings:
                            issue = classify_issue(finding["reason"])
                            await self._execute(
                                "UPDATE entity_review_items SET code=?, category=?, resolved=CASE WHEN ?='automatic' THEN 1 ELSE resolved END WHERE id=?",
                                (issue.code, issue.category, issue.category, finding["id"]),
                            )
                        for run in await self._rows("SELECT id, snapshot_id FROM pipeline_runs"):
                            await self._execute("UPDATE pipeline_runs SET review_count=? WHERE id=?", (await self._review_count(run["snapshot_id"]), run["id"]))
                        await self._repair_duplicate_pointers()
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

    async def start_run(self, run_id: str, operation: str = "collect") -> None:
        async with self._lock:
            await self._execute(
                "INSERT INTO pipeline_runs (id, started_at, status, operation) VALUES (?, ?, 'running', ?)",
                (run_id, utc_now(), operation),
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
                    elif key not in seen_keys:
                        await self._execute(
                            """UPDATE entities SET
                                retrieval_text=CASE WHEN description IS ? THEN retrieval_text ELSE NULL END,
                                detected_language=CASE WHEN description IS ? THEN detected_language ELSE NULL END,
                                is_embedded=CASE WHEN description IS ? THEN is_embedded ELSE 0 END,
                                name = ?, website = ?, description = ?, sector = ?,
                                cohort_label = ?, cohort_date = ?, creation_year = ?,
                                latest_snapshot_id = ?, latest_row_id = ?, updated_at = ?
                               WHERE id = ?""",
                            (
                                record.description, record.description, record.description,
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
                        issue = classify_issue(reason)
                        # One open item per row and reason, so repeated cleans are idempotent.
                        seen = await self._rows(
                            "SELECT 1 FROM entity_review_items WHERE entity_id IS ? AND source_row_id IS ? AND reason = ?",
                            (record.entity_id, source_row_id, reason),
                        )
                        if seen:
                            continue
                        await self._execute(
                            """INSERT INTO entity_review_items (
                                id, entity_id, source_row_id, reason, resolved, created_at, code, category
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                            (str(uuid4()), record.entity_id, source_row_id, reason, int(issue.category == "automatic"), now_str, issue.code, issue.category),
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
            review_count = await self._review_count(snapshot_id)
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status='completed', records_processed=?, review_count=?, snapshot_id=? WHERE id=?",
                (utc_now(), len(records), review_count, snapshot_id, run_id),
            )
            await self._complete_step(run_id, "resolve", len(records), f"{review_count} rows need review")
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
                "SELECT row_number, entity_id, record_json, is_duplicate FROM normalized_records WHERE snapshot_id=?", (snapshot_id,)
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
                            "UPDATE entity_review_items SET resolved=1 WHERE source_row_id=? AND reason != ?",
                            (sid, dup_reason),
                        )
                        seen_dup = await self._rows(
                            "SELECT 1 FROM entity_review_items WHERE source_row_id=? AND reason=?",
                            (sid, dup_reason),
                        )
                        if not seen_dup:
                            await self._execute(
                                """INSERT INTO entity_review_items (
                                    id, entity_id, source_row_id, reason, resolved, created_at, code, category
                                ) VALUES (?, ?, ?, ?, 1, ?, 'exact_duplicate', 'automatic')""",
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

            review_count = await self._review_count(snapshot_id)
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status='completed', records_processed=?, review_count=?, snapshot_id=? WHERE id=?",
                (utc_now(), len(records), review_count, snapshot_id, run_id),
            )
            await self._complete_step(run_id, "reconcile", len(records), f"{review_count} records need review")
        return PipelineRunResult(
            run_id,
            "completed",
            snapshot_id,
            len(records),
            review_count,
        )

    async def _complete_step(self, run_id: str, name: str, items: int, message: str) -> None:
        """Commit terminal step status with its data, even if later UI reporting fails."""
        await self._execute(
            """UPDATE run_steps SET status='completed', completed_at=?,
               items_processed=?, message=? WHERE run_id=? AND step_name=?""",
            (utc_now(), items, message, run_id, name),
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
                "SELECT id, status, operation, started_at, completed_at, records_processed, review_count, snapshot_id, error FROM pipeline_runs ORDER BY started_at DESC LIMIT ?",
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
                "SELECT id AS run_id, status, snapshot_id, records_processed, review_count, error, operation FROM pipeline_runs WHERE id=?",
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
            preparations = await self._rows(
                """SELECT s.row_number,p.input_hash,p.profile,p.model,p.output_json
                FROM text_preparations p
                JOIN source_rows s ON s.id=p.source_row_id WHERE s.snapshot_id=? ORDER BY p.created_at""", (snapshot_id,)
            )
            resolved = await self._rows(
                """SELECT s.row_number,i.reason FROM entity_review_items i JOIN source_rows s ON s.id=i.source_row_id
                WHERE s.snapshot_id=? AND i.category='human' AND i.resolved=1""", (snapshot_id,)
            )
        prepared = {
            (row["row_number"], row["input_hash"]): {
                **json.loads(row["output_json"]),
                "profile": row["profile"],
                "model": row["model"],
            }
            for row in preparations
        }
        resolved_reasons = {(row["row_number"], row["reason"]) for row in resolved}
        originals = {row["row_number"]: row for row in rows}
        details = []
        for record in selected:
            record.review_reasons = [reason for reason in record.review_reasons if (record.row_number, reason) not in resolved_reasons]
            source = originals[record.row_number]
            details.append(
                RecordDetail(
                    snapshot_id,
                    source["source_url"],
                    source["content_hash"],
                    json.loads(source["raw_json"]),
                    record,
                    prepared.get((record.row_number, hashlib.sha256((record.description or "").encode()).hexdigest())),
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

    async def migration_status(self) -> list[dict[str, Any]]:
        """Compare packaged migrations with applied rows; reporting never fails fast."""
        migration_dir = files("athar_dataops").joinpath("migrations")
        applied = {
            row["version"]: row
            for row in await self._rows(
                "SELECT version, checksum, applied_at FROM schema_migrations"
            )
        }
        status = []
        for path in sorted(migration_dir.iterdir(), key=lambda path: path.name):
            try:
                version = int(path.name.split("_", 1)[0])
            except ValueError:
                continue
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            recorded = applied.pop(version, None)
            if recorded is None:
                state = "missing"
            elif recorded["checksum"] == checksum:
                state = "ok"
            else:
                state = "mismatch"
            status.append(
                {
                    "version": version,
                    "name": path.name,
                    "applied_at": recorded["applied_at"] if recorded else None,
                    "status": state,
                }
            )
        for version, recorded in applied.items():
            status.append(
                {
                    "version": version,
                    "name": "unknown",
                    "applied_at": recorded["applied_at"],
                    "status": "unknown",
                }
            )
        status.sort(key=lambda entry: entry["version"])
        return status

    async def wipe_data(self) -> int:
        """Delete every data row, keeping schema and schema_migrations."""
        schema = await self.schema()
        tables = [name for name in schema if name != "schema_migrations"]
        # Children first so a wiped child never leaves a dangling foreign key
        # that trips an immediate FK check on the wipe of its parent row.
        preferred = (
            "preparation_usage",
            "text_preparations",
            "run_steps",
            "entity_review_items",
            "entity_founders",
            "entity_embeddings",
            "normalized_records",
            "entities",
            "source_rows",
            "pipeline_runs",
            "source_snapshots",
            "dataops_quotas",
            "profiles",
        )
        ordered = [name for name in preferred if name in tables]
        ordered += [name for name in tables if name not in ordered]
        deleted = 0
        async with self._transaction():
            for name in ordered:
                quoted = name.replace('"', '""')
                count = await self._rows(f'SELECT COUNT(*) AS n FROM "{quoted}"')
                rows = count[0]["n"]
                if rows:
                    await self._execute(f'DELETE FROM "{quoted}"')
                    deleted += rows
        return deleted

    async def _review_count(self, snapshot_id: str | None) -> int:
        """Called while holding the connection lock; count records, not reasons."""
        rows = await self._rows(
            """SELECT COUNT(DISTINCT i.source_row_id) AS count
            FROM entity_review_items i JOIN source_rows s ON s.id=i.source_row_id
            WHERE i.category='human' AND i.resolved=0 AND s.is_duplicate=0
            AND s.snapshot_id=?""", (snapshot_id,),
        )
        return rows[0]["count"]

    async def _repair_duplicate_pointers(self) -> None:
        """Older collectors could point an entity at its last, suppressed duplicate."""
        entities = await self._rows("""SELECT e.id,e.latest_snapshot_id FROM entities e
            JOIN source_rows s ON s.id=e.latest_row_id WHERE s.is_duplicate=1""")
        for entity in entities:
            canonical = await self._rows("""SELECT s.id,n.record_json FROM normalized_records n
                JOIN source_rows s ON s.snapshot_id=n.snapshot_id AND s.row_number=n.row_number
                WHERE n.entity_id=? AND n.snapshot_id=? AND n.is_duplicate=0 AND s.is_duplicate=0
                ORDER BY n.row_number LIMIT 1""", (entity["id"], entity["latest_snapshot_id"]))
            if canonical:
                record = NormalizedRecord.model_validate_json(canonical[0]["record_json"])
                await self._execute("UPDATE entities SET latest_row_id=?,description=? WHERE id=?",
                                    (canonical[0]["id"], record.description, entity["id"]))

    async def preparation_candidates(self) -> list[dict[str, Any]]:
        async with self._lock:
            return await self._rows(
                """SELECT e.id AS entity_id, s.id AS source_row_id, s.snapshot_id,
                e.description FROM entities e JOIN source_rows s ON s.id=e.latest_row_id
                WHERE s.is_duplicate=0 AND e.description IS NOT NULL
                AND trim(e.description) != '' ORDER BY e.id"""
            )

    async def prepared_text(self, cache_key: str, entity_id: str, input_hash: str, model: str) -> dict[str, Any] | None:
        from athar_dataops.schemas.preparation import (
            PROMPT_VERSION,
            SCHEMA_VERSION,
            TARGET_LANGUAGE,
        )
        async with self._lock:
            rows = await self._rows(
                """SELECT output_json FROM text_preparations WHERE cache_key=? OR
                (entity_id=? AND input_hash=? AND provider='groq' AND model=?
                AND prompt_version=? AND schema_version=? AND target_language=?) LIMIT 1""",
                (cache_key, entity_id, input_hash, model, PROMPT_VERSION, SCHEMA_VERSION, TARGET_LANGUAGE),
            )
        return json.loads(rows[0]["output_json"]) if rows else None

    async def save_preparation(self, candidate: dict[str, Any], cache_key: str,
                               input_hash: str, model: str, profile: str,
                               output: dict[str, Any]) -> None:
        from athar_dataops.schemas.preparation import (
            PROMPT_VERSION,
            SCHEMA_VERSION,
            TARGET_LANGUAGE,
        )
        async with self._transaction():
            await self._execute(
                """INSERT INTO text_preparations
                (cache_key, source_row_id, entity_id, input_hash, provider, model, profile,
                 prompt_version, schema_version, target_language, output_json, created_at)
                VALUES (?, ?, ?, ?, 'groq', ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_key) DO NOTHING""",
                (cache_key, candidate["source_row_id"], candidate["entity_id"], input_hash,
                 model, profile, PROMPT_VERSION, SCHEMA_VERSION, TARGET_LANGUAGE,
                 json.dumps(output, ensure_ascii=False), utc_now()),
            )
            # Only publish preparation for the exact current description, never stale evidence.
            await self._execute(
                """UPDATE entities SET retrieval_text=?, detected_language=?, is_embedded=0
                WHERE id=? AND latest_row_id=? AND description=?""",
                (output["english_translation"] or output["cleaned_text"], output["detected_language"],
                 candidate["entity_id"], candidate["source_row_id"], candidate["description"]),
            )

    async def start_preparation_usage(self, attempt_id: str, run_id: str, source_row_id: str,
                                      model: str, profile: str, fingerprint: str) -> None:
        async with self._lock:
            await self._execute(
                """INSERT INTO preparation_usage (id,run_id,source_row_id,provider,model,profile,
                key_fingerprint,started_at,outcome) VALUES (?,?,?,'groq',?,?,?,?,'started')""",
                (attempt_id, run_id, source_row_id, model, profile, fingerprint, utc_now()),
            )

    async def finish_preparation_usage(self, attempt_id: str, duration: float, outcome: str,
                                       reply=None, error: str | None = None) -> None:
        async with self._lock:
            await self._execute(
                """UPDATE preparation_usage SET duration_seconds=?,outcome=?,input_tokens=?,
                output_tokens=?,request_id=?,error=? WHERE id=?""",
                (duration, outcome, reply.input_tokens if reply else None,
                 reply.output_tokens if reply else None, reply.request_id if reply else None,
                 error, attempt_id),
            )

    async def finish_preparation_run(self, run_id: str, status: str, processed: int,
                                      snapshot_id: str | None, error: str | None = None) -> PipelineRunResult:
        async with self._transaction():
            count = await self._review_count(snapshot_id)
            await self._execute(
                """UPDATE pipeline_runs SET status=?,completed_at=?,records_processed=?,
                review_count=?,snapshot_id=?,error=? WHERE id=?""",
                (status, utc_now(), processed, count, snapshot_id, error, run_id),
            )
        return PipelineRunResult(run_id, status, snapshot_id, processed, count, error)

    async def preparation_usage_summary(self) -> list[dict[str, Any]]:
        async with self._lock:
            return await self._rows(
                """SELECT profile,key_fingerprint,COUNT(*) AS calls,
                SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens,
                SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS unknown
                FROM preparation_usage GROUP BY profile,key_fingerprint ORDER BY profile,key_fingerprint"""
            )

    async def sync_profiles(
        self,
        profiles: list[ProfileStatus],
        default_quotas: list[tuple[str, float, str]],
    ) -> None:
        """Register TOML profiles in the DB and seed default quota rows for new ones."""
        async with self._transaction():
            now = utc_now()
            for status in profiles:
                existing = await self._rows(
                    "SELECT id FROM profiles WHERE name=?", (status.name,)
                )
                if existing:
                    await self._execute(
                        "UPDATE profiles SET model=?, fingerprint=?, updated_at=? WHERE id=?",
                        (status.model, status.fingerprint, now, existing[0]["id"]),
                    )
                    continue
                profile_id = str(uuid4())
                await self._execute(
                    "INSERT INTO profiles (id,name,provider,model,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                    (profile_id, status.name, status.provider, status.model, status.fingerprint, now, now),
                )
                for metric, limit, period in default_quotas:
                    await self._execute(
                        """INSERT OR IGNORE INTO dataops_quotas
                        (id,profile_id,task,metric,limit_value,period,created_at,updated_at)
                        VALUES (?,?,'prepare',?,?,?,?,?)""",
                        (str(uuid4()), profile_id, metric, limit, period, now, now),
                    )

    async def preparation_quota_state(self, task: str = "prepare") -> list[dict[str, Any]]:
        """Per-profile limits, disabled flag, and consumption since day/minute windows."""
        day_start, _ = _day_window()
        minute_start, _ = _minute_window()
        async with self._lock:
            profiles = await self._rows(
                "SELECT id, name, provider, model, fingerprint, disabled FROM profiles ORDER BY name"
            )
            quota_rows = await self._rows(
                "SELECT profile_id, metric, limit_value, period FROM dataops_quotas WHERE task=?",
                (task,),
            )
            day_usage = await self._rows(
                """SELECT profile, COUNT(*) AS requests,
                SUM(CASE WHEN input_tokens IS NOT NULL AND output_tokens IS NOT NULL
                    THEN input_tokens + output_tokens END) AS tokens
                FROM preparation_usage WHERE outcome <> 'started' AND started_at >= ? GROUP BY profile""",
                (day_start,),
            )
            minute_usage = await self._rows(
                """SELECT profile, COUNT(*) AS requests FROM preparation_usage
                WHERE outcome <> 'started' AND started_at >= ? GROUP BY profile""",
                (minute_start,),
            )
        day_by = {row["profile"]: row for row in day_usage}
        minute_by = {row["profile"]: row for row in minute_usage}
        quotas_by_profile: dict[str, dict[str, dict[str, Any]]] = {}
        for row in quota_rows:
            quotas_by_profile.setdefault(row["profile_id"], {})[row["metric"]] = {
                "limit": row["limit_value"],
                "period": row["period"],
            }
        state = []
        for profile in profiles:
            usage = day_by.get(profile["name"], {"requests": 0, "tokens": None})
            state.append(
                {
                    "name": profile["name"],
                    "provider": profile["provider"],
                    "model": profile["model"],
                    "fingerprint": profile["fingerprint"],
                    "disabled": bool(profile["disabled"]),
                    "quotas": quotas_by_profile.get(profile["id"], {}),
                    "requests_today": usage["requests"],
                    "tokens_today": usage["tokens"],
                    "requests_minute": minute_by.get(profile["name"], {"requests": 0})["requests"],
                }
            )
        return state

    async def mark_profile_disabled(self, name: str, disabled: bool) -> None:
        async with self._lock:
            await self._execute(
                "UPDATE profiles SET disabled=?, updated_at=? WHERE name=?",
                (int(disabled), utc_now(), name),
            )

    async def profile_overview(self) -> list[dict[str, Any]]:
        """Settings view: per-profile quota rows, status, all-time and today usage."""
        state = await self.preparation_quota_state()
        async with self._lock:
            rows = await self._rows(
                """SELECT profile, COUNT(*) AS calls,
                SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS unknown
                FROM preparation_usage GROUP BY profile ORDER BY profile"""
            )
        by_name = {row["profile"]: row for row in rows}
        overview = []
        for entry in state:
            usage = by_name.get(
                entry["name"],
                {"calls": 0, "input_tokens": None, "output_tokens": None, "unknown": 0},
            )
            overview.append(
                {
                    **entry,
                    "calls": usage["calls"],
                    "input_tokens": usage["input_tokens"],
                    "output_tokens": usage["output_tokens"],
                    "unknown_tokens": usage["unknown"],
                }
            )
        return overview
