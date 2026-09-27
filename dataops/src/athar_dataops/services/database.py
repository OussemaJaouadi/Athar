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
from urllib.parse import urlsplit
from uuid import uuid4

import turso.aio

from athar_dataops.schemas.database import RecordPage, TablePage
from athar_dataops.schemas.issues import RecordIssue, classify_issue
from athar_dataops.schemas.pipeline import PipelineRunResult
from athar_dataops.schemas.preparation import (
    ProfileOverview,
    ProfileQuotaState,
    QuotaLimit,
)
from athar_dataops.schemas.registry import (
    NormalizedRecord,
    RecordDetail,
    RegistrySnapshot,
    utc_now,
)
from athar_dataops.services.groq import ProfileStatus
from athar_dataops.services.registry import RegistryService

# An already-applied 003 may have run before its review-item copy was added.
# Accept that exact historical checksum without rewriting what actually ran.
LEGACY_MIGRATION_CHECKSUMS: dict[int, set[str]] = {
    3: {"c4e73296518f62ee66d42af311f970a30ec3d139d88ec21fbfe2694a206de6ff"},
}


def _site_identity(domain: str, website: str | None) -> str:
    """A hosted page owns its path; an ordinary company site owns its host."""
    if domain not in {"facebook.com", "sites.google.com"} or not website:
        return domain
    path = urlsplit(website).path.strip("/")
    if domain == "facebook.com":
        path = path.split("/", 1)[0].casefold()
    elif path.startswith("view/"):
        path = "/".join(path.split("/")[:2])
    return f"{domain}/{path}" if path else domain


def _founder_key(name: str) -> str:
    return " ".join(unicodedata.normalize("NFC", name).casefold().split())


