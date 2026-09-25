"""Multi-profile rotation and data-driven quota exhaustion. No inference credits."""

import json
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

import httpx
from test_pipeline import registry_row

from athar_dataops.config import (
    Settings,
    credential_file_warnings,
    load_groq_profiles,
)
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GROQ_DEFAULT_QUOTAS, GroqPreparationClient
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.preparation import PreparationService
from athar_dataops.services.registry import RegistryService
from athar_dataops.themes import DARK, LIGHT

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

    def test_malformed_file_yields_no_profiles(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profiles.toml"
            path.write_text("[[profile]]\nname = oops\napi_key = gsk-not-quoted\n")
            self.assertEqual(load_groq_profiles(path), ())

    async def test_settings_usage_caps_many_profiles(self):
        import io

        from rich.console import Console
        from textual.app import App, ComposeResult

        from athar_dataops.ui.panes.settings_pane import SettingsPane

        class SettingsHarness(App[None]):
            def __init__(self, pane):
                super().__init__()
                self._pane = pane
                self.register_theme(DARK)
                self.register_theme(LIGHT)
                self.theme = "athar-dark"

            def compose(self) -> ComposeResult:
                yield self._pane

        with tempfile.TemporaryDirectory() as directory:
            config = Settings(
                _env_file=None,
                groq_profiles_path=Path(directory) / "none.toml",
            )
            rows = [
                {
                    "name": f"profile-{i}",
                    "model": "llama-3.3-70b",
                    "disabled": i % 2 == 0,
                    "calls": i,
                    "requests_today": i,
                    "tokens_today": i * 100,
                    "key_fingerprint": "fp",
                }
                for i in range(9)
            ]
            harness = SettingsHarness(SettingsPane(config))
            async with harness.run_test() as pilot:
                await pilot.pause()
                text = harness.query_one(SettingsPane)._profile_usage(rows)
                stream = io.StringIO()
                Console(file=stream, width=120, color_system=None).print(text)
                rendered = stream.getvalue()
                for name in ("profile-0", "profile-1", "profile-5"):
                    self.assertIn(name, rendered)
                self.assertNotIn("profile-7", rendered)
                self.assertNotIn("profile-8", rendered)
                self.assertIn("… and 3 more profiles", rendered)