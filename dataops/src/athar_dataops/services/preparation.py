"""Prepare each description once; rotate across stored profiles within data-driven quotas."""

import asyncio
import hashlib
import json
from collections import deque
from collections.abc import Callable
from time import monotonic
from typing import Any
from uuid import uuid4

from athar_dataops.schemas.pipeline import PipelineRunResult, StageProgress
from athar_dataops.schemas.preparation import (
    MULTI_PROMPT_VERSION,
    MULTI_SCHEMA_VERSION,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    TARGET_LANGUAGE,
    PreparePreview,
    PreviewProfile,
    ProfileQuotaState,
)
from athar_dataops.schemas.registry import utc_now
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import (
    GROQ_DEFAULT_QUOTAS,
    GroqPreparationClient,
    ProfileStatus,
)

_QUOTA_EXHAUSTED = "Groq daily allowance reached across all profiles; resume after reset"
_RATE_LIMITED = "Groq rate limits still throttling; resume later with your configured profiles"


def candidate_versions(candidate: dict) -> tuple[str, str]:
    return (
        (MULTI_PROMPT_VERSION, MULTI_SCHEMA_VERSION)
        if len(candidate["sources"]) > 1 else (PROMPT_VERSION, SCHEMA_VERSION)
    )


def preparation_key(candidate: dict, model: str) -> tuple[str, str]:
    input_hash = candidate["input_hash"]
    prompt_version, schema_version = candidate_versions(candidate)
    # Source identity prevents attaching another record's provenance to reused text.
    source_identity = (
        [item["source_row_id"] for item in candidate["sources"]]
        if len(candidate["sources"]) > 1 else candidate["source_row_id"]
    )
    material = [source_identity, input_hash, "groq", model,
                prompt_version, schema_version, TARGET_LANGUAGE]
    return hashlib.sha256(json.dumps(material).encode()).hexdigest(), input_hash


class _ProfileQuota:
    """In-memory budget state for one profile, seeded from the database."""

    def __init__(self, entry: ProfileQuotaState):
        self.name = entry["name"]
        self.model = entry["model"]
        self.disabled = entry["disabled"]
        self.requests_today = entry["requests_today"]
        self.tokens_today = float(entry["tokens_today"] or 0)
        self.minute_bucket: deque[float] = deque(
            monotonic() - i for i in range(max(0, entry["requests_minute"]))
        )
        quotas = entry["quotas"]
        self.records_limit = float(quotas.get("records_per_day", {}).get("limit", 0))
        self.tokens_limit = float(quotas.get("tokens_per_day", {}).get("limit", 0))
        self.minute_limit = float(quotas.get("requests_per_minute", {}).get("limit", 0))
        self.estimate = float(quotas.get("estimate_tokens_per_record", {}).get("limit", 1000))
        self.cooled_until = 0.0

    def record(self, tokens: int | None) -> None:
        self.requests_today += 1
        self.minute_bucket.append(monotonic())
        self.tokens_today += float(tokens) if tokens is not None else self.estimate

    @property
    def daily_budget_left(self) -> bool:
        records_ok = not (self.records_limit and self.requests_today >= self.records_limit)
        tokens_ok = not (
            self.tokens_limit and self.tokens_today + self.estimate > self.tokens_limit
        )
        return not self.disabled and records_ok and tokens_ok

    def eligible(self, now: float) -> bool:
        if not self.daily_budget_left or self.cooled_until > now:
            return False
        self._trim(now)
        return not (self.minute_limit and len(self.minute_bucket) >= self.minute_limit)

    def _trim(self, now: float) -> None:
        while self.minute_bucket and now - self.minute_bucket[0] >= 60:
            self.minute_bucket.popleft()


class _QuotaLedger:
    def __init__(self, state: list[ProfileQuotaState]):
        self.profiles = [_ProfileQuota(entry) for entry in state]

    def model_for(self, name: str) -> str:
        for profile in self.profiles:
            if profile.name == name:
                return profile.model
        raise KeyError(name)

    def pick(self, hinted: set[str]) -> str | None:
        """Least-loaded eligible profile that has not already spent its rotation round."""
        now = monotonic()
        candidates = [
            profile for profile in self.profiles
            if profile.name not in hinted and profile.eligible(now)
        ]
        if not candidates:
            return None
        def remaining(limit: float, used: float) -> float:
            return limit - used if limit else float("inf")
        return max(
            candidates,
            key=lambda profile: (
                remaining(profile.tokens_limit, profile.tokens_today),
                remaining(profile.records_limit, profile.requests_today),
            ),
        ).name

    def retry_seconds(self, hinted: set[str] | None = None) -> float:
        """Shortest wait until some unspent profile with daily budget frees up."""
        now = monotonic()
        wait = 60.0
        for profile in self.profiles:
            if (hinted and profile.name in hinted) or not profile.daily_budget_left:
                continue
            if profile.cooled_until > now:
                wait = min(wait, profile.cooled_until - now)
                continue
            profile._trim(now)
            if profile.minute_limit and len(profile.minute_bucket) >= profile.minute_limit:
                # The oldest request in the window leaves it after 60 seconds.
                wait = min(wait, max(0.05, 60.0 - (now - profile.minute_bucket[0])))
        return wait

    def cool(self, name: str, seconds: float = 60.0) -> None:
        for profile in self.profiles:
            if profile.name == name:
                profile.cooled_until = monotonic() + seconds

    def disable(self, name: str) -> None:
        for profile in self.profiles:
            if profile.name == name:
                profile.disabled = True

    def record(self, name: str, tokens: int | None) -> None:
        for profile in self.profiles:
            if profile.name == name:
                profile.record(tokens)


