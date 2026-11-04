"""Connection, transactions, migrations, and bounded schema inspection."""

import asyncio
import hashlib
import os
import stat
from contextlib import asynccontextmanager
from importlib.resources import files
from pathlib import Path
from typing import Any

import turso.aio

from athar_dataops.schemas.database import TablePage
from athar_dataops.schemas.registry import (
    utc_now,
)

# The product table group DataOps owns. The same file will hold the Go
# backend's private account tables; those are never listed, paged, or wiped here.
PRODUCT_TABLES: frozenset[str] = frozenset({
    "schema_migrations", "source_snapshots", "source_rows", "normalized_records",
    "entities", "entity_founders", "entity_relations", "entity_review_items",
    "entity_embeddings", "pipeline_runs", "run_steps", "text_preparations",
    "text_preparation_sources", "preparation_usage", "profiles", "dataops_quotas",
})


def restrict_file_permissions(path: Path) -> None:
    """Make the database and its journal readable by the owner only.

    Raw registry rows hold real phone numbers and emails; the file must not be
    group- or world-readable. Missing files and foreign filesystems are ignored.
    """
    for candidate in (path, path.with_name(path.name + "-wal"), path.with_name(path.name + "-shm")):
        try:
            if candidate.exists() and stat.S_IMODE(candidate.stat().st_mode) & 0o077:
                os.chmod(candidate, 0o600)
        except OSError:
            continue


LEGACY_MIGRATION_CHECKSUMS: dict[int, set[str]] = {
    3: {"c4e73296518f62ee66d42af311f970a30ec3d139d88ec21fbfe2694a206de6ff"},
}


