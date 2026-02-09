"""Tests for shareable saved query result endpoints.

Covers:
- POST /saved-queries/{id}/share   -> generate share token (201)
- DELETE /saved-queries/{id}/share  -> revoke sharing (200)
- GET /api/shared/result/{token}    -> view shared result (no auth, 200)
- GET /api/shared/result/{token}    -> 404 for invalid token
- Only owner can share/unshare
"""

from __future__ import annotations

import json
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
    # Migration: add share_token column to saved_queries (not yet in SCHEMA_SQL)
    try:
        await conn.execute(
            "ALTER TABLE saved_queries ADD COLUMN share_token TEXT"
        )
        await conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_queries_share_token ON saved_queries(share_token)"
        )
        await conn.commit()
    except Exception:
        pass  # Index already exists
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


@pytest_asyncio.fixture
async def unauthed_client(fresh_db):
    """Unauthenticated httpx client (no session cookie)."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture
async def saved_query_with_results(authed_client):
    """Create a saved query with result data and return its id."""
    result_data = {
        "columns": ["id", "name"],
        "rows": [[1, "Alice"], [2, "Bob"]],
        "total_rows": 2,
    }
    response = await authed_client.post(
        "/saved-queries",
        json={
            "name": "Test Query",
            "query": "SELECT id, name FROM users",
            "result_json": json.dumps(result_data),
            "execution_time_ms": 42.5,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


# =========================================================================
# Tests
# =========================================================================


class TestShareSavedQuery:
    """POST /saved-queries/{id}/share -> generate share token."""

    @pytest.mark.asyncio
    async def test_share_returns_url(self, authed_client, saved_query_with_results):
        """Sharing a saved query returns a share URL."""
        query_id = saved_query_with_results
        response = await authed_client.post(f"/saved-queries/{query_id}/share")
        assert response.status_code == 200
        body = response.json()
        assert "share_url" in body
        assert body["share_url"].startswith("/shared/result/")

    @pytest.mark.asyncio
    async def test_share_idempotent(self, authed_client, saved_query_with_results):
        """Sharing the same query twice returns the same token."""
        query_id = saved_query_with_results
        r1 = await authed_client.post(f"/saved-queries/{query_id}/share")
        r2 = await authed_client.post(f"/saved-queries/{query_id}/share")
        assert r1.json()["share_url"] == r2.json()["share_url"]

    @pytest.mark.asyncio
    async def test_share_token_in_list(self, authed_client, saved_query_with_results):
        """After sharing, the share_token appears in the list response."""
        query_id = saved_query_with_results
        await authed_client.post(f"/saved-queries/{query_id}/share")
        response = await authed_client.get("/saved-queries")
        queries = response.json()["queries"]
        q = next(q for q in queries if q["id"] == query_id)
        assert q["share_token"] is not None

    @pytest.mark.asyncio
    async def test_share_nonexistent_query_returns_404(self, authed_client):
        """Sharing a non-existent query returns 404."""
        response = await authed_client.post("/saved-queries/nonexistent-id/share")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_share_requires_auth(self, unauthed_client):
        """Sharing without authentication returns 401."""
        response = await unauthed_client.post("/saved-queries/some-id/share")
        assert response.status_code == 401


class TestViewSharedResult:
    """GET /api/shared/result/{token} -> view shared result (no auth)."""

    @pytest.mark.asyncio
    async def test_view_shared_result(self, authed_client, unauthed_client, saved_query_with_results):
        """A shared result is viewable without authentication."""
        query_id = saved_query_with_results
        share_resp = await authed_client.post(f"/saved-queries/{query_id}/share")
        share_url = share_resp.json()["share_url"]
        token = share_url.split("/")[-1]

        # View without auth
        response = await unauthed_client.get(f"/api/shared/result/{token}")
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Test Query"
        assert body["query"] == "SELECT id, name FROM users"
        assert body["result_data"]["columns"] == ["id", "name"]
        assert body["result_data"]["rows"] == [[1, "Alice"], [2, "Bob"]]
        assert body["result_data"]["total_rows"] == 2
        assert body["execution_time_ms"] == 42.5
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_view_invalid_token_returns_404(self, unauthed_client):
        """Viewing with an invalid token returns 404."""
        response = await unauthed_client.get("/api/shared/result/invalid-token-xyz")
        assert response.status_code == 404
        body = response.json()
        assert "error" in body


class TestUnshareSavedQuery:
    """DELETE /saved-queries/{id}/share -> revoke sharing."""

    @pytest.mark.asyncio
    async def test_unshare_revokes_access(self, authed_client, unauthed_client, saved_query_with_results):
        """After unsharing, the shared result returns 404."""
        query_id = saved_query_with_results
        share_resp = await authed_client.post(f"/saved-queries/{query_id}/share")
        share_url = share_resp.json()["share_url"]
        token = share_url.split("/")[-1]

        # Verify it works first
        r1 = await unauthed_client.get(f"/api/shared/result/{token}")
        assert r1.status_code == 200

        # Unshare
        unshr = await authed_client.delete(f"/saved-queries/{query_id}/share")
        assert unshr.status_code == 200
        assert unshr.json()["success"] is True

        # Now it should be 404
        r2 = await unauthed_client.get(f"/api/shared/result/{token}")
        assert r2.status_code == 404

    @pytest.mark.asyncio
    async def test_unshare_clears_token_in_list(self, authed_client, saved_query_with_results):
        """After unsharing, share_token is null in the list response."""
        query_id = saved_query_with_results
        await authed_client.post(f"/saved-queries/{query_id}/share")
        await authed_client.delete(f"/saved-queries/{query_id}/share")

        response = await authed_client.get("/saved-queries")
        queries = response.json()["queries"]
        q = next(q for q in queries if q["id"] == query_id)
        assert q["share_token"] is None

    @pytest.mark.asyncio
    async def test_unshare_nonexistent_query_returns_404(self, authed_client):
        """Unsharing a non-existent query returns 404."""
        response = await authed_client.delete("/saved-queries/nonexistent-id/share")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_unshare_requires_auth(self, unauthed_client):
        """Unsharing without authentication returns 401."""
        response = await unauthed_client.delete("/saved-queries/some-id/share")
        assert response.status_code == 401


class TestShareOwnership:
    """Only the query owner can share/unshare."""

    @pytest.mark.asyncio
    async def test_other_user_cannot_share(self, fresh_db, test_session, saved_query_with_results):
        """User B cannot share user A's saved query."""
        query_id = saved_query_with_results

        # Create user B
        user_b = make_user(id="user-b-share", google_id="google_b_share")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-share")
        await _insert_session(fresh_db, session_b)

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.post(f"/saved-queries/{query_id}/share")
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_other_user_cannot_unshare(self, fresh_db, authed_client, test_session, saved_query_with_results):
        """User B cannot unshare user A's shared saved query."""
        query_id = saved_query_with_results
        await authed_client.post(f"/saved-queries/{query_id}/share")

        # Create user B
        user_b = make_user(id="user-b-unshare", google_id="google_b_unshare")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-unshare")
        await _insert_session(fresh_db, session_b)

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.delete(f"/saved-queries/{query_id}/share")
            assert response.status_code == 404
