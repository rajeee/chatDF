"""Dataset-handling test fixtures.

Provides:
- ``fresh_db``: In-memory SQLite with schema (overrides parent).
- ``test_user``: A pre-seeded user record.
- ``test_conversation``: A conversation belonging to ``test_user``.
- ``mock_worker_pool``: AsyncMock standing in for the worker pool.
- ``conversation_with_datasets``: Parameterised fixture pre-loaded with N datasets.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import aiosqlite
import pytest_asyncio

from app.database import init_db
from ..factories import make_conversation, make_dataset, make_user


# ---------------------------------------------------------------------------
# Helpers
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


async def _insert_conversation(db: aiosqlite.Connection, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def _insert_dataset(db: aiosqlite.Connection, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, error_message, loaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            ds["id"],
            ds["conversation_id"],
            ds["url"],
            ds["name"],
            ds["row_count"],
            ds["column_count"],
            ds["schema_json"],
            ds["status"],
            ds["error_message"],
            ds["loaded_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Sample URLs
# ---------------------------------------------------------------------------

VALID_PARQUET_URL = "https://example.com/data.parquet"
INVALID_FORMAT_URL = "ftp://example.com/data.parquet"
INACCESSIBLE_URL = "https://example.com/nonexistent.parquet"
NON_PARQUET_URL = "https://example.com/data.csv"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database initialised via ``init_db``."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await init_db(conn)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def test_user(fresh_db):
    """A pre-seeded user record inserted into ``fresh_db``."""
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_conversation(fresh_db, test_user):
    """A conversation belonging to ``test_user``."""
    conv = make_conversation(user_id=test_user["id"])
    await _insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
def mock_worker_pool():
    """AsyncMock standing in for the worker pool.

    Pre-configured with sensible return values for validate_url and get_schema.
    """
    pool = AsyncMock()
    pool.validate_url = AsyncMock(return_value={"valid": True})
    pool.get_schema = AsyncMock(
        return_value={
            "columns": [
                {"name": "id", "type": "Int64"},
                {"name": "name", "type": "Utf8"},
            ],
            "row_count": 100,
        },
    )
    return pool


@pytest_asyncio.fixture
async def conversation_with_datasets(fresh_db, test_user, request):
    """Conversation pre-loaded with N datasets (parameterised via request.param)."""
    count = getattr(request, "param", 0)
    conv = make_conversation(user_id=test_user["id"])
    await _insert_conversation(fresh_db, conv)
    datasets = []
    for i in range(count):
        ds = make_dataset(
            conversation_id=conv["id"],
            url=f"https://example.com/data{i}.parquet",
            name=f"table{i + 1}",
            status="ready",
        )
        await _insert_dataset(fresh_db, ds)
        datasets.append(ds)
    return conv, datasets
