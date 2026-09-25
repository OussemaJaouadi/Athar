"""Collect a complete response without interpreting or discarding its fields."""

import hashlib
import json
from tempfile import TemporaryFile
from typing import Any
from uuid import uuid4

import httpx

from athar_dataops.schemas.registry import RegistrySnapshot, utc_now

# Safety bounds for the collect/probe response. The registry corpus is small;
# anything past these limits is a hostile or misconfigured endpoint.
DEFAULT_MAX_BYTES = 64 * 1024 * 1024
MAX_REGISTRY_ROWS = 100_000


def parse_registry_payload(content: bytes | str) -> list[Any]:
    """Parse a fetched payload with one bounded path shared by Collect and probes."""
    rows = json.loads(content)
    if not isinstance(rows, list):
        raise TypeError("Registry response must be a JSON array; source bytes retained")
    if len(rows) > MAX_REGISTRY_ROWS:
        raise ValueError(
            f"Registry response has {len(rows)} rows; the limit is {MAX_REGISTRY_ROWS}"
        )
    return rows


class ArtifactService:
    def __init__(
        self,
        client: httpx.AsyncClient,
        source_url: str,
        max_bytes: int = DEFAULT_MAX_BYTES,
    ):
        self._client = client
        self.source_url = source_url
        self.max_bytes = max_bytes

    async def fetch(self) -> RegistrySnapshot:
        digest = hashlib.sha256()
        received = 0
        # Hash the exact JSON payload bytes, before parsing or character decoding.
        with TemporaryFile() as artifact:
            async with self._client.stream("GET", self.source_url) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    received += len(chunk)
                    if received > self.max_bytes:
                        raise ValueError(
                            f"Registry response exceeds the {self.max_bytes} byte limit"
                        )
                    digest.update(chunk)
                    artifact.write(chunk)
            artifact.seek(0)
            content = artifact.read()
        return RegistrySnapshot(
            str(uuid4()), self.source_url, digest.hexdigest(), utc_now(), content
        )
