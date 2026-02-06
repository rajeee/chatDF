"""Database connection management and schema initialisation.

Implements: spec/backend/database/plan.md

Provides:
- ``init_db(conn)``: Enable PRAGMAs, create all 7 tables and 7 indexes.
- ``get_db(request)``: FastAPI dependency returning the shared connection.
"""

from __future__ import annotations

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
    created_at        TEXT NOT NULL
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
    loaded_at       TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_keys_used_by ON referral_keys(used_by);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_datasets_conversation_id ON datasets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_timestamp ON token_usage(user_id, timestamp);
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def init_db(conn: aiosqlite.Connection) -> None:
    """Initialise the database: enable PRAGMAs, create tables and indexes.

    Called once during FastAPI lifespan startup, after the connection is opened.
    The caller is responsible for opening and closing the connection.
    """
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    await conn.executescript(_SCHEMA_SQL)
    await conn.commit()


async def get_db(request: Request) -> aiosqlite.Connection:
    """FastAPI dependency that returns the shared database connection.

    The connection is stored on ``request.app.state.db`` by the lifespan
    handler in ``main.py``.
    """
    return request.app.state.db
