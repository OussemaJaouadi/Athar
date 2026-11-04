"""Shared fixtures for both test layers: synthetic registry rows, a fake Groq, literal rendering."""

import asyncio
import json
import logging
import tempfile
from io import StringIO
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

import httpx
from rich.console import Console

from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.preparation import PreparationService
from athar_dataops.services.registry import RegistryService

# IsolatedAsyncioTestCase runs the loop in debug mode, which logs every callback
# slower than 100 ms. Textual mounts trip that constantly; it is noise, not a failure.
logging.getLogger("asyncio").setLevel(logging.ERROR)


def registry_row(**changes):
    row = {
        "name": "Example",
        "desc": "Concrete product detail",
        "website": "www.example.com/product?q=1",
        "label": "01/2024",
        "creation_year": "2020",
        "founders": [" Example Person "],
        "sector": "Software",
        "industry": "Software",
        "extra": {"untouched": True},
        "phone": "synthetic-private-value",
    }
    return row | changes


def render_text(renderable):
    # Textual 8 wraps a Static's content in a RichVisual; print what it wraps.
    renderable = getattr(renderable, "_renderable", renderable)
    stream = StringIO()
    Console(file=stream, width=120, color_system=None).print(renderable)
    return stream.getvalue()


class PreparationFixture(IsolatedAsyncioTestCase):
    """One collected record, one legacy Groq key, and a fake provider whose
    behaviour is steered by ``self.status`` and ``self.mode``."""

    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db = DatabaseService(Path(self.directory.name) / "test.db")
        await self.db.initialize()
        self.config = Settings(_env_file=None, groq_api_key="fake-secret", groq_profile="account-a",
                               groq_profiles_path=Path(self.directory.name) / "none.toml")
        self.calls = 0
        self.status = 200
        self.mode = "valid"
        self.waiting = asyncio.Event()
        self.rows = [registry_row(desc="Le meilleur logiciel pour 12 magasins.")]
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self.respond))
        self.preparation = PreparationService(GroqPreparationClient(self.http, self.config), self.db)
        self.pipeline = PipelineOrchestrator(ArtifactService(self.http, "https://registry.example"),
                                             RegistryService(), self.db, preparation=self.preparation)
        await self.pipeline.run_pipeline()

    async def asyncTearDown(self):
        await self.http.aclose()
        await self.db.close()
        self.directory.cleanup()

    async def respond(self, request):
        if request.url.host == "registry.example":
            self.assertNotIn("authorization", request.headers)
            return httpx.Response(200, json=self.rows)
        self.calls += 1
        payload = json.loads(request.content)
        self.assertTrue(payload["response_format"]["json_schema"]["strict"])
        if self.mode == "block":
            self.waiting.set()
            await asyncio.Event().wait()
        if self.status != 200:
            return httpx.Response(self.status, text="fake-secret")
        output = {
            "detected_language": "fr", "cleaned_text": "Logiciel pour 12 magasins.",
            "english_translation": "Software for 12 shops.", "fluff_excerpts": ["Le meilleur"],
        }
        if self.mode == "multi":
            sources = json.loads(payload["messages"][1]["content"])
            output = {
                "sources": [
                    {"row_number": source["row_number"], "detected_language": "en",
                     "cleaned_text": source["description"],
                     "english_translation": None, "fluff_excerpts": []}
                    for source in sources
                ],
                "english_summary": "Software for 12 shops and schools.",
            }
        if self.mode == "hallucinated_excerpt":
            output["fluff_excerpts"] = ["not in source"]
        if self.mode == "lost_number":
            output["cleaned_text"] = "Logiciel."
        return httpx.Response(200, json={
            "id": "chatcmpl-test", "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "choices": [{"finish_reason": "stop", "message": {
                "content": "bad json fake-secret" if self.mode == "bad_json" else json.dumps(output),
                "refusal": "refused" if self.mode == "refused" else None,
            }}],
        })
