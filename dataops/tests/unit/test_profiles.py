"""Multi-profile rotation and data-driven quota exhaustion. No inference credits."""

import json
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

import httpx
from support import registry_row

from athar_dataops.config import (
    Settings,
    credential_file_warnings,
    inspect_groq_profiles,
    load_groq_profiles,
)
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GROQ_DEFAULT_QUOTAS, GroqPreparationClient
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.preparation import PreparationService
from athar_dataops.services.registry import RegistryService

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

PROFILES_TOML = """\
[[profile]]
name = "account-a"
api_key = "key-a"

[[profile]]
name = "account-b"
api_key = "key-b"
"""


def _output(description: str):
    return {
        "detected_language": "fr",
        "cleaned_text": description,
        "english_translation": "Prepared service.",
        "fluff_excerpts": [description.split()[0]],
    }


class ProfileRotationTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "test.db"
        self.profiles_path = Path(self.directory.name) / ".env.profiles.toml"
        self.profiles_path.write_text(PROFILES_TOML, encoding="utf-8")
        self.db = DatabaseService(self.path)
        await self.db.initialize()
        self.config = Settings(_env_file=None, groq_profiles_path=self.profiles_path)
        self.calls: dict[str, list[int]] = {"account-a": [], "account-b": []}
        self.hints: dict[str, int] = {}
        self.rows = [registry_row(desc="Le meilleur logiciel pour 12 magasins.")]
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self.respond))
        self.provider = GroqPreparationClient(self.http, self.config)
        self.preparation = PreparationService(self.provider, self.db)
        self.pipeline = PipelineOrchestrator(ArtifactService(self.http, "https://registry.example"),
                                             RegistryService(), self.db, preparation=self.preparation)
        await self.pipeline.run_pipeline()

    async def asyncTearDown(self):
        await self.http.aclose()
        await self.db.close()
        self.directory.cleanup()

    async def respond(self, request):
        if request.url.host == "registry.example":
            return httpx.Response(200, json=self.rows)
        profile = "account-b" if request.headers["Authorization"] == "Bearer key-b" else "account-a"
        self.calls[profile].append(len(self.calls[profile]) + 1)
        status = self.hints.get(profile, 200)
        if status != 200:
            return httpx.Response(status, text="not-echoed")
        description = json.loads(request.content)["messages"][-1]["content"]
        return httpx.Response(200, json={
            "id": f"chatcmpl-{profile}", "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(_output(description)), "refusal": None}}],
        })

    async def test_rotation_hands_over_after_rate_limit_and_reuses_healthy_profile(self):
        self.hints["account-a"] = 429
        # Example re-ingests to a fresh candidate row; Beta and Gamma are new companies.
        self.rows = [registry_row(),
                     registry_row(name="Beta", website="www.beta.example", desc="Un autre logiciel de gestion pour 5 points de vente."),
                     registry_row(name="Gamma", website="www.gamma.example", desc="Application mobile pour 200 commerçants.")]
        await self.pipeline.run_pipeline()
        self.assertEqual(len(await self.db.preparation_candidates()), 3)
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")
        self.assertEqual(self.calls["account-a"], [1])
        self.assertEqual(self.calls["account-b"], [1, 2, 3])
        records = await self.db.list_records()
        self.assertEqual(sum(1 for record in records if record.prepared), 3)
        self.assertTrue(all(record.prepared["detected_language"] == "fr" for record in records if record.prepared))
        rows = await self.db.preparation_usage_summary()
        self.assertEqual({row["profile"] for row in rows}, {"account-a", "account-b"})

    async def test_authentication_disables_profile_and_run_completes(self):
        self.hints["account-a"] = 401
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "completed")
        state = {entry["name"]: entry for entry in await self.db.preparation_quota_state()}
        self.assertTrue(state["account-a"]["disabled"])
        self.assertFalse(state["account-b"]["disabled"])
        self.assertEqual(self.calls["account-a"], [1])
        self.assertEqual(self.calls["account-b"], [1])
        overview = {entry["name"]: entry for entry in await self.db.profile_overview()}
        self.assertNotIn("key-a", str(overview))
        self.assertNotIn("key-a", str(await self.db.preparation_usage_summary()))

    async def test_provider_error_stops_run_without_rotating_or_cooling(self):
        # A 400 (for example a wrong model name) would repeat on every profile.
        self.hints["account-a"] = 400
        self.hints["account-b"] = 400
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "failed")
        self.assertIn("HTTP 400", result.error or "")
        self.assertNotIn("throttl", (result.error or "").lower())
        self.assertEqual(len(self.calls["account-a"]) + len(self.calls["account-b"]), 1)
        state = {entry["name"]: entry for entry in await self.db.preparation_quota_state()}
        self.assertFalse(state["account-a"]["disabled"])
        self.assertFalse(state["account-b"]["disabled"])
        outcomes = await self.db._rows("SELECT outcome FROM preparation_usage")
        self.assertEqual([row["outcome"] for row in outcomes], ["provider_error"])

    async def test_rotated_key_clears_disabled_flag_and_same_key_keeps_it(self):
        await self.db.sync_profiles(list(self.provider.profiles), list(GROQ_DEFAULT_QUOTAS))
        await self.db.mark_profile_disabled("account-a", True)
        await self.db.sync_profiles(list(self.provider.profiles), list(GROQ_DEFAULT_QUOTAS))
        state = {entry["name"]: entry for entry in await self.db.preparation_quota_state()}
        self.assertTrue(state["account-a"]["disabled"], "unchanged key must stay disabled")
        self.profiles_path.write_text(
            PROFILES_TOML.replace('api_key = "key-a"', 'api_key = "key-a-rotated"'),
            encoding="utf-8",
        )
        rotated = GroqPreparationClient(self.http, self.config)
        await self.db.sync_profiles(list(rotated.profiles), list(GROQ_DEFAULT_QUOTAS))
        state = {entry["name"]: entry for entry in await self.db.preparation_quota_state()}
        self.assertFalse(state["account-a"]["disabled"], "a new key is the repair")
        self.assertEqual(state["account-a"]["fingerprint"], rotated.profiles[0].fingerprint)

    async def test_daily_quota_exhaustion_fails_visibly_and_keeps_saved_output(self):
        # Register + constrain: account-a is capped at one record today, account-b disabled.
        await self.db.sync_profiles(list(self.provider.profiles), list(GROQ_DEFAULT_QUOTAS))
        await self.db.mark_profile_disabled("account-b", True)
        await self.db._execute(
            "UPDATE dataops_quotas SET limit_value=1 WHERE profile_id=(SELECT id FROM profiles WHERE name='account-a')"
        )
        self.rows = [registry_row(),
                     registry_row(name="Beta", website="www.beta.example", desc="Un autre logiciel de gestion pour 5 points de vente."),
                     registry_row(name="Gamma", website="www.gamma.example", desc="Application mobile pour 200 commerçants.")]
        await self.pipeline.run_pipeline()
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.records_processed, 1)
        self.assertIn("resume", (result.error or "").lower())
        records = await self.db.list_records()
        self.assertEqual(sum(1 for record in records if record.prepared), 1)

    async def test_second_rate_limit_strike_stops_run(self):
        self.hints["account-a"] = 429
        self.hints["account-b"] = 429
        self.rows = [registry_row(),
                     registry_row(name="Beta", website="www.beta.example", desc="Un autre logiciel de gestion pour 5 points de vente."),
                     registry_row(name="Gamma", website="www.gamma.example", desc="Application mobile pour 200 commerçants.")]
        await self.pipeline.run_pipeline()
        result = await self.pipeline.run_preparation()
        self.assertEqual(result.status, "failed")
        self.assertEqual(self.calls["account-a"], [1])
        self.assertEqual(self.calls["account-b"], [1])
        self.assertIn("throttl", (result.error or "").lower())
        records = await self.db.list_records()
        self.assertEqual(sum(1 for record in records if record.prepared), 0)

    async def test_free_tier_default_quotas_seed_per_profile(self):
        await self.pipeline.run_preparation()
        overview = {entry["name"]: entry for entry in await self.db.profile_overview()}
        for entry in overview.values():
            quotas = entry["quotas"]
            self.assertEqual(quotas["records_per_day"]["limit"], 1000)
            self.assertEqual(quotas["records_per_day"]["period"], "day")
            self.assertEqual(quotas["tokens_per_day"]["limit"], 200000)
            self.assertEqual(quotas["requests_per_minute"]["limit"], 30)
            self.assertEqual(quotas["requests_per_minute"]["period"], "minute")
            self.assertEqual(quotas["estimate_tokens_per_record"]["limit"], 1000)
        self.assertEqual(len(overview), 2)

    async def test_legacy_single_key_becomes_implicit_profile(self):
        config = Settings(_env_file=None, groq_api_key="fake-secret", groq_profile="account-a",
                          groq_profiles_path=Path(self.directory.name) / "none.toml")
        self.assertEqual(
            [profile.name for profile in config.groq_profiles], ["account-a"]
        )
        self.assertTrue(PipelineOrchestrator(ArtifactService(self.http, "https://registry.example"),
                                             RegistryService(), self.db,
                                             preparation=PreparationService(
                                                 GroqPreparationClient(self.http, config), self.db)).preparation_available)
        empty = Settings(_env_file=None, groq_profiles_path=Path(self.directory.name) / "none.toml")
        self.assertFalse(GroqPreparationClient(self.http, empty).configured)


