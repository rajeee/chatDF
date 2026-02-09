"""Tests for query history star/favorite feature.

Covers:
- PATCH /query-history/{id}/star  -> toggle star status
- GET /query-history?starred=true -> filter by starred
- PATCH /query-history/{id}/star  -> 404 for non-existent query
"""

from __future__ import annotations

import os
from datetime import datetime
from uuid import uuid4

# Set required env vars before any app imports.
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


async def _insert_query_history(
    db: aiosqlite.Connection,
    user_id: str,
    query: str = "SELECT 1",
    is_starred: int = 0,
) -> str:
    """Insert a query history entry and return its id."""
    entry_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    await db.execute(
        "INSERT INTO query_history (id, user_id, query, status, source, created_at, is_starred) "
        "VALUES (?, ?, ?, 'success', 'sql_panel', ?, ?)",
        (entry_id, user_id, query, now, is_starred),
    )
    await db.commit()
    return entry_id


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
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_session(fresh_db, test_user):
    session = make_session(user_id=test_user["id"])
    await _insert_session(fresh_db, session)
    return session


@pytest_asyncio.fixture
async def authed_client(fresh_db, test_session):
    """Authenticated httpx client with session cookie."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as c:
        yield c


# =========================================================================
# Tests
# =========================================================================


class TestToggleStar:
    """PATCH /query-history/{id}/star -> toggle star status."""

    @pytest.mark.asyncio
    async def test_star_unstarred_query(self, authed_client, fresh_db, test_user):
        """Starring an unstarred query sets is_starred to true."""
        entry_id = await _insert_query_history(fresh_db, test_user["id"])

        response = await authed_client.patch(f"/query-history/{entry_id}/star")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == entry_id
        assert body["is_starred"] is True

    @pytest.mark.asyncio
    async def test_unstar_starred_query(self, authed_client, fresh_db, test_user):
        """Unstarring a starred query sets is_starred to false."""
        entry_id = await _insert_query_history(
            fresh_db, test_user["id"], is_starred=1
        )

        response = await authed_client.patch(f"/query-history/{entry_id}/star")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == entry_id
        assert body["is_starred"] is False

    @pytest.mark.asyncio
    async def test_toggle_twice_returns_to_original(self, authed_client, fresh_db, test_user):
        """Toggling star twice returns to the original state."""
        entry_id = await _insert_query_history(fresh_db, test_user["id"])

        # First toggle: star it
        resp1 = await authed_client.patch(f"/query-history/{entry_id}/star")
        assert resp1.json()["is_starred"] is True

        # Second toggle: unstar it
        resp2 = await authed_client.patch(f"/query-history/{entry_id}/star")
        assert resp2.json()["is_starred"] is False

    @pytest.mark.asyncio
    async def test_toggle_nonexistent_query_returns_404(self, authed_client):
        """Toggling a non-existent query returns 404."""
        response = await authed_client.patch("/query-history/nonexistent-id/star")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_toggle_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot star user A's query (returns 404)."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A has a query
        user_a_id = test_session["user_id"]
        entry_id = await _insert_query_history(fresh_db, user_a_id)

        # Create user B
        user_b = make_user(id="user-b-star", google_id="google_b_star")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-star")
        await _insert_session(fresh_db, session_b)

        # User B tries to star user A's query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.patch(f"/query-history/{entry_id}/star")
            assert response.status_code == 404


class TestFilterByStarred:
    """GET /query-history?starred=true -> filter by starred."""

    @pytest.mark.asyncio
    async def test_filter_starred_only(self, authed_client, fresh_db, test_user):
        """Filtering by starred=true returns only starred queries."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 1", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 2", is_starred=0
        )

        response = await authed_client.get("/query-history?starred=true")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert len(body["history"]) == 1
        assert body["history"][0]["query"] == "SELECT 1"
        assert body["history"][0]["is_starred"] == 1

    @pytest.mark.asyncio
    async def test_filter_unstarred_only(self, authed_client, fresh_db, test_user):
        """Filtering by starred=false returns only unstarred queries."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 1", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 2", is_starred=0
        )

        response = await authed_client.get("/query-history?starred=false")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert len(body["history"]) == 1
        assert body["history"][0]["query"] == "SELECT 2"

    @pytest.mark.asyncio
    async def test_no_filter_returns_all(self, authed_client, fresh_db, test_user):
        """Without starred filter, all queries are returned."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 1", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 2", is_starred=0
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert len(body["history"]) == 2

    @pytest.mark.asyncio
    async def test_is_starred_included_in_list_response(self, authed_client, fresh_db, test_user):
        """The is_starred field is included in list query history responses."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT 1", is_starred=0
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert "is_starred" in body["history"][0]
        assert body["history"][0]["is_starred"] == 0
