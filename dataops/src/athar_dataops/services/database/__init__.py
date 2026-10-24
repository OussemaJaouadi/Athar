"""Embedded Turso storage. One connection, serialized transactions, no arbitrary SQL UI.

``DatabaseService`` is the single object every caller talks to; each store
module owns one responsibility and they share the connection and lock that
``ConnectionCore`` provides.
"""

from athar_dataops.services.database.core import (
    LEGACY_MIGRATION_CHECKSUMS,
    ConnectionCore,
)
from athar_dataops.services.database.preparation import PreparationStore
from athar_dataops.services.database.registry import RegistryStore
from athar_dataops.services.database.retrieval import RetrievalStore
from athar_dataops.services.database.runs import RunStore


class DatabaseService(RegistryStore, RunStore, RetrievalStore, PreparationStore, ConnectionCore):
    """Product-data writer for DataOps; the Go backend only reads these tables."""


__all__ = ["LEGACY_MIGRATION_CHECKSUMS", "DatabaseService"]
