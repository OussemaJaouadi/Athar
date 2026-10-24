"""Bounded record pages for the Records tab: search, evidence, findings, prepared text."""

import json
import unicodedata
from typing import Any

from athar_dataops.schemas.database import RecordPage
from athar_dataops.schemas.issues import RecordIssue
from athar_dataops.schemas.registry import (
    NormalizedRecord,
    RecordDetail,
)
from athar_dataops.services.database.core import ConnectionCore


class RetrievalStore(ConnectionCore):
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
