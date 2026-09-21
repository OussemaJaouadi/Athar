"""Own every service for exactly one event loop and one application session."""

import asyncio
import sys

import httpx
from pydantic import ValidationError

from athar_dataops.app import DataOpsApp
from athar_dataops.config import Settings
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.database import DatabaseService
from athar_dataops.services.metrics import ProcessSampler
from athar_dataops.services.orchestrator import PipelineOrchestrator
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
        ) as client:
            collector = ArtifactService(client, config.registry_url)
            orchestrator = PipelineOrchestrator(
                collector, RegistryService(), database, config.pipeline_timeout_seconds
            )
            app = DataOpsApp(orchestrator, database, config, ProcessSampler())
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