class QuotaLedgerTests(IsolatedAsyncioTestCase):
    def test_minute_limit_wait_follows_oldest_request_not_a_flat_minute(self):
        from time import monotonic

        from athar_dataops.services.preparation import _QuotaLedger

        state = {
            "name": "account-a", "provider": "groq", "model": "m", "fingerprint": "fp",
            "disabled": False, "requests_today": 2, "tokens_today": 0.0, "requests_minute": 2,
            "quotas": {"requests_per_minute": {"limit": 2, "period": "minute"}},
        }
        ledger = _QuotaLedger([state])
        profile = ledger.profiles[0]
        profile.minute_bucket.clear()
        profile.minute_bucket.extend((monotonic() - 50, monotonic() - 20))
        self.assertIsNone(ledger.pick(set()))
        self.assertAlmostEqual(ledger.retry_seconds(set()), 10.0, delta=1.0)
        self.assertEqual(ledger.retry_seconds({"account-a"}), 60.0)
        ledger.cool("account-a", 5.0)
        self.assertAlmostEqual(ledger.retry_seconds(set()), 5.0, delta=1.0)


class ProfileTomlTests(IsolatedAsyncioTestCase):
    def test_parse_profiles_and_skip_invalid_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profiles.toml"
            path.write_text(
                PROFILES_TOML
                + "[[profile]]\nname = \"\"\napi_key = \"x\"\n"
                + "[[profile]]\nname = \"c\"\napi_key = \"\"\n",
                encoding="utf-8",
            )
            profiles = load_groq_profiles(path)
            self.assertEqual([profile.name for profile in profiles], ["account-a", "account-b"])
            self.assertEqual(profiles[0].api_key.get_secret_value(), "key-a")

    def test_missing_file_yields_no_profiles(self):
        self.assertEqual(load_groq_profiles(Path("/nonexistent/profiles.toml")), ())

    def test_credential_file_warnings_follow_file_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("GROQ_API_KEY=x\n")
            path.chmod(0o644)
            (warning,) = credential_file_warnings([path])
            self.assertIn("chmod 600", warning)
            self.assertIn(str(path), warning)
            path.chmod(0o600)
            self.assertEqual(credential_file_warnings([path]), [])
            self.assertEqual(
                credential_file_warnings([Path(directory) / "missing.env"]), []
            )

    def test_malformed_file_yields_no_profiles_and_a_visible_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profiles.toml"
            path.write_text("[[profile]]\nname = oops\napi_key = gsk-not-quoted\n")
            self.assertEqual(load_groq_profiles(path), ())
            profiles, reason = inspect_groq_profiles(path)
            self.assertEqual(profiles, ())
            self.assertIn("could not be parsed", reason)
            self.assertNotIn("gsk-not-quoted", reason)
            config = Settings(_env_file=None, groq_profiles_path=path)
            self.assertEqual(config.groq_profiles, ())
            self.assertIn("could not be parsed", config.groq_profiles_warning)
            path.write_text('[[profile]]\nname = "only-name"\n')
            self.assertIn("name and an api_key", inspect_groq_profiles(path)[1])
            self.assertIsNone(inspect_groq_profiles(Path(directory) / "absent.toml")[1])
            path.write_text(PROFILES_TOML, encoding="utf-8")
            self.assertIsNone(inspect_groq_profiles(path)[1])