def _content_key(value: Any) -> str:
    """Ignore JSON field order and absent-vs-null placeholders only."""
    def canonical(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: canonical(val) for key, val in item.items() if val is not None}
        if isinstance(item, list):
            return [canonical(val) for val in item]
        return item

    return hashlib.sha256(
        json.dumps(canonical(value), ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def _description_hash(descriptions: list[str]) -> str:
    if len(descriptions) == 1:
        return hashlib.sha256(descriptions[0].encode()).hexdigest()
    return hashlib.sha256(
        json.dumps(descriptions, ensure_ascii=False).encode()
    ).hexdigest()


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
        # Schema only changes through migrations (run in initialize), so one
        # process reuses it instead of re-running PRAGMAs for every page.
        self._schema_cache: dict[str, list[str]] | None = None

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
        self._schema_cache = None
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
                if row["checksum"] != checksum and row["checksum"] not in (
                    LEGACY_MIGRATION_CHECKSUMS.get(row["version"], set())
                ):
                    raise RuntimeError(
                        "Applied migration checksum does not match; no changes made"
                    )
            applied_versions = {row["version"] for row in applied}
            await self._execute("PRAGMA foreign_keys = ON")
            for version, path in known.items():
                if version in applied_versions:
                    continue
                sql = path.read_text()
                if version in (8, 9):
                    await self._execute("PRAGMA foreign_keys = OFF")
                try:
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
                        if version in (8, 9):
                            if version == 8:
                                await self._backfill_identity_keys()
                            violations = await self._rows("PRAGMA foreign_key_check")
                            if violations:
                                raise RuntimeError(f"Migration {version:03d} left invalid references")
                        if version == 10:
                            latest = await self._rows(
                                """SELECT snapshot_id FROM pipeline_runs
                                WHERE operation='collect' AND status='completed'
                                    AND snapshot_id IS NOT NULL
                                ORDER BY completed_at DESC, started_at DESC, rowid DESC
                                LIMIT 1"""
                            )
                            if latest:
                                snapshot_id = latest[0]["snapshot_id"]
                                source_rows = await self._rows(
                                    """SELECT id,row_number,raw_json FROM source_rows
                                    WHERE snapshot_id=? ORDER BY row_number""",
                                    (snapshot_id,),
                                )
                                normalized_count = (await self._rows(
                                    "SELECT COUNT(*) AS n FROM normalized_records WHERE snapshot_id=?",
                                    (snapshot_id,),
                                ))[0]["n"]
                                if source_rows and len(source_rows) == normalized_count:
                                    records = RegistryService().normalize([
                                        json.loads(row["raw_json"]) for row in source_rows
                                    ])
                                    row_ids = {row["row_number"]: row["id"] for row in source_rows}
                                    await self._resolve_records(snapshot_id, records, row_ids)
                            await self._resolve_covered_descriptions()
                            for run in await self._rows(
                                "SELECT id, snapshot_id FROM pipeline_runs WHERE snapshot_id IS NOT NULL"
                            ):
                                await self._execute(
                                    "UPDATE pipeline_runs SET review_count=? WHERE id=?",
                                    (await self._review_count(run["snapshot_id"]), run["id"]),
                                )
                        await self._execute(
                            "INSERT INTO schema_migrations VALUES (?, ?, ?)",
                            (
                                version,
                                hashlib.sha256(path.read_bytes()).hexdigest(),
                                utc_now(),
                            ),
                        )
                finally:
                    if version in (8, 9):
                        await self._execute("PRAGMA foreign_keys = ON")
        except BaseException:
            await self.close()
            raise

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def _backfill_identity_keys(self) -> None:
        for row in await self._rows("SELECT id, domain, website FROM entities"):
            key = _site_identity(row["domain"], row["website"])
            await self._execute(
                "UPDATE entities SET identity_key=? WHERE id=?", (key, row["id"])
            )

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
            # Clean follows the latest successful collection, never raw fetch time:
            # a snapshot re-fetched by hash keeps its original fetched_at, and failed
            # fetches must not become the cleaning input.
            runs = await self._rows(
                """SELECT snapshot_id FROM pipeline_runs
                WHERE operation='collect' AND status='completed' AND snapshot_id IS NOT NULL
                ORDER BY completed_at DESC, started_at DESC, rowid DESC LIMIT 1"""
            )
            if runs:
                snapshot_id = runs[0]["snapshot_id"]
            else:
                raise LookupError("No completed collection found to clean")
            rows = await self._rows(
                "SELECT id, row_number, raw_json FROM source_rows WHERE snapshot_id = ? ORDER BY row_number",
                (snapshot_id,),
            )
            row_ids = {row["row_number"]: row["id"] for row in rows}
            return snapshot_id, [json.loads(row["raw_json"]) for row in rows], row_ids

    async def complete_run(
        self, run_id: str, snapshot_id: str, records: list[NormalizedRecord], row_ids: dict[int, str]
    ) -> PipelineRunResult:
        """Resolve identities and evidence before committing the collection marker."""
        async with self._transaction():
            await self._resolve_records(snapshot_id, records, row_ids)
            review_count = await self._review_count(snapshot_id)
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status='completed', records_processed=?, review_count=?, snapshot_id=? WHERE id=?",
                (utc_now(), len(records), review_count, snapshot_id, run_id),
            )
            await self._execute(
                "UPDATE pipeline_runs SET review_count=? WHERE snapshot_id=?",
                (review_count, snapshot_id),
            )
            await self._complete_step(run_id, "resolve", len(records), f"{review_count} records in review")
        return PipelineRunResult(run_id, "completed", snapshot_id, len(records), review_count)

    @staticmethod
    def _name_key(name: str | None) -> str:
        return " ".join(unicodedata.normalize("NFC", name or "").casefold().split())

    async def _resolve_records(
        self, snapshot_id: str, records: list[NormalizedRecord], row_ids: dict[int, str]
    ) -> None:
        """Rebuild derived links and findings from the preserved current snapshot."""
        raw_rows = await self._rows(
            "SELECT row_number, raw_json FROM source_rows WHERE snapshot_id=?", (snapshot_id,)
        )
        raw = {row["row_number"]: json.loads(row["raw_json"]) for row in raw_rows}
        identities = await self._rows("SELECT id, name_key, identity_key FROM entities")
        by_key = {(row["name_key"], row["identity_key"]): row["id"] for row in identities}
        seen_content: dict[str, int] = {}
        seen_identity: set[tuple[str, str]] = set()
        duplicates: set[int] = set()
        for record in records:
            name = self._name_key(record.name)
            identity = _site_identity(record.domain, record.website) if record.domain else ""
            source_row_id = row_ids.get(record.row_number)
            if name and identity:
                key = (name, identity)
                entity_id = by_key.get(key)
                if entity_id is None:
                    entity_id = str(uuid4())
                    by_key[key] = entity_id
                    now = utc_now()
                    await self._execute(
                        """INSERT INTO entities (
                        id,name_key,domain,identity_key,name,website,description,sector,
                        cohort_label,cohort_date,creation_year,first_snapshot_id,
                        latest_snapshot_id,latest_row_id,created_at,updated_at
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (entity_id,name,record.domain,identity,record.name,record.website,
                         record.description,record.sector,record.cohort_label,record.cohort_date,
                         record.creation_year,snapshot_id,snapshot_id,source_row_id,now,now),
                    )
                elif key not in seen_identity:
                    await self._execute(
                        """UPDATE entities SET domain=?,name=?,website=?,sector=?,
                        cohort_label=?,cohort_date=?,creation_year=?,latest_snapshot_id=?,
                        updated_at=? WHERE id=?""",
                        (record.domain,record.name,record.website,record.sector,
                         record.cohort_label,record.cohort_date,record.creation_year,
                         snapshot_id,utc_now(),entity_id),
                    )
                record.entity_id = entity_id
                seen_identity.add(key)
            else:
                record.review_reasons.append("Identity needs a valid name and website")

            content = _content_key(raw.get(record.row_number))
            canonical = seen_content.get(content)
            is_duplicate = canonical is not None
            if is_duplicate:
                duplicates.add(record.row_number)
                record.review_reasons.append(f"Duplicate of row {canonical}; identical content")
            else:
                seen_content[content] = record.row_number
            await self._execute(
                "UPDATE source_rows SET is_duplicate=? WHERE id=?",
                (int(is_duplicate), source_row_id),
            )
            existing = await self._rows(
                "SELECT id,reason,resolved FROM entity_review_items WHERE source_row_id=?",
                (source_row_id,),
            )
            current = set(record.review_reasons)
            for item in existing:
                if item["reason"] not in current and not item["resolved"]:
                    await self._execute(
                        "UPDATE entity_review_items SET resolved=1,resolution_note=? WHERE id=?",
                        ("Superseded by current normalization", item["id"]),
                    )
            old_reasons = {item["reason"] for item in existing}
            for reason in record.review_reasons:
                if reason in old_reasons:
                    continue
                issue = classify_issue(reason)
                await self._execute(
                    """INSERT INTO entity_review_items (
                    id,entity_id,source_row_id,reason,resolved,created_at,code,category
                    ) VALUES (?,?,?,?,?,?,?,?)""",
                    (str(uuid4()),record.entity_id,source_row_id,reason,
                     int(issue.category == "automatic"),utc_now(),issue.code,issue.category),
                )
            await self._execute(
                """INSERT INTO normalized_records
                (snapshot_id,row_number,entity_id,name,record_json,is_duplicate)
                VALUES (?,?,?,?,?,?) ON CONFLICT(snapshot_id,row_number) DO UPDATE SET
                entity_id=excluded.entity_id,name=excluded.name,
                record_json=excluded.record_json,is_duplicate=excluded.is_duplicate""",
                (snapshot_id,record.row_number,record.entity_id,record.name,
                 record.model_dump_json(),int(is_duplicate)),
            )
        await self._refresh_entities(snapshot_id, records, row_ids, duplicates)
        await self._resolve_covered_descriptions(snapshot_id)

    async def _resolve_covered_descriptions(self, snapshot_id: str | None = None) -> None:
        """Close row-level gaps when another row of the same entity supplies the text."""
        where_snapshot = "AND s.snapshot_id=?" if snapshot_id else ""
        candidates = await self._rows(
            """SELECT i.id,n.name AS name,
                json_extract(n.record_json,'$.domain') AS domain,
                json_extract(n.record_json,'$.website') AS website,
                e.row_number AS evidence_row,e.name AS evidence_name,
                json_extract(e.record_json,'$.domain') AS evidence_domain,
                json_extract(e.record_json,'$.website') AS evidence_website
            FROM entity_review_items i
            JOIN source_rows s ON s.id=i.source_row_id
            JOIN normalized_records n ON n.snapshot_id=s.snapshot_id
                AND n.row_number=s.row_number
            JOIN normalized_records e ON e.snapshot_id=n.snapshot_id
                AND e.entity_id=n.entity_id AND e.row_number<>n.row_number
                AND e.is_duplicate=0
            WHERE i.code='incomplete_desc' AND i.resolved=0
                AND n.entity_id IS NOT NULL AND n.is_duplicate=0
                AND json_extract(e.record_json,'$.description') IS NOT NULL
                AND json_extract(e.record_json,'$.description')<>'' """
            + where_snapshot + " ORDER BY i.id,e.row_number",
            (snapshot_id,) if snapshot_id else (),
        )
        resolved: set[str] = set()
        for item in candidates:
            if item["id"] in resolved or not item["domain"] or not item["evidence_domain"]:
                continue
            if self._name_key(item["name"]) != self._name_key(item["evidence_name"]):
                continue
            if _site_identity(item["domain"], item["website"]) != _site_identity(
                item["evidence_domain"], item["evidence_website"]
            ):
                continue
            await self._execute(
                "UPDATE entity_review_items SET resolved=1,resolution_note=? WHERE id=?",
                (f"Description supplied by same entity, source row {item['evidence_row']}",
                 item["id"]),
            )
            resolved.add(item["id"])

    async def _refresh_entities(
        self, snapshot_id: str, records: list[NormalizedRecord],
        row_ids: dict[int, str], duplicates: set[int],
    ) -> None:
        """Publish one main account, all founder evidence, and related identities."""
        from collections import defaultdict
        from itertools import combinations

        groups: dict[str, list[NormalizedRecord]] = defaultdict(list)
        for record in records:
            if record.entity_id and record.row_number not in duplicates:
                groups[record.entity_id].append(record)
        representatives: list[tuple[str, NormalizedRecord, set[str]]] = []
        for entity_id, group in groups.items():
            group.sort(key=lambda item: item.row_number)
            main = next((item for item in group if item.description), group[0])
            descriptions = list(dict.fromkeys(
                item.description for item in group if item.description
            ))
            input_hash = _description_hash(descriptions)
            await self._execute(
                """UPDATE entities SET name=?,website=?,domain=?,description=?,sector=?,
                cohort_label=?,cohort_date=?,creation_year=?,latest_snapshot_id=?,
                latest_row_id=?,latest_row_number=?,
                retrieval_text=CASE WHEN preparation_input_hash=? THEN retrieval_text ELSE NULL END,
                detected_language=CASE WHEN preparation_input_hash=? THEN detected_language ELSE NULL END,
                is_embedded=CASE WHEN preparation_input_hash=? THEN is_embedded ELSE 0 END,
                preparation_input_hash=? WHERE id=?""",
                (main.name,main.website,main.domain,main.description,main.sector,
                 main.cohort_label,main.cohort_date,main.creation_year,snapshot_id,
                 row_ids[main.row_number],main.row_number,input_hash,input_hash,
                 input_hash,input_hash,entity_id),
            )
            founder_lists = [
                {_founder_key(name) for name in item.founders if name.strip()}
                for item in group if item.founders
            ]
            names: dict[str, str] = {}
            for item in group:
                for name in item.founders:
                    names.setdefault(_founder_key(name), name)
            existing = {
                row["name_key"]: row for row in await self._rows(
                    "SELECT id,name_key FROM entity_founders WHERE entity_id=?", (entity_id,)
                ) if row["name_key"]
            }
            for name_key, display_name in names.items():
                support = sum(name_key in listed for listed in founder_lists)
                if len(founder_lists) == 1:
                    status = "reported"
                elif support == len(founder_lists):
                    status = "confirmed"
                else:
                    status = "to_confirm"
                if name_key in existing:
                    await self._execute(
                        "UPDATE entity_founders SET full_name=?,evidence_status=?,support_count=? WHERE id=?",
                        (display_name,status,support,existing[name_key]["id"]),
                    )
                else:
                    await self._execute(
                        """INSERT INTO entity_founders
                        (id,entity_id,full_name,created_at,name_key,evidence_status,support_count)
                        VALUES (?,?,?,?,?,?,?)""",
                        (str(uuid4()),entity_id,display_name,utc_now(),name_key,status,support),
                    )
            if names:
                slots = ",".join("?" for _ in names)
                await self._execute(
                    f"DELETE FROM entity_founders WHERE entity_id=? AND (name_key IS NULL OR name_key NOT IN ({slots}))",
                    (entity_id,*names),
                )
            else:
                await self._execute("DELETE FROM entity_founders WHERE entity_id=?", (entity_id,))
            representatives.append((entity_id, group[0], set(names)))
        await self._execute("DELETE FROM entity_relations")
        for left, right in combinations(representatives, 2):
            left_id, a, a_founders = left
            right_id, b, b_founders = right
            if not a.creation_year or a.creation_year != b.creation_year:
                continue
            if self._name_key(a.name) == self._name_key(b.name):
                continue
            shared = len(a_founders & b_founders)
            if shared < 2 or shared / min(len(a_founders), len(b_founders)) < 0.75:
                continue
            a_id, b_id = sorted((left_id, right_id))
            a_row, b_row = (a, b) if a_id == left_id else (b, a)
            await self._execute(
                """INSERT INTO entity_relations VALUES (?,?,?,?,?,?,?)""",
                (a_id,b_id,row_ids[a_row.row_number],row_ids[b_row.row_number],
                 "shared_registry_team",shared,utc_now()),
            )

    async def reconcile_corpus(
        self, run_id: str, snapshot_id: str, records: list[NormalizedRecord],
        row_ids: dict[int, str],
    ) -> PipelineRunResult:
        """Re-resolve the preserved snapshot offline under the current rules."""
        async with self._transaction():
            await self._resolve_records(snapshot_id, records, row_ids)
            review_count = await self._review_count(snapshot_id)
            await self._execute(
                "UPDATE pipeline_runs SET completed_at=?, status='completed', records_processed=?, review_count=?, snapshot_id=? WHERE id=?",
                (utc_now(), len(records), review_count, snapshot_id, run_id),
            )
            await self._execute(
                "UPDATE pipeline_runs SET review_count=? WHERE snapshot_id=?",
                (review_count, snapshot_id),
            )
            await self._complete_step(run_id, "reconcile", len(records), f"{review_count} records in review")
        return PipelineRunResult(run_id, "completed", snapshot_id, len(records), review_count)

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

    async def get_run_row(self, run_id: str) -> dict[str, Any] | None:
        async with self._lock:
            rows = await self._rows(
                "SELECT id, status, operation, started_at, completed_at, records_processed, review_count, snapshot_id, error FROM pipeline_runs WHERE id=?",
                (run_id,),
            )
        return rows[0] if rows else None

    async def get_overview_stats(self) -> dict[str, Any]:
        """Report stored counts and the last collection, never infer system health."""
        async with self._lock:
            snapshots = await self._rows(
                "SELECT COUNT(*) AS count FROM source_snapshots"
            )
            entities = await self._rows("SELECT COUNT(*) AS count FROM entities")
            last_run = await self._rows(
                """SELECT status, records_processed, review_count FROM pipeline_runs
                WHERE operation = 'collect' ORDER BY started_at DESC, rowid DESC LIMIT 1"""
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

    async def record_page(
        self, query: str = "", offset: int = 0, review_only: bool = False
    ) -> RecordPage:
        """Search the latest completed snapshot, then load at most 100 original rows.

        The corpus scan only holds one candidate batch plus matching row numbers
        in memory; record JSON is fetched and validated for the visible page alone.
        ``review_only`` restricts candidates to rows with open review findings,
        using the same predicate as the stats' review count.
        """

        def search_text(value: str) -> str:
            # NFC normalization is the identity on ASCII, so only pay for the rest.
            if value.isascii():
                return value.casefold()
            return unicodedata.normalize("NFC", value).casefold()

        needle = search_text(query.strip())
        offset = max(0, offset)
        async with self._lock:
            snapshots = await self._rows(
                """SELECT snapshot_id FROM pipeline_runs
                WHERE status='completed' AND operation='collect' AND snapshot_id IS NOT NULL
                ORDER BY completed_at DESC, started_at DESC, rowid DESC LIMIT 1"""
            )
            if not snapshots:
                return RecordPage([], 0, 0)
            snapshot_id = snapshots[0]["snapshot_id"]
            review_sql = (
                """ AND EXISTS (
                    SELECT 1 FROM source_rows s
                    JOIN entity_review_items i ON i.source_row_id = s.id
                    WHERE s.snapshot_id = normalized_records.snapshot_id
                        AND s.row_number = normalized_records.row_number
                        AND s.is_duplicate = 0
                        AND i.category IN ('human','incomplete') AND i.resolved = 0)"""
                if review_only
                else ""
            )
            unfiltered = (
                await self._rows(
                    """SELECT COUNT(*) AS n FROM normalized_records
                    WHERE snapshot_id=? AND is_duplicate=0""",
                    (snapshot_id,),
                )
            )[0]["n"]
            if not needle:
                if review_sql:
                    total = (
                        await self._rows(
                            """SELECT COUNT(*) AS n FROM normalized_records
                            WHERE snapshot_id=? AND is_duplicate=0"""
                            + review_sql,
                            (snapshot_id,),
                        )
                    )[0]["n"]
                else:
                    total = unfiltered
                page_numbers = tuple(
                    row["row_number"]
                    for row in await self._rows(
                        """SELECT row_number FROM normalized_records
                        WHERE snapshot_id=? AND is_duplicate=0"""
                        + review_sql
                        + """
                        ORDER BY row_number LIMIT 100 OFFSET ?""",
                        (snapshot_id, offset),
                    )
                )
            else:
                # Python's Unicode casefold treats French and other scripts
                # consistently; SQLite lower() is ASCII-only. Keyset batches walk
                # the primary key so the scan never holds more than one batch.
                base = """SELECT row_number, record_json FROM normalized_records
                    WHERE snapshot_id=? AND is_duplicate=0""" + review_sql
                matches: list[int] = []
                after = None
                while True:
                    if after is None:
                        batch = await self._rows(
                            base + " ORDER BY row_number LIMIT 1000", (snapshot_id,)
                        )
                    else:
                        batch = await self._rows(
                            base + " AND row_number > ? ORDER BY row_number LIMIT 1000",
                            (snapshot_id, after),
                        )
                    for row in batch:
                        record = NormalizedRecord.model_validate_json(row["record_json"])
                        fields = (record.name, record.sector, record.description)
                        if any(needle in search_text(field or "") for field in fields):
                            matches.append(row["row_number"])
                    if len(batch) < 1000:
                        break
                    after = batch[-1]["row_number"]
                total = len(matches)
                page_numbers = tuple(matches[offset : offset + 100])
            if not page_numbers:
                return RecordPage([], total, unfiltered)
            slots = ",".join("?" for _ in page_numbers)
            stored = {
                row["row_number"]: row["record_json"]
                for row in await self._rows(
                    f"""SELECT row_number, record_json FROM normalized_records
                    WHERE snapshot_id=? AND row_number IN ({slots})""",
                    (snapshot_id, *page_numbers),
                )
            }
            records = [
                NormalizedRecord.model_validate_json(stored[number])
                for number in page_numbers
            ]
            placeholders = ",".join("?" for _ in records)
            rows = await self._rows(
                f"""SELECT r.row_number, r.raw_json, s.source_url, s.content_hash
                FROM source_rows r JOIN source_snapshots s ON s.id=r.snapshot_id
                WHERE r.snapshot_id=? AND r.row_number IN ({placeholders}) ORDER BY r.row_number""",
                (snapshot_id, *(record.row_number for record in records)),
            )
            # Only the visible page's preparations and review decisions are needed.
            page_slots = ",".join("?" for _ in page_numbers)
            preparations = await self._rows(
                f"""SELECT n.row_number,p.profile,p.model,p.output_json
                FROM normalized_records n JOIN entities e ON e.id=n.entity_id
                JOIN text_preparations p ON p.entity_id=e.id
                    AND p.input_hash=e.preparation_input_hash
                WHERE n.snapshot_id=? AND n.row_number IN ({page_slots})
                ORDER BY p.created_at""", (snapshot_id, *page_numbers)
            )
            entity_ids = tuple(dict.fromkeys(
                record.entity_id for record in records if record.entity_id
            ))
            description_rows: list[dict[str, Any]] = []
            founder_rows: list[dict[str, Any]] = []
            relation_rows: list[dict[str, Any]] = []
            if entity_ids:
                entity_slots = ",".join("?" for _ in entity_ids)
                description_rows = await self._rows(
                    f"""SELECT entity_id,row_number,
                    json_extract(record_json,'$.description') AS description
                    FROM normalized_records WHERE snapshot_id=? AND is_duplicate=0
                    AND entity_id IN ({entity_slots}) ORDER BY row_number""",
                    (snapshot_id,*entity_ids),
                )
                founder_rows = await self._rows(
                    f"""SELECT entity_id,full_name,evidence_status FROM entity_founders
                    WHERE entity_id IN ({entity_slots}) ORDER BY full_name""",
                    entity_ids,
                )
                relation_rows = await self._rows(
                    f"""SELECT r.entity_a_id,r.entity_b_id,r.shared_founders,
                    a.name AS name_a,b.name AS name_b FROM entity_relations r
                    JOIN entities a ON a.id=r.entity_a_id
                    JOIN entities b ON b.id=r.entity_b_id
                    WHERE r.entity_a_id IN ({entity_slots})
                    OR r.entity_b_id IN ({entity_slots})""",
                    (*entity_ids,*entity_ids),
                )
            findings = await self._rows(
                f"""SELECT s.row_number,i.code,i.category,i.reason
                FROM entity_review_items i JOIN source_rows s ON s.id=i.source_row_id
                WHERE s.snapshot_id=? AND i.category IN ('human','incomplete')
                AND i.resolved=0 AND s.row_number IN ({page_slots})
                ORDER BY CASE i.category WHEN 'human' THEN 0 ELSE 1 END,
                    i.created_at,i.id""", (snapshot_id, *page_numbers)
            )
        prepared = {
            row["row_number"]: {
                **json.loads(row["output_json"]),
                "profile": row["profile"],
                "model": row["model"],
            }
            for row in preparations
        }
        descriptions_by_entity: dict[str, list[tuple[int, str]]] = {}
        for row in description_rows:
            if row["description"]:
                descriptions = descriptions_by_entity.setdefault(row["entity_id"], [])
                if any(text == row["description"] for _, text in descriptions):
                    continue
                descriptions.append(
                    (row["row_number"], row["description"])
                )
        founders_by_entity: dict[str, list[tuple[str, str]]] = {}
        for row in founder_rows:
            founders_by_entity.setdefault(row["entity_id"], []).append(
                (row["full_name"], row["evidence_status"])
            )
        related_by_entity: dict[str, list[tuple[str, int]]] = {}
        for row in relation_rows:
            related_by_entity.setdefault(row["entity_a_id"], []).append(
                (row["name_b"], row["shared_founders"])
            )
            related_by_entity.setdefault(row["entity_b_id"], []).append(
                (row["name_a"], row["shared_founders"])
            )
        issues_by_row: dict[int, list[RecordIssue]] = {}
        for finding in findings:
            issues_by_row.setdefault(finding["row_number"], []).append(
                RecordIssue(finding["code"], finding["category"], finding["reason"])
            )
        originals = {row["row_number"]: row for row in rows}
        details = []
        for record in records:
            source = originals[record.row_number]
            details.append(
                RecordDetail(
                    snapshot_id,
                    source["source_url"],
                    source["content_hash"],
                    json.loads(source["raw_json"]),
                    record,
                    prepared.get(record.row_number),
                    tuple(descriptions_by_entity.get(record.entity_id, ())),
                    tuple(founders_by_entity.get(record.entity_id, ())),
                    tuple(related_by_entity.get(record.entity_id, ())),
                    tuple(issues_by_row.get(record.row_number, ())),
                )
            )
        return RecordPage(details, total, unfiltered)

    async def schema(self) -> dict[str, list[str]]:
        if self._schema_cache is not None:
            return self._schema_cache
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
            self._schema_cache = result
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
            elif recorded["checksum"] in LEGACY_MIGRATION_CHECKSUMS.get(version, set()):
                state = "legacy"
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
            "text_preparation_sources",
            "text_preparations",
            "run_steps",
            "entity_review_items",
            "entity_relations",
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

    async def reset_registry_data(self) -> int:
        """Clear the registry graph and runs, retaining Groq configuration and usage."""
        tables = (
            "text_preparation_sources",
            "text_preparations",
            "entity_review_items",
            "entity_relations",
            "entity_founders",
            "entity_embeddings",
            "normalized_records",
            "run_steps",
            "entities",
            "source_rows",
            "pipeline_runs",
            "source_snapshots",
        )
        deleted = 0
        async with self._transaction():
            # Usage is an operational ledger. Its source links become unavailable
            # after reset, while profile, timestamp and token counts remain intact.
            await self._execute(
                "UPDATE preparation_usage SET run_id=NULL, source_row_id=NULL "
                "WHERE run_id IS NOT NULL OR source_row_id IS NOT NULL"
            )
            for table in tables:
                rows = await self._rows(f"SELECT COUNT(*) AS n FROM {table}")
                if rows[0]["n"]:
                    await self._execute(f"DELETE FROM {table}")
                    deleted += rows[0]["n"]
            if await self._rows("PRAGMA foreign_key_check"):
                raise RuntimeError("Registry reset left invalid references")
        return deleted

    async def _review_count(self, snapshot_id: str | None) -> int:
        """Called while holding the connection lock; count records, not reasons."""
        rows = await self._rows(
            """SELECT COUNT(DISTINCT i.source_row_id) AS count
            FROM entity_review_items i JOIN source_rows s ON s.id=i.source_row_id
            WHERE i.category IN ('human','incomplete') AND i.resolved=0 AND s.is_duplicate=0
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
            rows = await self._rows(
                """SELECT n.entity_id,s.id AS source_row_id,s.snapshot_id,
                s.row_number,json_extract(n.record_json,'$.description') AS description
                FROM normalized_records n JOIN source_rows s
                ON s.snapshot_id=n.snapshot_id AND s.row_number=n.row_number
                WHERE n.snapshot_id=(SELECT snapshot_id FROM pipeline_runs
                    WHERE operation='collect' AND status='completed'
                    ORDER BY completed_at DESC,started_at DESC,rowid DESC LIMIT 1)
                AND n.entity_id IS NOT NULL AND n.is_duplicate=0
                ORDER BY n.entity_id,s.row_number"""
            )
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            if not row["description"] or not row["description"].strip():
                continue
            sources = grouped.setdefault(row["entity_id"], [])
            if any(item["description"] == row["description"] for item in sources):
                continue
            sources.append({
                "source_row_id": row["source_row_id"],
                "row_number": row["row_number"],
                "description": row["description"],
            })
        candidates = []
        for entity_id, sources in grouped.items():
            main = sources[0]
            candidates.append({
                "entity_id": entity_id,
                "source_row_id": main["source_row_id"],
                "snapshot_id": next(row["snapshot_id"] for row in rows if row["entity_id"] == entity_id),
                "description": main["description"],
                "sources": sources,
                "input_hash": _description_hash([item["description"] for item in sources]),
            })
        return candidates

    async def prepared_text(
        self, cache_key: str, entity_id: str, input_hash: str, model: str,
        prompt_version: str, schema_version: str,
    ) -> dict[str, Any] | None:
        from athar_dataops.schemas.preparation import (
            TARGET_LANGUAGE,
        )
        async with self._lock:
            rows = await self._rows(
                """SELECT output_json FROM text_preparations WHERE cache_key=? OR
                (entity_id=? AND input_hash=? AND provider='groq' AND model=?
                AND prompt_version=? AND schema_version=? AND target_language=?) LIMIT 1""",
                (cache_key, entity_id, input_hash, model, prompt_version, schema_version, TARGET_LANGUAGE),
            )
        return json.loads(rows[0]["output_json"]) if rows else None

    async def save_preparation(self, candidate: dict[str, Any], cache_key: str,
                               input_hash: str, model: str, profile: str,
                               output: dict[str, Any]) -> None:
        from athar_dataops.schemas.preparation import TARGET_LANGUAGE
        from athar_dataops.services.preparation import candidate_versions

        prompt_version, schema_version = candidate_versions(candidate)
        async with self._transaction():
            await self._execute(
                """INSERT INTO text_preparations
                (cache_key, source_row_id, entity_id, input_hash, provider, model, profile,
                 prompt_version, schema_version, target_language, output_json, created_at)
                VALUES (?, ?, ?, ?, 'groq', ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_key) DO NOTHING""",
                (cache_key, candidate["source_row_id"], candidate["entity_id"], input_hash,
                 model, profile, prompt_version, schema_version, TARGET_LANGUAGE,
                 json.dumps(output, ensure_ascii=False), utc_now()),
            )
            for index, source in enumerate(candidate["sources"]):
                await self._execute(
                    """INSERT INTO text_preparation_sources
                    (cache_key,source_row_id,role,input_hash) VALUES (?,?,?,?)
                    ON CONFLICT(cache_key,source_row_id) DO NOTHING""",
                    (cache_key,source["source_row_id"],
                     "main" if index == 0 else "secondary",
                     hashlib.sha256(source["description"].encode()).hexdigest()),
                )
            if len(candidate["sources"]) > 1:
                retrieval = output["english_summary"]
                languages = {item["detected_language"] for item in output["sources"]}
                language = next(iter(languages)) if len(languages) == 1 else "mixed"
            else:
                retrieval = output["english_translation"] or output["cleaned_text"]
                language = output["detected_language"]
            # Only publish while the current set of descriptions still matches.
            await self._execute(
                """UPDATE entities SET retrieval_text=?, detected_language=?, is_embedded=0
                WHERE id=? AND latest_row_id=? AND preparation_input_hash=?""",
                (retrieval, language, candidate["entity_id"],
                 candidate["source_row_id"], input_hash),
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

    async def preparation_quota_state(
        self, task: str = "prepare", names: list[str] | None = None
    ) -> list[ProfileQuotaState]:
        """Per-profile limits, disabled flag, and consumption since day/minute windows.

        With ``names``, only those profiles are returned; stored rows for profiles
        no longer configured keep their history but never enter rotation.
        """
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
                    THEN input_tokens + output_tokens END) AS tokens,
                SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS unknown
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
        allowed = set(names) if names is not None else None
        quotas_by_profile: dict[str, dict[str, QuotaLimit]] = {}
        for row in quota_rows:
            quotas_by_profile.setdefault(row["profile_id"], {})[row["metric"]] = {
                "limit": row["limit_value"],
                "period": row["period"],
            }
        state: list[ProfileQuotaState] = []
        for profile in profiles:
            if allowed is not None and profile["name"] not in allowed:
                continue
            usage = day_by.get(
                profile["name"], {"requests": 0, "tokens": None, "unknown": 0}
            )
            quotas = quotas_by_profile.get(profile["id"], {})
            # Unknown attempts keep nullable counts but consume the same per-record
            # estimate the live ledger applies, so a restart cannot underspend.
            estimate = float(
                quotas.get("estimate_tokens_per_record", {}).get("limit", 1000)
            )
            tokens_today = float(usage["tokens"] or 0) + (
                usage["unknown"] or 0
            ) * estimate
            state.append(
                {
                    "name": profile["name"],
                    "provider": profile["provider"],
                    "model": profile["model"],
                    "fingerprint": profile["fingerprint"],
                    "disabled": bool(profile["disabled"]),
                    "quotas": quotas,
                    "requests_today": usage["requests"],
                    "tokens_today": tokens_today,
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

    async def profile_overview(self) -> list[ProfileOverview]:
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
        overview: list[ProfileOverview] = []
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