class _CacheIndex:
    """Stored preparations for the configured models, matched in memory.

    A hit is either the exact cache key (same source rows, hash, model and
    versions) or the same entity, hash, model and versions under other source
    rows, mirroring the lookup ``DatabaseService.prepared_text`` performs.
    """

    def __init__(self, rows: list[dict[str, Any]]):
        self.keys = {row["cache_key"] for row in rows}
        self.signatures = {
            (row["entity_id"], row["input_hash"], row["model"],
             row["prompt_version"], row["schema_version"])
            for row in rows
        }

    def hit(self, candidate: dict[str, Any], model: str) -> tuple[str, str] | None:
        key, input_hash = preparation_key(candidate, model)
        prompt_version, schema_version = candidate_versions(candidate)
        signature = (candidate["entity_id"], input_hash, model, prompt_version, schema_version)
        if key in self.keys or signature in self.signatures:
            return key, input_hash
        return None


class PreparationService:
    def __init__(self, provider: GroqPreparationClient, database: DatabaseService):
        self.provider = provider
        self._db = database

    @property
    def available(self) -> bool:
        return self.provider.configured

    @property
    def marker(self) -> str:
        names = ", ".join(status.name for status in self.provider.profiles)
        return f"profiles: {names}" if names else "not configured"

    @property
    def profile_summaries(self) -> list[PreviewProfile]:
        return [
            {
                "name": status.name,
                "model": status.model,
                "fingerprint": status.fingerprint,
            }
            for status in self.provider.profiles
        ]

    async def _cache_index(self) -> _CacheIndex:
        models = list(dict.fromkeys(status.model for status in self.provider.profiles))
        return _CacheIndex(await self._db.cached_preparation_index(models))

    def _cached_candidate(
        self, candidate: dict[str, Any], index: _CacheIndex
    ) -> tuple[ProfileStatus, str, str] | None:
        """Reusable output under any configured model, without spending quota or a query."""
        for status in self.provider.profiles:
            hit = index.hit(candidate, status.model)
            if hit is not None:
                return status, hit[0], hit[1]
        return None

    async def preview(self) -> PreparePreview:
        if not self.available:
            return {
                "available": False,
                "profiles": [],
                "eligible": 0,
                "uncached": 0,
                "cached": 0,
            }
        await self._db.sync_profiles(list(self.provider.profiles), list(GROQ_DEFAULT_QUOTAS))
        candidates = await self._db.preparation_candidates()
        profiles = [
            {
                "name": status.name,
                "model": status.model,
                "fingerprint": status.fingerprint,
            }
            for status in self.provider.profiles
        ]
        index = await self._cache_index()
        cached = sum(
            1 for candidate in candidates
            if self._cached_candidate(candidate, index) is not None
        )
        return {
            "available": True,
            "profiles": profiles,
            "eligible": len(candidates),
            "uncached": len(candidates) - cached,
            "cached": cached,
        }

    async def run(self, progress: Callable[[StageProgress], None] | None = None) -> PipelineRunResult:
        if not self.available:
            raise RuntimeError("No Groq credentials: set GROQ_API_KEY or add profiles to .env.profiles.toml")
        await self._db.sync_profiles(list(self.provider.profiles), list(GROQ_DEFAULT_QUOTAS))
        run_id = str(uuid4())
        processed = cached = failed = 0
        snapshot_id: str | None = None
        stage = "load"
        configured = [status.name for status in self.provider.profiles]
        ledger = _QuotaLedger(
            await self._db.preparation_quota_state(names=configured)
        )
        # Each profile gets at most one throttling round per run; a second strike means
        # the available rotation is spent, so the run stops visibly for a later resume.
        hinted: set[str] = set()
        await self._db.start_run(run_id, "prepare")

        async def report(status: str, message: str):
            await self._db.record_step(run_id, stage, status=status,
                                       started_at=utc_now() if status == "running" else None,
                                       completed_at=utc_now() if status != "running" else None,
                                       items=processed, message=message)
            if progress:
                progress(StageProgress(stage, status, message, processed, run_id))

        try:
            await report("running", "Finding descriptions to prepare")
            candidates = await self._db.preparation_candidates()
            snapshot_id = candidates[0]["snapshot_id"] if candidates else None
            await report("completed", f"{len(candidates)} eligible descriptions")
            stage = "prepare"
            await report("running", f"Groq {self.marker}")
            # One index for the whole run: candidates are distinct entities, so a
            # preparation saved during this run is never a hit for a later one.
            index = await self._cache_index()
            for candidate in candidates:
                existing = self._cached_candidate(candidate, index)
                cached_output = None
                if existing is not None:
                    status, cache_key, input_hash = existing
                    prompt_version, schema_version = candidate_versions(candidate)
                    cached_output = await self._db.prepared_text(
                        cache_key, candidate["entity_id"], input_hash, status.model,
                        prompt_version, schema_version,
                    )
                if cached_output is not None:
                    # Reuse cached evidence with fresh provenance for this source row.
                    await self._db.save_preparation(
                        candidate, cache_key, input_hash, status.model,
                        status.name, cached_output,
                    )
                    profile = status.name
                    cached += 1
                    processed += 1
                    if progress:
                        progress(StageProgress(stage, "running",
                                               f"{profile} · {processed}/{len(candidates)} prepared · {cached} cached · {failed} failed",
                                               processed, run_id))
                    continue
                while True:
                    profile = await self._reserve(ledger, hinted)
                    cache_key, input_hash = preparation_key(candidate, ledger.model_for(profile))
                    attempt_id = str(uuid4())
                    await self._db.start_preparation_usage(
                        attempt_id, run_id, candidate["source_row_id"],
                        ledger.model_for(profile), profile,
                        self._fingerprint(profile),
                    )
                    start = monotonic()
                    try:
                        if len(candidate["sources"]) > 1:
                            reply = await self.provider.prepare_multi(profile, candidate["sources"])
                        else:
                            reply = await self.provider.prepare(profile, candidate["description"])
                    except asyncio.CancelledError:
                        await self._db.finish_preparation_usage(
                            attempt_id, monotonic() - start, "cancelled",
                            error="Cancelled; consumption unknown",
                        )
                        raise
                    tokens = None
                    if reply.input_tokens is not None and reply.output_tokens is not None:
                        tokens = reply.input_tokens + reply.output_tokens
                    ledger.record(profile, tokens)
                    if reply.limit_hint:
                        await self._db.finish_preparation_usage(
                            attempt_id, monotonic() - start, reply.limit_hint, reply, reply.error
                        )
                        if reply.limit_hint == "authentication":
                            await self._db.mark_profile_disabled(profile, True)
                            ledger.disable(profile)
                        elif reply.limit_hint in ("rate_limited", "transport"):
                            ledger.cool(profile)
                        else:
                            # A provider or request fault is not throttling: stop
                            # visibly instead of spending one call per profile.
                            raise RuntimeError(reply.error)
                        hinted.add(profile)
                        if progress:
                            progress(StageProgress(stage, "running",
                                                   f"{profile}: {reply.limit_hint}; rotating", processed, run_id))
                        continue
                    await self._db.finish_preparation_usage(
                        attempt_id, monotonic() - start,
                        "completed" if reply.output else "failed", reply, reply.error,
                    )
                    if reply.output is None:
                        if reply.stop:
                            raise RuntimeError(reply.error)
                        failed += 1
                        if progress:
                            progress(StageProgress(stage, "running",
                                                   f"Skipped invalid output for record {candidate['entity_id'][:8]}; retryable", processed, run_id))
                        break
                    await self._db.save_preparation(
                        candidate, cache_key, input_hash, ledger.model_for(profile),
                        profile, reply.output.model_dump(),
                    )
                    processed += 1
                    break
                if progress:
                    progress(StageProgress(stage, "running",
                                           f"{profile} · {processed}/{len(candidates)} prepared · {cached} cached · {failed} failed",
                                           processed, run_id))
            if failed:
                raise RuntimeError(f"{failed} descriptions failed validation; {processed} successes retained")
            await report("completed", f"{processed} prepared · {cached} cached · 0 failed")
            return await self._db.finish_preparation_run(run_id, "completed", processed, snapshot_id)
        except (Exception, asyncio.CancelledError) as exc:
            cancelled = isinstance(exc, asyncio.CancelledError)
            status = "cancelled" if cancelled else "failed"
            message = "Preparation cancelled; saved outputs retained" if cancelled else str(exc)
            await report(status, message)
            result = await self._db.finish_preparation_run(run_id, status, processed, snapshot_id, message)
            if cancelled:
                raise
            return result

    async def _reserve(self, ledger: _QuotaLedger, hinted: set[str]) -> str:
        """Pick a fresh profile; pace past short blockers; stop when rotation is spent.

        A profile that already spent its throttling round is never reused, so every
        profile fires at most one strike per run and the run cannot livelock.
        """
        while True:
            profile = ledger.pick(hinted)
            if profile is not None:
                return profile
            fresh = [
                profile for profile in ledger.profiles
                if profile.name not in hinted and profile.daily_budget_left
            ]
            if fresh:
                await asyncio.sleep(ledger.retry_seconds(hinted))
                continue
            if any(profile.daily_budget_left for profile in ledger.profiles):
                raise RuntimeError(_RATE_LIMITED)
            raise RuntimeError(_QUOTA_EXHAUSTED)

    def _fingerprint(self, profile: str) -> str:
        status = self.provider.status_for(profile)
        return status.fingerprint if status else "unknown"
