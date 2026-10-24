"""Preserved evidence, identity resolution, review findings, and corpus reconciliation."""

import hashlib
import json
import unicodedata
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from athar_dataops.schemas.issues import classify_issue
from athar_dataops.schemas.pipeline import PipelineRunResult
from athar_dataops.schemas.registry import (
    NormalizedRecord,
    RegistrySnapshot,
    utc_now,
)
from athar_dataops.services.database.core import ConnectionCore
from athar_dataops.services.registry import RegistryService


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


class RegistryStore(ConnectionCore):
    async def _post_migration(self, version: int) -> None:
        """Apply the registry data fix-ups a numbered migration needs after its SQL."""
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
        if version == 8:
            await self._backfill_identity_keys()
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

    async def _backfill_identity_keys(self) -> None:
        for row in await self._rows("SELECT id, domain, website FROM entities"):
            key = _site_identity(row["domain"], row["website"])
            await self._execute(
                "UPDATE entities SET identity_key=? WHERE id=?", (key, row["id"])
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
