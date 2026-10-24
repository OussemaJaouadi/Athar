"""Prepare cache, provenance, usage ledger, and per-profile quota state."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from athar_dataops.schemas.pipeline import PipelineRunResult
from athar_dataops.schemas.preparation import (
    TARGET_LANGUAGE,
    ProfileOverview,
    ProfileQuotaState,
    QuotaLimit,
)
from athar_dataops.schemas.registry import (
    utc_now,
)
from athar_dataops.services.database.core import ConnectionCore
from athar_dataops.services.database.registry import _description_hash
from athar_dataops.services.groq import ProfileStatus


def _day_window() -> tuple[str, str]:
    now = datetime.now(UTC)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat(), now.isoformat()


def _minute_window() -> tuple[str, str]:
    now = datetime.now(UTC)
    return (now - timedelta(seconds=60)).isoformat(), now.isoformat()


class PreparationStore(ConnectionCore):
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

    async def cached_preparation_index(self, models: list[str]) -> list[dict[str, Any]]:
        """Keys and signatures of every stored preparation for these models, in one query.

        Preview and run match candidates against this in memory instead of
        issuing one lookup per candidate per configured profile.
        """
        if not models:
            return []
        slots = ",".join("?" for _ in models)
        async with self._lock:
            return await self._rows(
                f"""SELECT cache_key, entity_id, input_hash, model, prompt_version, schema_version
                FROM text_preparations
                WHERE provider='groq' AND target_language=? AND model IN ({slots})""",
                (TARGET_LANGUAGE, *models),
            )

    async def prepared_text(
        self, cache_key: str, entity_id: str, input_hash: str, model: str,
        prompt_version: str, schema_version: str,
    ) -> dict[str, Any] | None:
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
                    "SELECT id, fingerprint FROM profiles WHERE name=?", (status.name,)
                )
                if existing:
                    # A new key is the documented repair for a disabled profile:
                    # a changed fingerprint lifts the flag, the same key keeps it.
                    rotated = existing[0]["fingerprint"] != status.fingerprint
                    await self._execute(
                        """UPDATE profiles SET model=?, fingerprint=?, updated_at=?,
                        disabled=CASE WHEN ? THEN 0 ELSE disabled END WHERE id=?""",
                        (status.model, status.fingerprint, now, int(rotated), existing[0]["id"]),
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