class ConnectionCore:
    def __init__(self, path: Path):
        self.path = path
        self._conn: turso.aio.Connection | None = None
        self._lock = asyncio.Lock()
        # Schema only changes through migrations (run in initialize), so one
        # process reuses it instead of re-running PRAGMAs for every page.
        self._schema_cache: dict[str, list[str]] | None = None

    @property
    def connection(self) -> turso.aio.Connection:
        if self._conn is None:
            raise RuntimeError("Database has not been initialized")
        return self._conn

    async def _execute(self, sql: str, parameters: tuple = ()) -> None:
        cursor = await self.connection.execute(sql, parameters)
        await cursor.close()

    async def _rows(self, sql: str, parameters: tuple = ()) -> list[dict[str, Any]]:
        cursor = await self.connection.execute(sql, parameters)
        try:
            columns = [column[0] for column in cursor.description or ()]
            return [dict(zip(columns, row)) for row in await cursor.fetchall()]
        finally:
            await cursor.close()

    @asynccontextmanager
    async def _transaction(self):
        # Inspection must not share the connection while a write transaction is open.
        async with self._lock:
            await self._execute("BEGIN")
            try:
                yield
                # Cancellation must not leave an indeterminate commit in the driver queue.
                commit = asyncio.create_task(self._execute("COMMIT"))
                try:
                    await asyncio.shield(commit)
                except asyncio.CancelledError:
                    await commit
                    raise
            except BaseException:
                # ROLLBACK after an already completed COMMIT has no work to undo.
                await self.connection.rollback()
                raise

    async def initialize(self) -> None:
        self._schema_cache = None
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._conn = await turso.aio.connect(str(self.path), isolation_level=None)
        restrict_file_permissions(self.path)
        try:
            existing = await self._rows(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
            names = {row["name"] for row in existing}
            if names and "schema_migrations" not in names:
                raise RuntimeError(
                    "Unrecognized database schema. Keep this file and choose a new DB_PATH; automatic conversion is not supported."
                )
            migration_dir = files("athar_dataops").joinpath("migrations")
            migrations = sorted(migration_dir.iterdir(), key=lambda path: path.name)
            applied = (
                await self._rows(
                    "SELECT version, checksum FROM schema_migrations ORDER BY version"
                )
                if names
                else []
            )
            known = {int(path.name.split("_")[0]): path for path in migrations}
            if any(row["version"] not in known for row in applied):
                raise RuntimeError("Database schema is newer than this application")
            for row in applied:
                checksum = hashlib.sha256(
                    known[row["version"]].read_bytes()
                ).hexdigest()
                if row["checksum"] != checksum and row["checksum"] not in (
                    LEGACY_MIGRATION_CHECKSUMS.get(row["version"], set())
                ):
                    raise RuntimeError(
                        "Applied migration checksum does not match; no changes made"
                    )
            applied_versions = {row["version"] for row in applied}
            await self._execute("PRAGMA foreign_keys = ON")
            for version, path in known.items():
                if version in applied_versions:
                    continue
                sql = path.read_text()
                if version in (8, 9):
                    await self._execute("PRAGMA foreign_keys = OFF")
                try:
                    async with self._transaction():
                        # These packaged migrations contain simple SQL statements, no triggers.
                        for statement in sql.split(";"):
                            if statement.strip():
                                await self._execute(statement)
                        # Data fix-ups that SQL alone cannot express live with
                        # the registry rules they apply.
                        await self._post_migration(version)
                        if version in (8, 9):
                            violations = await self._rows("PRAGMA foreign_key_check")
                            if violations:
                                raise RuntimeError(f"Migration {version:03d} left invalid references")
                        await self._execute(
                            "INSERT INTO schema_migrations VALUES (?, ?, ?)",
                            (
                                version,
                                hashlib.sha256(path.read_bytes()).hexdigest(),
                                utc_now(),
                            ),
                        )
                finally:
                    if version in (8, 9):
                        await self._execute("PRAGMA foreign_keys = ON")
        except BaseException:
            await self.close()
            raise

    async def _post_migration(self, version: int) -> None:
        """Hook for data fix-ups after a migration's SQL; the registry store implements it."""
        return

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def schema(self) -> dict[str, list[str]]:
        if self._schema_cache is not None:
            return self._schema_cache
        async with self._lock:
            tables = await self._rows(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            result = {}
            for table in tables:
                name = table["name"]
                if name not in PRODUCT_TABLES:
                    # Account tables belong to the application; DataOps has zero access.
                    continue
                quoted = name.replace('"', '""')
                columns = await self._rows(f'PRAGMA table_info("{quoted}")')
                result[name] = [row["name"] for row in columns]
            self._schema_cache = result
            return result

    async def table_page(self, table: str, offset: int = 0, limit: int = 100) -> TablePage:
        """One bounded page of a product table; the caller sizes it to what it can show."""
        schema = await self.schema()
        if table not in schema:
            raise ValueError("Unknown table")
        limit = max(1, min(int(limit), 500))
        quoted = table.replace('"', '""')
        async with self._lock:
            cursor = await self.connection.execute(
                f'SELECT * FROM "{quoted}" ORDER BY rowid LIMIT ? OFFSET ?',
                (limit + 1, max(0, offset)),
            )
            try:
                rows = await cursor.fetchall()
            finally:
                await cursor.close()
        return TablePage(schema[table], rows[:limit], len(rows) > limit)

    async def migration_status(self) -> list[dict[str, Any]]:
        """Compare packaged migrations with applied rows; reporting never fails fast."""
        migration_dir = files("athar_dataops").joinpath("migrations")
        applied = {
            row["version"]: row
            for row in await self._rows(
                "SELECT version, checksum, applied_at FROM schema_migrations"
            )
        }
        status = []
        for path in sorted(migration_dir.iterdir(), key=lambda path: path.name):
            try:
                version = int(path.name.split("_", 1)[0])
            except ValueError:
                continue
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            recorded = applied.pop(version, None)
            if recorded is None:
                state = "missing"
            elif recorded["checksum"] == checksum:
                state = "ok"
            elif recorded["checksum"] in LEGACY_MIGRATION_CHECKSUMS.get(version, set()):
                state = "legacy"
            else:
                state = "mismatch"
            status.append(
                {
                    "version": version,
                    "name": path.name,
                    "applied_at": recorded["applied_at"] if recorded else None,
                    "status": state,
                }
            )
        for version, recorded in applied.items():
            status.append(
                {
                    "version": version,
                    "name": "unknown",
                    "applied_at": recorded["applied_at"],
                    "status": "unknown",
                }
            )
        status.sort(key=lambda entry: entry["version"])
        return status

    async def wipe_data(self) -> int:
        """Delete every data row, keeping schema and schema_migrations."""
        schema = await self.schema()
        tables = [name for name in schema if name != "schema_migrations"]
        # Children first so a wiped child never leaves a dangling foreign key
        # that trips an immediate FK check on the wipe of its parent row.
        preferred = (
            "preparation_usage",
            "text_preparation_sources",
            "text_preparations",
            "run_steps",
            "entity_review_items",
            "entity_relations",
            "entity_founders",
            "entity_embeddings",
            "normalized_records",
            "entities",
            "source_rows",
            "pipeline_runs",
            "source_snapshots",
            "dataops_quotas",
            "profiles",
        )
        ordered = [name for name in preferred if name in tables]
        ordered += [name for name in tables if name not in ordered]
        deleted = 0
        async with self._transaction():
            for name in ordered:
                quoted = name.replace('"', '""')
                count = await self._rows(f'SELECT COUNT(*) AS n FROM "{quoted}"')
                rows = count[0]["n"]
                if rows:
                    await self._execute(f'DELETE FROM "{quoted}"')
                    deleted += rows
        return deleted
