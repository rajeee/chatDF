"""Fixtures for REST API endpoint tests.

Extends the shared backend fixtures with HTTP-client-specific helpers.
"""

from __future__ import annotations

import os

# Set required env vars for app.config.Settings before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

# Clear the lru_cache so Settings picks up the test env vars.
from app.config import get_settings  # noqa: E402
get_settings.cache_clear()

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_referral_key, make_session, make_user  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_user(db, user: dict) -> None:
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


async def insert_session(db, session: dict) -> None:
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


async def insert_referral_key(db, key: dict) -> None:
    await db.execute(
        "INSERT INTO referral_keys (key, created_by, used_by, created_at, used_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            key["key"],
            key["created_by"],
            key["used_by"],
            key["created_at"],
            key["used_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Response assertion helpers (per test plan)
# ---------------------------------------------------------------------------

def assert_error_response(response, status_code, error_substring=None):
    assert response.status_code == status_code
    body = response.json()
    assert "error" in body
    if error_substring:
        assert error_substring in body["error"]


def assert_success_response(response, status_code=200):
    assert response.status_code == status_code
    return response.json()


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
    await insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_session(fresh_db, test_user):
    """A valid session for ``test_user``, inserted into ``fresh_db``."""
    session = make_session(user_id=test_user["id"])
    await insert_session(fresh_db, session)
    return session


@pytest_asyncio.fixture
async def authed_client(fresh_db, test_session):
    """httpx.AsyncClient pointing at the FastAPI app with a session cookie set."""
    try:
        from app.main import app
    except (ImportError, ModuleNotFoundError):
        pytest.skip("app.main not yet implemented")

    from httpx import ASGITransport, AsyncClient

    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as client:
        yield client


@pytest_asyncio.fixture
async def other_user_client(fresh_db, test_session):
    """A second authenticated client belonging to a different user."""
    try:
        from app.main import app
    except (ImportError, ModuleNotFoundError):
        pytest.skip("app.main not yet implemented")

    from httpx import ASGITransport, AsyncClient

    other_user = make_user(id="other-user", google_id="google_other")
    await insert_user(fresh_db, other_user)
    other_session = make_session(user_id="other-user")
    await insert_session(fresh_db, other_session)

    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": other_session["id"]},
    ) as client:
        yield client
