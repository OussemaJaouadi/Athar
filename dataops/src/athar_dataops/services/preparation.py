"""Prepare each description once; rotate across stored profiles within data-driven quotas."""

import asyncio
import hashlib
import json
from collections import deque
from collections.abc import Callable
from time import monotonic
from uuid import uuid4

from athar_dataops.schemas.pipeline import PipelineRunResult, StageProgress
from athar_dataops.schemas.preparation import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    TARGET_LANGUAGE,
)
from athar_dataops.schemas.registry import utc_now
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GROQ_DEFAULT_QUOTAS, GroqPreparationClient

_QUOTA_EXHAUSTED = "Groq daily allowance reached across all profiles; resume after reset"
_RATE_LIMITED = "Groq rate limits still throttling; resume later with your configured profiles"


def preparation_key(candidate: dict, model: str) -> tuple[str, str]:
    input_hash = hashlib.sha256(candidate["description"].encode()).hexdigest()
    # Source identity prevents attaching another record's provenance to reused text.
    material = [candidate["source_row_id"], input_hash, "groq", model,
                PROMPT_VERSION, SCHEMA_VERSION, TARGET_LANGUAGE]
    return hashlib.sha256(json.dumps(material).encode()).hexdigest(), input_hash


class _ProfileQuota:
    """In-memory budget state for one profile, seeded from the database."""

    def __init__(self, entry: dict):
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
    def __init__(self, state: list[dict]):
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

    def retry_seconds(self) -> float:
        now = monotonic()
        wait = 60.0
        for profile in self.profiles:
            seconds = profile.cooled_until - now
            if 0 < seconds < wait:
                wait = seconds
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

    async def run(self, progress: Callable[[StageProgress], None] | None = None) -> PipelineRunResult:
        if not self.available:
            raise RuntimeError("No Groq credentials: set GROQ_API_KEY or add profiles to .env.profiles.toml")
        await self._db.sync_profiles(list(self.provider.profiles), list(GROQ_DEFAULT_QUOTAS))
        run_id = str(uuid4())
        processed = cached = failed = 0
        snapshot_id: str | None = None
        stage = "load"
        ledger = _QuotaLedger(await self._db.preparation_quota_state())
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
            for candidate in candidates:
                while True:
                    profile = await self._reserve(ledger, hinted)
                    cache_key, input_hash = preparation_key(candidate, ledger.model_for(profile))
                    cached_output = await self._db.prepared_text(
                        cache_key, candidate["entity_id"], input_hash, ledger.model_for(profile)
                    )
                    if cached_output is not None:
                        # Reuse cached evidence with fresh provenance for this source row.
                        await self._db.save_preparation(
                            candidate, cache_key, input_hash, ledger.model_for(profile),
                            profile, cached_output,
                        )
                        cached += 1
                        processed += 1
                        break
                    attempt_id = str(uuid4())
                    await self._db.start_preparation_usage(
                        attempt_id, run_id, candidate["source_row_id"],
                        ledger.model_for(profile), profile,
                        self._fingerprint(profile),
                    )
                    start = monotonic()
                    try:
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
                        else:
                            ledger.cool(profile)
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
                await asyncio.sleep(ledger.retry_seconds())
                continue
            if any(profile.daily_budget_left for profile in ledger.profiles):
                raise RuntimeError(_RATE_LIMITED)
            raise RuntimeError(_QUOTA_EXHAUSTED)

    def _fingerprint(self, profile: str) -> str:
        status = self.provider.status_for(profile)
        return status.fingerprint if status else "unknown"