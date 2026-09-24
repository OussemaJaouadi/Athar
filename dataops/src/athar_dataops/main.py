"""Own every service for exactly one event loop and one application session."""

import asyncio
import sys

import httpx
from pydantic import ValidationError

from athar_dataops.app import DataOpsApp
from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.metrics import ProcessSampler
from athar_dataops.services.orchestrator import PipelineOrchestrator
from athar_dataops.services.preparation import PreparationService
from athar_dataops.services.registry import RegistryService


async def run() -> None:
    config = Settings()
    database = DatabaseService(config.db_path)
    try:
        await database.initialize()
        async with httpx.AsyncClient(
            headers={"User-Agent": config.registry_user_agent},
            timeout=30,
            follow_redirects=True,
        ) as client, httpx.AsyncClient(timeout=60, follow_redirects=False) as groq_http:
            registry = RegistryService()
            collector = ArtifactService(client, config.registry_url)
            groq_client = GroqPreparationClient(groq_http, config)
            orchestrator = PipelineOrchestrator(
                collector,
                registry,
                database,
                config.pipeline_timeout_seconds,
                PreparationService(groq_client, database),
            )
            app = DataOpsApp(
                orchestrator,
                database,
                config,
                ProcessSampler(),
                artifact=collector,
                registry=registry,
                groq=groq_client,
            )
            await app.run_async()
    finally:
        await database.close()


def main() -> None:
    try:
        asyncio.run(run())
    except (ValidationError, RuntimeError, OSError) as exc:
        print(f"Athar could not start: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
