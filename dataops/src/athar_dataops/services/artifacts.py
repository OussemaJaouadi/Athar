"""Collect a complete response without interpreting or discarding its fields."""

import hashlib
from tempfile import TemporaryFile
from uuid import uuid4

import httpx

from athar_dataops.schemas.registry import RegistrySnapshot, utc_now


class ArtifactService:
    def __init__(self, client: httpx.AsyncClient, source_url: str):
        self._client = client
        self.source_url = source_url

    async def fetch(self) -> RegistrySnapshot:
        digest = hashlib.sha256()
        # Hash the exact JSON payload bytes, before parsing or character decoding.
        with TemporaryFile() as artifact:
            async with self._client.stream("GET", self.source_url) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    digest.update(chunk)
                    artifact.write(chunk)
            artifact.seek(0)
            content = artifact.read()
        return RegistrySnapshot(
            str(uuid4()), self.source_url, digest.hexdigest(), utc_now(), content
        )
