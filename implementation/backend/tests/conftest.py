"""Shared pytest fixtures for backend tests.

Provides:
- ``fresh_db``: in-memory SQLite with the full 7-table schema
- ``test_user``: a pre-seeded user record
- ``test_session``: a valid session for ``test_user``
- ``authed_client``: httpx.AsyncClient with session cookie set
- ``mock_worker_pool``: AsyncMock standing in for the worker pool
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import aiosqlite
import pytest

from .factories import make_session, make_user

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
    reasoning         TEXT,
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

CREATE TABLE IF NOT EXISTS saved_queries (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    query           TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_keys_used_by ON referral_keys(used_by);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_datasets_conversation_id ON datasets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_timestamp ON token_usage(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_saved_queries_user_id ON saved_queries(user_id);
"""

# ---------------------------------------------------------------------------
# Helper: insert rows via parameterised SQL
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


async def _insert_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            session["id"],
            session["user_id"],
            session["created_at"],
            session["expires_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def fresh_db():
    """In-memory SQLite database with the full ChatDF schema (7 tables, 7 indexes)."""
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA_SQL)
    yield conn
    await conn.close()


@pytest.fixture
async def test_user(fresh_db):
    """A pre-seeded user record inserted into ``fresh_db``."""
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest.fixture
async def test_session(fresh_db, test_user):
    """A valid session for ``test_user``, inserted into ``fresh_db``."""
    session = make_session(user_id=test_user["id"])
    await _insert_session(fresh_db, session)
    return session


@pytest.fixture
async def authed_client(fresh_db, test_session):
    """httpx.AsyncClient pointing at the FastAPI app with a session cookie set.

    The FastAPI ``app.state.db`` is patched to use ``fresh_db`` so that the
    application's ``get_db`` dependency returns the test database.

    NOTE: This fixture requires ``app.main:app`` to be importable.  Until the
    application code is implemented, tests using this fixture will be skipped
    automatically.
    """
    try:
        from app.main import app  # noqa: WPS433 — dynamic import intentional
    except (ImportError, ModuleNotFoundError):
        pytest.skip("app.main not yet implemented")

    from httpx import ASGITransport, AsyncClient

    app.state.db = fresh_db
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as client:
        yield client


@pytest.fixture
def mock_worker_pool():
    """AsyncMock standing in for the worker pool.

    Pre-configured with sensible return values for the three main pool methods.
    """
    pool = AsyncMock()
    pool.validate_url = AsyncMock(return_value={"valid": True})
    pool.get_schema = AsyncMock(
        return_value={
            "columns": [{"name": "id", "type": "INTEGER"}, {"name": "value", "type": "TEXT"}],
            "row_count": 100,
        },
    )
    pool.run_query = AsyncMock(
        return_value={
            "rows": [{"id": 1, "value": "a"}],
            "columns": ["id", "value"],
            "total_rows": 1,
        },
    )
    return pool
