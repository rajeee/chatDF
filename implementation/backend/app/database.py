"""Database connection management and schema initialisation.

Implements: spec/backend/database/plan.md

Provides:
- ``init_db(conn)``: Enable PRAGMAs, create all 7 tables and 7 indexes.
- ``get_db(request)``: FastAPI dependency returning a connection from the pool.
- ``DatabasePool``: Simple connection pool for concurrent reads.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import aiosqlite
from fastapi import Request


# ---------------------------------------------------------------------------
# Schema SQL
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """\
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    google_id       TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL,
    name            TEXT NOT NULL,
    avatar_url      TEXT,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_keys (
    key             TEXT PRIMARY KEY,
    created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL,
    used_at         TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT '',
    is_pinned       INTEGER NOT NULL DEFAULT 0,
    share_token     TEXT UNIQUE,
    shared_at       TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role              TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content           TEXT NOT NULL,
    sql_query         TEXT,
    token_count       INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    reasoning         TEXT
);

CREATE TABLE IF NOT EXISTS datasets (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    name            TEXT NOT NULL,
    row_count       INTEGER NOT NULL DEFAULT 0,
    column_count    INTEGER NOT NULL DEFAULT 0,
    schema_json     TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'loading' CHECK(status IN ('loading', 'ready', 'error')),
    error_message   TEXT,
    loaded_at       TEXT NOT NULL,
    file_size_bytes INTEGER
);

CREATE TABLE IF NOT EXISTS token_usage (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    model_name      TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    cost            REAL NOT NULL DEFAULT 0.0,
    timestamp       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_queries (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    query           TEXT NOT NULL,
    result_json     TEXT,
    execution_time_ms REAL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS query_history (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    query           TEXT NOT NULL,
    execution_time_ms REAL,
    row_count       INTEGER,
    status          TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'error')),
    error_message   TEXT,
    source          TEXT NOT NULL DEFAULT 'sql_panel' CHECK(source IN ('sql_panel', 'llm', 'api')),
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_keys_used_by ON referral_keys(used_by);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_datasets_conversation_id ON datasets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_timestamp ON token_usage(user_id, timestamp);
CREATE TABLE IF NOT EXISTS user_settings (
    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    dev_mode        INTEGER NOT NULL DEFAULT 1,
    selected_model  TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS query_results_cache (
    cache_key       TEXT PRIMARY KEY,
    sql_query       TEXT NOT NULL,
    dataset_urls    TEXT NOT NULL,
    result_json     TEXT NOT NULL,
    row_count       INTEGER,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_results_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_saved_queries_user_id ON saved_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_query_history_user_id ON query_history(user_id, created_at);
"""


# ---------------------------------------------------------------------------
# Connection Pool
# ---------------------------------------------------------------------------


class DatabasePool:
    """Simple connection pool for concurrent read operations.

    SQLite with WAL mode allows multiple concurrent readers but only one writer.
    This pool maintains a small number of read connections to handle concurrent
    GET requests while keeping a single write connection for INSERT/UPDATE/DELETE.
    """

    def __init__(self, db_path: str, pool_size: int = 5):
        """Initialize the pool with the database path and size."""
        self.db_path = db_path
        self.pool_size = pool_size
        self._pool: asyncio.Queue[aiosqlite.Connection] = asyncio.Queue(maxsize=pool_size)
        self._write_conn: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        """Create all connections and initialize the database schema."""
        # Create the write connection first
        self._write_conn = await aiosqlite.connect(self.db_path)
        self._write_conn.row_factory = aiosqlite.Row
        await init_db_schema(self._write_conn)

        # Create pool of read connections
        for _ in range(self.pool_size):
            conn = await aiosqlite.connect(self.db_path)
            conn.row_factory = aiosqlite.Row
            # Read-only connections don't need full init, just PRAGMAs
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute("PRAGMA foreign_keys=ON")
            await self._pool.put(conn)

    async def close(self) -> None:
        """Close all connections in the pool."""
        # Close write connection
        if self._write_conn:
            await self._write_conn.close()
            self._write_conn = None

        # Close all read connections
        while not self._pool.empty():
            conn = await self._pool.get()
            await conn.close()

    async def acquire_read(self) -> aiosqlite.Connection:
        """Acquire a read connection from the pool."""
        return await self._pool.get()

    async def release_read(self, conn: aiosqlite.Connection) -> None:
        """Release a read connection back to the pool."""
        await self._pool.put(conn)

    def get_write_connection(self) -> aiosqlite.Connection:
        """Get the dedicated write connection.

        Use this for INSERT, UPDATE, DELETE operations.
        The write connection ensures proper serialization of writes.
        """
        if not self._write_conn:
            raise RuntimeError("Pool not initialized")
        return self._write_conn


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def init_db_schema(conn: aiosqlite.Connection) -> None:
    """Initialise the database: enable PRAGMAs, create tables and indexes.

    Called once during pool initialization for the write connection.
    The caller is responsible for opening and closing the connection.
    """
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    await conn.executescript(_SCHEMA_SQL)
    await conn.commit()

    # Migration: add reasoning column to existing databases
    try:
        await conn.execute("ALTER TABLE messages ADD COLUMN reasoning TEXT")
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add is_pinned column to existing databases
    try:
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add share_token and shared_at columns to existing databases
    try:
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN share_token TEXT UNIQUE"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN shared_at TEXT"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add result_json column to saved_queries for bookmark results
    try:
        await conn.execute(
            "ALTER TABLE saved_queries ADD COLUMN result_json TEXT"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add file_size_bytes column to datasets
    try:
        await conn.execute(
            "ALTER TABLE datasets ADD COLUMN file_size_bytes INTEGER"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add execution_time_ms column to saved_queries
    try:
        await conn.execute(
            "ALTER TABLE saved_queries ADD COLUMN execution_time_ms REAL"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add column_descriptions column to datasets
    try:
        await conn.execute(
            "ALTER TABLE datasets ADD COLUMN column_descriptions TEXT NOT NULL DEFAULT '{}'"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add input_tokens column to messages
    try:
        await conn.execute(
            "ALTER TABLE messages ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add output_tokens column to messages
    try:
        await conn.execute(
            "ALTER TABLE messages ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add tool_call_trace column to messages
    try:
        await conn.execute(
            "ALTER TABLE messages ADD COLUMN tool_call_trace TEXT"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add is_starred column to query_history
    try:
        await conn.execute(
            "ALTER TABLE query_history ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add folder column to saved_queries
    try:
        await conn.execute(
            "ALTER TABLE saved_queries ADD COLUMN folder TEXT NOT NULL DEFAULT ''"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add is_pinned column to saved_queries
    try:
        await conn.execute(
            "ALTER TABLE saved_queries ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists


# Backward compatibility alias
init_db = init_db_schema


async def get_db(request: Request) -> AsyncIterator[aiosqlite.Connection]:
    """FastAPI dependency that returns a connection from the pool.

    For read operations (GET requests), acquires a connection from the pool.
    For write operations (POST/PATCH/DELETE), returns the dedicated write connection.

    The pool is stored on ``request.app.state.db_pool`` by the lifespan handler.
    """
    pool: DatabasePool = request.app.state.db_pool

    # For write operations, use the dedicated write connection
    if request.method in ("POST", "PATCH", "DELETE", "PUT"):
        yield pool.get_write_connection()
    else:
        # For read operations, acquire from pool and release when done
        conn = await pool.acquire_read()
        try:
            yield conn
        finally:
            await pool.release_read(conn)
