"""Auth-specific test fixtures.

Provides:
- ``fresh_db``: In-memory SQLite with schema (overrides parent, uses pytest_asyncio).
- ``test_user``: A pre-seeded user record.
- ``valid_referral_key``: An unused referral key inserted into ``fresh_db``.
- ``used_referral_key``: A redeemed referral key inserted into ``fresh_db``.
- ``expired_session``: A session with ``expires_at`` in the past.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import aiosqlite
import pytest_asyncio

from app.database import init_db
from ..factories import make_referral_key, make_session, make_user


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


async def _insert_referral_key(db: aiosqlite.Connection, key: dict) -> None:
    await db.execute(
        "INSERT INTO referral_keys (key, created_by, used_by, created_at, used_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (key["key"], key["created_by"], key["used_by"], key["created_at"], key["used_at"]),
    )
    await db.commit()


async def _insert_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session["id"], session["user_id"], session["created_at"], session["expires_at"]),
    )
    await db.commit()


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
async def valid_referral_key(fresh_db):
    """An unused referral key in the database."""
    key = make_referral_key(used_by=None)
    await _insert_referral_key(fresh_db, key)
    return key


@pytest_asyncio.fixture
async def used_referral_key(fresh_db, test_user):
    """A referral key that has already been redeemed by ``test_user``."""
    key = make_referral_key(
        used_by=test_user["id"],
        used_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    await _insert_referral_key(fresh_db, key)
    return key


@pytest_asyncio.fixture
async def expired_session(fresh_db, test_user):
    """A session whose ``expires_at`` is 1 hour in the past."""
    session = make_session(
        user_id=test_user["id"],
        expires_at=(datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)).isoformat(),
    )
    await _insert_session(fresh_db, session)
    return session
