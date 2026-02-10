"""Tests for the saved queries CRUD endpoints.

Covers:
- POST /saved-queries              -> save a query (201)
- GET /saved-queries               -> list saved queries (200)
- GET /saved-queries/folders       -> list unique folder names
- PATCH /saved-queries/{id}/folder -> move a query to a different folder
- PATCH /saved-queries/{id}/pin    -> toggle pin status
- POST /saved-queries/{id}/share   -> generate share token
- DELETE /saved-queries/{id}/share -> revoke sharing
- DELETE /saved-queries/{id}       -> delete a saved query (200)
- 404 cases                        -> modify non-existent query
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


async def _ensure_share_token_column(db: aiosqlite.Connection) -> None:
    """Add share_token column to saved_queries if it doesn't exist yet."""
    try:
        await db.execute("ALTER TABLE saved_queries ADD COLUMN share_token TEXT")
        await db.commit()
    except Exception:
        pass  # Column already exists
    try:
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_queries_share_token ON saved_queries(share_token)"
        )
        await db.commit()
    except Exception:
        pass  # Index already exists


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
    await _ensure_share_token_column(conn)
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


# ---------------------------------------------------------------------------
# Helper: create a saved query via the API and return its id
# ---------------------------------------------------------------------------


async def _create_query(
    client: AsyncClient,
    name: str = "Test Query",
    query: str = "SELECT 1",
    folder: str = "",
    result_json: str | None = None,
    execution_time_ms: float | None = None,
) -> str:
    """Create a saved query through the API and return its id."""
    payload: dict = {"name": name, "query": query, "folder": folder}
    if result_json is not None:
        payload["result_json"] = result_json
    if execution_time_ms is not None:
        payload["execution_time_ms"] = execution_time_ms
    resp = await client.post("/saved-queries", json=payload)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    return resp.json()["id"]


