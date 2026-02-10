"""Tests for settings endpoints.

Covers:
- GET /settings -> returns defaults when no settings exist
- GET /settings -> returns saved settings
- PUT /settings -> creates and updates settings
- PUT /settings -> partial updates
- Both endpoints require authentication
"""

from __future__ import annotations

import os

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_session, make_user  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_user(db: aiosqlite.Connection, user: dict) -> None:
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


async def insert_session(db: aiosqlite.Connection, session: dict) -> None:
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
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as client:
        yield client


@pytest_asyncio.fixture
async def second_user(fresh_db):
    """A second pre-seeded user record inserted into ``fresh_db``."""
    user = make_user(id="second-user", google_id="google_second")
    await insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def second_user_client(fresh_db, second_user):
    """A second authenticated client belonging to a different user."""
    session = make_session(user_id=second_user["id"])
    await insert_session(fresh_db, session)

    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": session["id"]},
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# SETTINGS-EP-1: GET /settings - Returns defaults when no settings exist
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_settings_defaults(authed_client, fresh_db, test_user):
    """GET /settings with no settings row returns defaults (dev_mode=True, selected_model='gemini-2.5-flash')."""
    response = await authed_client.get("/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["dev_mode"] is True
    assert body["selected_model"] == "gemini-2.5-flash"

    # Verify no row was written to the database (GET is read-only)
    cursor = await fresh_db.execute(
        "SELECT COUNT(*) as cnt FROM user_settings WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row["cnt"] == 0


# ---------------------------------------------------------------------------
# SETTINGS-EP-2: GET /settings - Returns saved settings after PUT
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_settings_existing(authed_client, fresh_db):
    """After PUT, GET /settings returns the saved values."""
    # First, create settings via PUT
    await authed_client.put(
        "/settings",
        json={"dev_mode": False, "selected_model": "gemini-2.5-pro"},
    )

    # Now GET should return the saved values
    response = await authed_client.get("/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["dev_mode"] is False
    assert body["selected_model"] == "gemini-2.5-pro"


# ---------------------------------------------------------------------------
# SETTINGS-EP-3: PUT /settings - Full update (both fields)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_put_settings_full_update(authed_client, fresh_db, test_user):
    """PUT /settings with both fields updates both."""
    response = await authed_client.put(
        "/settings",
        json={"dev_mode": False, "selected_model": "gemini-2.5-pro"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["dev_mode"] is False
    assert body["selected_model"] == "gemini-2.5-pro"

    # Verify the database row
    cursor = await fresh_db.execute(
        "SELECT dev_mode, selected_model FROM user_settings WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["dev_mode"] == 0  # False stored as 0
    assert row["selected_model"] == "gemini-2.5-pro"


# ---------------------------------------------------------------------------
# SETTINGS-EP-4: PUT /settings - Partial update (dev_mode only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_put_settings_partial_dev_mode(authed_client, fresh_db, test_user):
    """PUT /settings with only dev_mode updates only that, keeping selected_model default."""
    response = await authed_client.put(
        "/settings",
        json={"dev_mode": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["dev_mode"] is False
    # selected_model should remain the default
    assert body["selected_model"] == "gemini-2.5-flash"

    # Verify the database row
    cursor = await fresh_db.execute(
        "SELECT dev_mode, selected_model FROM user_settings WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["dev_mode"] == 0
    assert row["selected_model"] == "gemini-2.5-flash"


# ---------------------------------------------------------------------------
# SETTINGS-EP-5: PUT /settings - Partial update (selected_model only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_put_settings_partial_model(authed_client, fresh_db, test_user):
    """PUT /settings with only selected_model updates only that, keeping dev_mode default."""
    response = await authed_client.put(
        "/settings",
        json={"selected_model": "gemini-2.5-pro"},
    )

    assert response.status_code == 200
    body = response.json()
    # dev_mode should remain the default (True)
    assert body["dev_mode"] is True
    assert body["selected_model"] == "gemini-2.5-pro"

    # Verify the database row
    cursor = await fresh_db.execute(
        "SELECT dev_mode, selected_model FROM user_settings WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["dev_mode"] == 1  # True stored as 1
    assert row["selected_model"] == "gemini-2.5-pro"


# ---------------------------------------------------------------------------
# SETTINGS-EP-6: GET /settings - Requires authentication
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_settings_requires_auth(authed_client):
    """GET /settings without session cookie returns 401."""
    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        response = await unauthed.get("/settings")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# SETTINGS-EP-7: PUT /settings - Requires authentication
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_put_settings_requires_auth(authed_client):
    """PUT /settings without session cookie returns 401."""
    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        response = await unauthed.put(
            "/settings",
            json={"dev_mode": False},
        )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# SETTINGS-EP-8: Settings are isolated between users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_settings_isolated_between_users(
    authed_client, second_user_client, fresh_db, test_user, second_user
):
    """Two users have independent settings -- changing one does not affect the other."""
    # User 1 updates settings
    resp1 = await authed_client.put(
        "/settings",
        json={"dev_mode": False, "selected_model": "gemini-2.5-pro"},
    )
    assert resp1.status_code == 200
    body1 = resp1.json()
    assert body1["dev_mode"] is False
    assert body1["selected_model"] == "gemini-2.5-pro"

    # User 2 updates settings differently
    resp2 = await second_user_client.put(
        "/settings",
        json={"dev_mode": True, "selected_model": "gemini-2.0-flash"},
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["dev_mode"] is True
    assert body2["selected_model"] == "gemini-2.0-flash"

    # Verify user 1's settings are unchanged
    resp1_get = await authed_client.get("/settings")
    assert resp1_get.status_code == 200
    body1_get = resp1_get.json()
    assert body1_get["dev_mode"] is False
    assert body1_get["selected_model"] == "gemini-2.5-pro"

    # Verify user 2's settings are unchanged
    resp2_get = await second_user_client.get("/settings")
    assert resp2_get.status_code == 200
    body2_get = resp2_get.json()
    assert body2_get["dev_mode"] is True
    assert body2_get["selected_model"] == "gemini-2.0-flash"

    # Verify at the database level
    cursor = await fresh_db.execute(
        "SELECT dev_mode, selected_model FROM user_settings WHERE user_id = ?",
        (test_user["id"],),
    )
    row1 = await cursor.fetchone()
    assert row1["dev_mode"] == 0
    assert row1["selected_model"] == "gemini-2.5-pro"

    cursor = await fresh_db.execute(
        "SELECT dev_mode, selected_model FROM user_settings WHERE user_id = ?",
        (second_user["id"],),
    )
    row2 = await cursor.fetchone()
    assert row2["dev_mode"] == 1
    assert row2["selected_model"] == "gemini-2.0-flash"
