"""Fixtures for rate-limiting tests.

Provides:
- ``fresh_db``: in-memory SQLite with the full ChatDF schema
- ``test_user``: a pre-seeded user record
- ``seed_token_usage``: helper to insert token_usage records at specific timestamps
- ``user_at_usage``: parameterized fixture for user with specific token usage level

Constant: TOKEN_LIMIT = 5_000_000
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import aiosqlite
import pytest
import pytest_asyncio

from ..factories import make_token_usage, make_user

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOKEN_LIMIT = 5_000_000

# ---------------------------------------------------------------------------
# SQL schema — mirrors spec/backend/database/plan.md exactly
# ---------------------------------------------------------------------------

SCHEMA_SQL = """\
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
# Insert helpers
# ---------------------------------------------------------------------------

async def _insert_user(db: aiosqlite.Connection, user: dict) -> None:
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            user["google_id"],
            user["email"],
            user["name"],
            user["avatar_url"],
            user["created_at"],
            user["last_login_at"],
        ),
    )
    await db.commit()


async def insert_token_usage(db: aiosqlite.Connection, record: dict) -> None:
    """Insert a single token_usage record into the database."""
    await db.execute(
        "INSERT INTO token_usage (id, user_id, conversation_id, model_name, "
        "input_tokens, output_tokens, cost, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            record["id"],
            record["user_id"],
            record["conversation_id"],
            record["model_name"],
            record["input_tokens"],
            record["output_tokens"],
            record["cost"],
            record["timestamp"],
        ),
    )
    await db.commit()


async def seed_token_usage(
    db: aiosqlite.Connection,
    user_id: str,
    records: list[tuple[int, int, float]],
) -> None:
    """Insert token_usage records at specific offsets.

    Each record is ``(input_tokens, output_tokens, hours_ago)``.
    The timestamp is computed as ``now(timezone.utc) - timedelta(hours=hours_ago)``.
    """
    for input_t, output_t, hours_ago in records:
        ts = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours_ago)).isoformat()
        usage = make_token_usage(
            user_id=user_id,
            input_tokens=input_t,
            output_tokens=output_t,
            timestamp=ts,
        )
        await insert_token_usage(db, usage)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database with the full ChatDF schema."""
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA_SQL)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def test_user(fresh_db):
    """A pre-seeded user record inserted into ``fresh_db``."""
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def user_at_usage(fresh_db, test_user, request):
    """Parameterized fixture: creates a user with ``param`` total tokens used in the last 24h.

    Usage: ``@pytest.mark.parametrize("user_at_usage", [1_000_000], indirect=True)``
    """
    total = request.param
    await seed_token_usage(
        fresh_db,
        test_user["id"],
        [(total // 2, total - total // 2, 1)],
    )
    return test_user