# =========================================================================
# 1. POST /saved-queries -- create a saved query
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
    async def test_save_query_with_optional_fields(self, authed_client):
        """Saving a query with result_json, execution_time_ms, and folder."""
        result_data = json.dumps({"columns": ["id"], "rows": [[1]]})
        response = await authed_client.post(
            "/saved-queries",
            json={
                "name": "Full Query",
                "query": "SELECT id FROM t",
                "result_json": result_data,
                "execution_time_ms": 15.3,
                "folder": "Reports",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Full Query"
        assert body["result_json"] == result_data
        assert body["execution_time_ms"] == 15.3
        assert body["folder"] == "Reports"
        assert body["is_pinned"] is False
        assert body["share_token"] is None

    @pytest.mark.asyncio
    async def test_save_query_defaults(self, authed_client):
        """Saving with only required fields uses correct defaults."""
        response = await authed_client.post(
            "/saved-queries",
            json={"name": "Minimal", "query": "SELECT 1"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["folder"] == ""
        assert body["is_pinned"] is False
        assert body["result_json"] is None
        assert body["execution_time_ms"] is None

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

    @pytest.mark.asyncio
    async def test_save_query_validation_missing_fields(self, authed_client):
        """Saving a query with missing required fields returns 422."""
        response = await authed_client.post(
            "/saved-queries",
            json={"name": "Test"},
        )
        assert response.status_code == 422


# =========================================================================
# 2. GET /saved-queries -- list saved queries
# =========================================================================


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
        """Listing after saving returns the saved queries in reverse chronological order."""
        await _create_query(authed_client, name="Query 1", query="SELECT 1")
        await _create_query(authed_client, name="Query 2", query="SELECT 2")
        response = await authed_client.get("/saved-queries")
        assert response.status_code == 200
        body = response.json()
        assert len(body["queries"]) == 2
        # Most recent first
        assert body["queries"][0]["name"] == "Query 2"
        assert body["queries"][1]["name"] == "Query 1"

    @pytest.mark.asyncio
    async def test_list_includes_all_fields(self, authed_client):
        """Listed queries include all expected response fields."""
        await _create_query(
            authed_client,
            name="Full Fields",
            query="SELECT 1",
            folder="Reports",
            result_json='{"data": true}',
            execution_time_ms=99.9,
        )
        response = await authed_client.get("/saved-queries")
        q = response.json()["queries"][0]
        assert q["name"] == "Full Fields"
        assert q["query"] == "SELECT 1"
        assert q["folder"] == "Reports"
        assert q["result_json"] == '{"data": true}'
        assert q["execution_time_ms"] == 99.9
        assert q["is_pinned"] is False
        assert "id" in q
        assert "created_at" in q

    @pytest.mark.asyncio
    async def test_list_queries_isolated_per_user(self, fresh_db, test_session):
        """User A cannot see user B's saved queries."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            await _create_query(client_a, name="A's query", query="SELECT 'a'")

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


# =========================================================================
# 3. GET /saved-queries/folders -- list folders
# =========================================================================


class TestListFolders:
    """GET /saved-queries/folders -> list unique folder names."""

    @pytest.mark.asyncio
    async def test_folders_empty_initially(self, authed_client):
        """With no saved queries, folders list is empty."""
        response = await authed_client.get("/saved-queries/folders")
        assert response.status_code == 200
        body = response.json()
        assert body["folders"] == []

    @pytest.mark.asyncio
    async def test_folders_excludes_empty_folder(self, authed_client):
        """Queries with empty folder string are not listed as folders."""
        await _create_query(authed_client, name="No Folder", folder="")
        response = await authed_client.get("/saved-queries/folders")
        assert response.json()["folders"] == []

    @pytest.mark.asyncio
    async def test_folders_returns_distinct_names(self, authed_client):
        """Multiple queries in the same folder produce only one entry."""
        await _create_query(authed_client, name="Q1", folder="Reports")
        await _create_query(authed_client, name="Q2", folder="Reports")
        await _create_query(authed_client, name="Q3", folder="Dashboards")
        response = await authed_client.get("/saved-queries/folders")
        folders = response.json()["folders"]
        assert len(folders) == 2
        assert "Reports" in folders
        assert "Dashboards" in folders

    @pytest.mark.asyncio
    async def test_folders_sorted_alphabetically(self, authed_client):
        """Folders are returned in alphabetical order."""
        await _create_query(authed_client, name="Q1", folder="Zebra")
        await _create_query(authed_client, name="Q2", folder="Alpha")
        await _create_query(authed_client, name="Q3", folder="Middle")
        response = await authed_client.get("/saved-queries/folders")
        folders = response.json()["folders"]
        assert folders == ["Alpha", "Middle", "Zebra"]

    @pytest.mark.asyncio
    async def test_folders_isolated_per_user(self, fresh_db, test_session):
        """User B cannot see user A's folders."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A creates queries with folders
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            await _create_query(client_a, name="A's Q", folder="Secret Folder")

        # Create user B
        user_b = make_user(id="user-b-folder", google_id="google_b_folder")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-folder")
        await _insert_session(fresh_db, session_b)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.get("/saved-queries/folders")
            assert response.status_code == 200
            assert response.json()["folders"] == []


# =========================================================================
# 4. PATCH /saved-queries/{id}/folder -- move to folder
# =========================================================================


class TestUpdateFolder:
    """PATCH /saved-queries/{id}/folder -> move a query to a different folder."""

    @pytest.mark.asyncio
    async def test_move_to_folder(self, authed_client):
        """Moving a query to a folder updates successfully."""
        query_id = await _create_query(authed_client, name="Q1")
        response = await authed_client.patch(
            f"/saved-queries/{query_id}/folder",
            json={"folder": "My Folder"},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify the folder was updated via list
        list_resp = await authed_client.get("/saved-queries")
        q = list_resp.json()["queries"][0]
        assert q["folder"] == "My Folder"

    @pytest.mark.asyncio
    async def test_move_to_empty_folder(self, authed_client):
        """Moving a query to empty string removes it from any folder."""
        query_id = await _create_query(authed_client, name="Q1", folder="Reports")

        response = await authed_client.patch(
            f"/saved-queries/{query_id}/folder",
            json={"folder": ""},
        )
        assert response.status_code == 200

        list_resp = await authed_client.get("/saved-queries")
        q = list_resp.json()["queries"][0]
        assert q["folder"] == ""

    @pytest.mark.asyncio
    async def test_move_between_folders(self, authed_client):
        """Moving a query from one folder to another updates the folder."""
        query_id = await _create_query(authed_client, name="Q1", folder="OldFolder")

        await authed_client.patch(
            f"/saved-queries/{query_id}/folder",
            json={"folder": "NewFolder"},
        )

        list_resp = await authed_client.get("/saved-queries")
        q = list_resp.json()["queries"][0]
        assert q["folder"] == "NewFolder"

    @pytest.mark.asyncio
    async def test_move_nonexistent_query_returns_404(self, authed_client):
        """Moving a non-existent query returns 404."""
        response = await authed_client.patch(
            "/saved-queries/nonexistent-id/folder",
            json={"folder": "Folder"},
        )
        assert response.status_code == 404
        assert "error" in response.json()

    @pytest.mark.asyncio
    async def test_move_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot move user A's query to a different folder."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A creates a query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            query_id = await _create_query(client_a, name="A's Q")

        # Create user B
        user_b = make_user(id="user-b-mv", google_id="google_b_mv")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-mv")
        await _insert_session(fresh_db, session_b)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.patch(
                f"/saved-queries/{query_id}/folder",
                json={"folder": "Stolen"},
            )
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_move_folder_reflects_in_folders_list(self, authed_client):
        """After moving a query to a new folder, the folder appears in the folders list."""
        query_id = await _create_query(authed_client, name="Q1")

        await authed_client.patch(
            f"/saved-queries/{query_id}/folder",
            json={"folder": "NewFolder"},
        )

        response = await authed_client.get("/saved-queries/folders")
        assert "NewFolder" in response.json()["folders"]


# =========================================================================
# 5. PATCH /saved-queries/{id}/pin -- toggle pin
# =========================================================================


class TestTogglePin:
    """PATCH /saved-queries/{id}/pin -> toggle pin status."""

    @pytest.mark.asyncio
    async def test_pin_unpinned_query(self, authed_client):
        """Pinning an unpinned query sets is_pinned to true."""
        query_id = await _create_query(authed_client, name="Pin Me")

        response = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == query_id
        assert body["is_pinned"] is True

    @pytest.mark.asyncio
    async def test_unpin_pinned_query(self, authed_client):
        """Toggling a pinned query sets is_pinned to false."""
        query_id = await _create_query(authed_client, name="Unpin Me")

        # Pin it first
        await authed_client.patch(f"/saved-queries/{query_id}/pin")
        # Then unpin it
        response = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert response.status_code == 200
        assert response.json()["is_pinned"] is False

    @pytest.mark.asyncio
    async def test_toggle_twice_returns_to_original(self, authed_client):
        """Toggling pin twice returns to the original unpinned state."""
        query_id = await _create_query(authed_client, name="Toggle Me")

        resp1 = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert resp1.json()["is_pinned"] is True

        resp2 = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        assert resp2.json()["is_pinned"] is False

    @pytest.mark.asyncio
    async def test_pinned_queries_appear_first_in_list(self, authed_client):
        """Pinned queries are listed before unpinned queries."""
        q1_id = await _create_query(authed_client, name="First (unpinned)")
        q2_id = await _create_query(authed_client, name="Second (will be pinned)")

        # Pin the first query (which was created first, so normally appears last)
        await authed_client.patch(f"/saved-queries/{q1_id}/pin")

        list_resp = await authed_client.get("/saved-queries")
        queries = list_resp.json()["queries"]
        assert queries[0]["id"] == q1_id
        assert queries[0]["is_pinned"] is True

    @pytest.mark.asyncio
    async def test_pin_nonexistent_query_returns_404(self, authed_client):
        """Toggling pin on a non-existent query returns 404."""
        response = await authed_client.patch("/saved-queries/nonexistent-id/pin")
        assert response.status_code == 404
        assert "error" in response.json()

    @pytest.mark.asyncio
    async def test_pin_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot pin user A's query (returns 404)."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A creates a query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            query_id = await _create_query(client_a, name="A's Q")

        # Create user B
        user_b = make_user(id="user-b-pin", google_id="google_b_pin")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-pin")
        await _insert_session(fresh_db, session_b)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.patch(f"/saved-queries/{query_id}/pin")
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_pin_response_includes_all_fields(self, authed_client):
        """The pin toggle response includes all SavedQueryResponse fields."""
        query_id = await _create_query(
            authed_client,
            name="Full Pin",
            query="SELECT 42",
            folder="Faves",
        )
        response = await authed_client.patch(f"/saved-queries/{query_id}/pin")
        body = response.json()
        assert body["name"] == "Full Pin"
        assert body["query"] == "SELECT 42"
        assert body["folder"] == "Faves"
        assert body["is_pinned"] is True
        assert "created_at" in body


# =========================================================================
# 6. POST /saved-queries/{id}/share -- generate share token
# =========================================================================


class TestShareQuery:
    """POST /saved-queries/{id}/share -> generate share token."""

    @pytest.mark.asyncio
    async def test_share_returns_url(self, authed_client):
        """Sharing a saved query returns a share URL."""
        query_id = await _create_query(authed_client, name="Sharable")
        response = await authed_client.post(f"/saved-queries/{query_id}/share")
        assert response.status_code == 200
        body = response.json()
        assert "share_url" in body
        assert body["share_url"].startswith("/shared/result/")

    @pytest.mark.asyncio
    async def test_share_is_idempotent(self, authed_client):
        """Sharing the same query twice returns the same share URL."""
        query_id = await _create_query(authed_client, name="Idempotent Share")
        r1 = await authed_client.post(f"/saved-queries/{query_id}/share")
        r2 = await authed_client.post(f"/saved-queries/{query_id}/share")
        assert r1.json()["share_url"] == r2.json()["share_url"]

    @pytest.mark.asyncio
    async def test_share_token_appears_in_list(self, authed_client):
        """After sharing, the share_token field is populated in the list response."""
        query_id = await _create_query(authed_client, name="Shared Q")
        await authed_client.post(f"/saved-queries/{query_id}/share")

        list_resp = await authed_client.get("/saved-queries")
        q = next(q for q in list_resp.json()["queries"] if q["id"] == query_id)
        assert q["share_token"] is not None

    @pytest.mark.asyncio
    async def test_share_nonexistent_query_returns_404(self, authed_client):
        """Sharing a non-existent query returns 404."""
        response = await authed_client.post("/saved-queries/nonexistent-id/share")
        assert response.status_code == 404
        assert "error" in response.json()

    @pytest.mark.asyncio
    async def test_share_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot share user A's query (returns 404)."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A creates a query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            query_id = await _create_query(client_a, name="A's Q")

        # Create user B
        user_b = make_user(id="user-b-share", google_id="google_b_share")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-share")
        await _insert_session(fresh_db, session_b)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.post(f"/saved-queries/{query_id}/share")
            assert response.status_code == 404


# =========================================================================
# 7. DELETE /saved-queries/{id}/share -- revoke sharing
# =========================================================================


class TestUnshareQuery:
    """DELETE /saved-queries/{id}/share -> revoke sharing."""

    @pytest.mark.asyncio
    async def test_unshare_clears_token(self, authed_client):
        """Unsharing a query clears the share_token from the list response."""
        query_id = await _create_query(authed_client, name="Unshare Me")
        await authed_client.post(f"/saved-queries/{query_id}/share")

        # Verify share_token is set
        list_resp = await authed_client.get("/saved-queries")
        q = next(q for q in list_resp.json()["queries"] if q["id"] == query_id)
        assert q["share_token"] is not None

        # Unshare
        response = await authed_client.delete(f"/saved-queries/{query_id}/share")
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify share_token is cleared
        list_resp2 = await authed_client.get("/saved-queries")
        q2 = next(q for q in list_resp2.json()["queries"] if q["id"] == query_id)
        assert q2["share_token"] is None

    @pytest.mark.asyncio
    async def test_unshare_nonexistent_query_returns_404(self, authed_client):
        """Unsharing a non-existent query returns 404."""
        response = await authed_client.delete("/saved-queries/nonexistent-id/share")
        assert response.status_code == 404
        assert "error" in response.json()

    @pytest.mark.asyncio
    async def test_unshare_other_users_query_returns_404(self, fresh_db, test_session):
        """User B cannot unshare user A's shared query (returns 404)."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)

        # User A creates and shares a query
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as client_a:
            query_id = await _create_query(client_a, name="A's Shared Q")
            await client_a.post(f"/saved-queries/{query_id}/share")

        # Create user B
        user_b = make_user(id="user-b-unshr", google_id="google_b_unshr")
        await _insert_user(fresh_db, user_b)
        session_b = make_session(user_id="user-b-unshr")
        await _insert_session(fresh_db, session_b)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": session_b["id"]},
        ) as client_b:
            response = await client_b.delete(f"/saved-queries/{query_id}/share")
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_reshare_after_unshare_generates_new_token(self, authed_client):
        """After unsharing and re-sharing, a new token is generated."""
        query_id = await _create_query(authed_client, name="Reshare Me")

        # Share, get token
        r1 = await authed_client.post(f"/saved-queries/{query_id}/share")
        url1 = r1.json()["share_url"]

        # Unshare
        await authed_client.delete(f"/saved-queries/{query_id}/share")

        # Re-share
        r2 = await authed_client.post(f"/saved-queries/{query_id}/share")
        url2 = r2.json()["share_url"]

        # Tokens should differ since the old one was cleared
        assert url1 != url2


# =========================================================================
# 8. DELETE /saved-queries/{id} -- delete query
# =========================================================================


class TestDeleteSavedQuery:
    """DELETE /saved-queries/{id} -> delete a saved query."""

    @pytest.mark.asyncio
    async def test_delete_saved_query(self, authed_client):
        """Deleting a saved query removes it from the list."""
        query_id = await _create_query(authed_client, name="To Delete")

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
            query_id = await _create_query(client_a, name="A's query")

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

    @pytest.mark.asyncio
    async def test_delete_only_removes_target(self, authed_client):
        """Deleting one query does not affect other queries."""
        q1_id = await _create_query(authed_client, name="Keep Me")
        q2_id = await _create_query(authed_client, name="Delete Me")

        await authed_client.delete(f"/saved-queries/{q2_id}")

        list_resp = await authed_client.get("/saved-queries")
        queries = list_resp.json()["queries"]
        assert len(queries) == 1
        assert queries[0]["id"] == q1_id
        assert queries[0]["name"] == "Keep Me"


# =========================================================================
# 9. 404 cases -- try to modify a non-existent query
# =========================================================================


class TestNonexistentQuery404:
    """All mutation endpoints return 404 for non-existent query IDs."""

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, authed_client):
        """DELETE /saved-queries/{id} with bad id returns 404."""
        response = await authed_client.delete("/saved-queries/does-not-exist")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_pin_nonexistent(self, authed_client):
        """PATCH /saved-queries/{id}/pin with bad id returns 404."""
        response = await authed_client.patch("/saved-queries/does-not-exist/pin")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_folder_nonexistent(self, authed_client):
        """PATCH /saved-queries/{id}/folder with bad id returns 404."""
        response = await authed_client.patch(
            "/saved-queries/does-not-exist/folder",
            json={"folder": "Nope"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_share_nonexistent(self, authed_client):
        """POST /saved-queries/{id}/share with bad id returns 404."""
        response = await authed_client.post("/saved-queries/does-not-exist/share")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_unshare_nonexistent(self, authed_client):
        """DELETE /saved-queries/{id}/share with bad id returns 404."""
        response = await authed_client.delete("/saved-queries/does-not-exist/share")
        assert response.status_code == 404


# =========================================================================
# Auth -- unauthenticated requests return 401
# =========================================================================


class TestSavedQueriesAuth:
    """Unauthenticated requests to saved-queries endpoints return 401."""

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, unauthed_client):
        """GET /saved-queries without auth returns 401."""
        response = await unauthed_client.get("/saved-queries")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_save_requires_auth(self, unauthed_client):
        """POST /saved-queries without auth returns 401."""
        response = await unauthed_client.post(
            "/saved-queries",
            json={"name": "Test", "query": "SELECT 1"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_requires_auth(self, unauthed_client):
        """DELETE /saved-queries/{id} without auth returns 401."""
        response = await unauthed_client.delete("/saved-queries/some-id")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_folders_requires_auth(self, unauthed_client):
        """GET /saved-queries/folders without auth returns 401."""
        response = await unauthed_client.get("/saved-queries/folders")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_folder_requires_auth(self, unauthed_client):
        """PATCH /saved-queries/{id}/folder without auth returns 401."""
        response = await unauthed_client.patch(
            "/saved-queries/some-id/folder",
            json={"folder": "Test"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_pin_requires_auth(self, unauthed_client):
        """PATCH /saved-queries/{id}/pin without auth returns 401."""
        response = await unauthed_client.patch("/saved-queries/some-id/pin")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_share_requires_auth(self, unauthed_client):
        """POST /saved-queries/{id}/share without auth returns 401."""
        response = await unauthed_client.post("/saved-queries/some-id/share")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_unshare_requires_auth(self, unauthed_client):
        """DELETE /saved-queries/{id}/share without auth returns 401."""
        response = await unauthed_client.delete("/saved-queries/some-id/share")
        assert response.status_code == 401
