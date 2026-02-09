"""Tests for saved query pin/unpin feature.

Covers:
- PATCH /saved-queries/{id}/pin  -> toggle is_pinned between 0 and 1
- GET /saved-queries             -> pinned queries appear first
- PATCH /saved-queries/{id}/pin  -> 404 for non-existent query
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


async def _insert_saved_query(
    db: aiosqlite.Connection,
    user_id: str,
    name: str = "Test Query",
    query: str = "SELECT 1",
    is_pinned: int = 0,
) -> str:
    """Insert a saved query and return its id."""
    query_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    await db.execute(
        "INSERT INTO saved_queries (id, user_id, name, query, is_pinned, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (query_id, user_id, name, query, is_pinned, now),
    )
    await db.commit()
    return query_id


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


class TestTogglePin:
    """PATCH /saved-queries/{id}/pin -> toggle pin status."""

    @pytest.mark.asyncio
    async def test_pin_unpinned_query(self, authed_client, fresh_db, test_user):
        """Pinning an unpinned query sets is_pinned to true."""
        query_id = await _insert_saved_query(fresh_db, test_user["id"])

        response = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == query_id
        assert body["is_pinned"] is True

    @pytest.mark.asyncio
    async def test_unpin_pinned_query(self, authed_client, fresh_db, test_user):
        """Unpinning a pinned query sets is_pinned to false."""
        query_id = await _insert_saved_query(
            fresh_db, test_user["id"], is_pinned=1
        )

        response = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == query_id
        assert body["is_pinned"] is False

    @pytest.mark.asyncio
    async def test_toggle_twice_returns_to_original(self, authed_client, fresh_db, test_user):
        """Toggling pin twice returns to the original state."""
        query_id = await _insert_saved_query(fresh_db, test_user["id"])

        # First toggle: pin it
        resp1 = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert resp1.json()["is_pinned"] is True

        # Second toggle: unpin it
        resp2 = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert resp2.json()["is_pinned"] is False

    @pytest.mark.asyncio
    async def test_toggle_nonexistent_query_returns_404(self, authed_client):
        """Toggling a non-existent query returns 404."""
        response = await authed_client.patch("/saved-queries/nonexistent-id/pin")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_toggle_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot pin user A's query (returns 404)."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A has a query
        user_a_id = test_session["user_id"]
        query_id = await _insert_saved_query(fresh_db, user_a_id)

        # Create user B
        user_b = make_user(id="user-b-pin", google_id="google_b_pin")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-pin")
        await _insert_session(fresh_db, session_b)

        # User B tries to pin user A's query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.patch(f"/saved-queries/{query_id}/pin")
            assert response.status_code == 404


class TestPinnedQueryOrdering:
    """GET /saved-queries -> pinned queries appear first."""

    @pytest.mark.asyncio
    async def test_pinned_queries_appear_first(self, authed_client, fresh_db, test_user):
        """Pinned queries are listed before unpinned queries."""
        # Create unpinned query first (will have earlier created_at)
        unpinned_id = await _insert_saved_query(
            fresh_db, test_user["id"], name="Unpinned Query", is_pinned=0
        )
        # Create pinned query second (will have later created_at)
        pinned_id = await _insert_saved_query(
            fresh_db, test_user["id"], name="Pinned Query", is_pinned=1
        )

        response = await authed_client.get("/saved-queries")
        assert response.status_code == 200
        body = response.json()
        queries = body["queries"]

        assert len(queries) == 2
        # Pinned query should be first regardless of created_at
        assert queries[0]["id"] == pinned_id
        assert queries[0]["is_pinned"] is True
        assert queries[1]["id"] == unpinned_id
        assert queries[1]["is_pinned"] is False

    @pytest.mark.asyncio
    async def test_is_pinned_included_in_list_response(self, authed_client, fresh_db, test_user):
        """The is_pinned field is included in list saved queries responses."""
        await _insert_saved_query(
            fresh_db, test_user["id"], name="Test Query", is_pinned=0
        )

        response = await authed_client.get("/saved-queries")
        assert response.status_code == 200
        body = response.json()
        assert "is_pinned" in body["queries"][0]
        assert body["queries"][0]["is_pinned"] is False

    @pytest.mark.asyncio
    async def test_pin_via_api_then_list(self, authed_client):
        """Create a query via API, pin it, and verify it appears first in listing."""
        # Create two queries
        resp1 = await authed_client.post(
            "/saved-queries",
            json={"name": "First Query", "query": "SELECT 1"},
        )
        resp2 = await authed_client.post(
            "/saved-queries",
            json={"name": "Second Query", "query": "SELECT 2"},
        )
        first_id = resp1.json()["id"]

        # Pin the first query
        pin_resp = await authed_client.patch(f"/saved-queries/{first_id}/pin")
        assert pin_resp.status_code == 200
        assert pin_resp.json()["is_pinned"] is True

        # List queries — pinned should be first
        list_resp = await authed_client.get("/saved-queries")
        queries = list_resp.json()["queries"]
        assert queries[0]["id"] == first_id
        assert queries[0]["is_pinned"] is True
