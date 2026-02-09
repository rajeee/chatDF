"""Tests for the saved queries CRUD endpoints.

Covers:
- POST /saved-queries          -> save a query (201)
- GET /saved-queries           -> list saved queries (200)
- DELETE /saved-queries/{id}   -> delete a saved query (200)
- DELETE /saved-queries/{id}   -> 404 for non-existent query
"""

from __future__ import annotations

import os

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


class TestSaveQuery:
    """POST /saved-queries -> save a query."""

    @pytest.mark.asyncio
    async def test_save_query_returns_201(self, authed_client):
        """Saving a query returns 201 with the saved query data."""
        response = await authed_client.post(
            "/saved-queries",
            json={"name": "My Query", "query": "SELECT * FROM users"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "My Query"
        assert body["query"] == "SELECT * FROM users"
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_save_query_validation_empty_name(self, authed_client):
        """Saving a query with empty name returns 422."""
        response = await authed_client.post(
            "/saved-queries",
            json={"name": "", "query": "SELECT 1"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_save_query_validation_empty_query(self, authed_client):
        """Saving a query with empty query returns 422."""
        response = await authed_client.post(
            "/saved-queries",
            json={"name": "Test", "query": ""},
        )
        assert response.status_code == 422


class TestListSavedQueries:
    """GET /saved-queries -> list saved queries."""

    @pytest.mark.asyncio
    async def test_list_empty(self, authed_client):
        """Listing with no saved queries returns empty list."""
        response = await authed_client.get("/saved-queries")
        assert response.status_code == 200
        body = response.json()
        assert body["queries"] == []

    @pytest.mark.asyncio
    async def test_list_after_save(self, authed_client):
        """Listing after saving returns the saved query."""
        await authed_client.post(
            "/saved-queries",
            json={"name": "Query 1", "query": "SELECT 1"},
        )
        await authed_client.post(
            "/saved-queries",
            json={"name": "Query 2", "query": "SELECT 2"},
        )
        response = await authed_client.get("/saved-queries")
        assert response.status_code == 200
        body = response.json()
        assert len(body["queries"]) == 2
        # Most recent first
        assert body["queries"][0]["name"] == "Query 2"
        assert body["queries"][1]["name"] == "Query 1"

    @pytest.mark.asyncio
    async def test_list_queries_isolated_per_user(self, fresh_db, test_session):
        """User A cannot see user B's saved queries."""
        # Save a query as user A
        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            await client_a.post(
                "/saved-queries",
                json={"name": "A's query", "query": "SELECT 'a'"},
            )

        # Create user B
        user_b = make_user(id="user-b", google_id="google_b")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b")
        await _insert_session(fresh_db, session_b)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.get("/saved-queries")
            assert response.status_code == 200
            body = response.json()
            assert len(body["queries"]) == 0


class TestDeleteSavedQuery:
    """DELETE /saved-queries/{id} -> delete a saved query."""

    @pytest.mark.asyncio
    async def test_delete_saved_query(self, authed_client):
        """Deleting a saved query removes it."""
        # Create a query
        create_resp = await authed_client.post(
            "/saved-queries",
            json={"name": "To Delete", "query": "SELECT 1"},
        )
        query_id = create_resp.json()["id"]

        # Delete it
        delete_resp = await authed_client.delete(f"/saved-queries/{query_id}")
        assert delete_resp.status_code == 200
        assert delete_resp.json()["success"] is True

        # Verify it's gone
        list_resp = await authed_client.get("/saved-queries")
        assert len(list_resp.json()["queries"]) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_query_returns_404(self, authed_client):
        """Deleting a non-existent query returns 404."""
        response = await authed_client.delete("/saved-queries/nonexistent-id")
        assert response.status_code == 404
        body = response.json()
        assert "error" in body

    @pytest.mark.asyncio
    async def test_delete_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot delete user A's saved query (returns 404)."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A saves a query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            create_resp = await client_a.post(
                "/saved-queries",
                json={"name": "A's query", "query": "SELECT 'a'"},
            )
            query_id = create_resp.json()["id"]

        # Create user B
        user_b = make_user(id="user-b-del", google_id="google_b_del")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-del")
        await _insert_session(fresh_db, session_b)

        # User B tries to delete user A's query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.delete(f"/saved-queries/{query_id}")
            assert response.status_code == 404


class TestSavedQueriesAuth:
    """Unauthenticated requests to saved-queries endpoints return 401."""

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, fresh_db):
        """GET /saved-queries without auth returns 401."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/saved-queries")
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_save_requires_auth(self, fresh_db):
        """POST /saved-queries without auth returns 401."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/saved-queries",
                json={"name": "Test", "query": "SELECT 1"},
            )
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_requires_auth(self, fresh_db):
        """DELETE /saved-queries/{id} without auth returns 401."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/saved-queries/some-id")
            assert response.status_code == 401
