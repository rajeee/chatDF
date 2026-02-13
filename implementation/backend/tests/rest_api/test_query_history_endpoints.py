"""Tests for query history REST API endpoints.

Covers:
- GET /query-history               -> list query history (with pagination and filters)
- DELETE /query-history            -> clear all query history
- Edge cases: empty history, unauthorized access, pagination bounds

The star/toggle endpoint is tested in tests/test_query_history_star.py.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
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


async def _insert_conversation(db: aiosqlite.Connection, user_id: str) -> str:
    """Insert a conversation and return its id."""
    conv_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, user_id, "Test Conversation", now, now),
    )
    await db.commit()
    return conv_id


async def _insert_query_history(
    db: aiosqlite.Connection,
    user_id: str,
    query: str = "SELECT 1",
    is_starred: int = 0,
    status: str = "success",
    source: str = "sql_panel",
    conversation_id: str | None = None,
    execution_time_ms: float | None = None,
    row_count: int | None = None,
    error_message: str | None = None,
) -> str:
    """Insert a query history entry and return its id."""
    entry_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO query_history "
        "(id, user_id, conversation_id, query, execution_time_ms, row_count, "
        "status, error_message, source, created_at, is_starred) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            entry_id,
            user_id,
            conversation_id,
            query,
            execution_time_ms,
            row_count,
            status,
            error_message,
            source,
            now,
            is_starred,
        ),
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


@pytest_asyncio.fixture
async def unauthenticated_client(fresh_db):
    """Client without any session cookie."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


# =========================================================================
# Tests: GET /query-history (list)
# =========================================================================


class TestListQueryHistory:
    """GET /query-history -> list the current user's query history."""

    @pytest.mark.asyncio
    async def test_empty_history_returns_empty_list(self, authed_client):
        """No query history entries should return an empty list with total=0."""
        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["history"] == []
        assert body["total"] == 0

    @pytest.mark.asyncio
    async def test_list_returns_own_entries(self, authed_client, fresh_db, test_user):
        """User should only see their own query history."""
        await _insert_query_history(fresh_db, test_user["id"], query="SELECT 1")
        await _insert_query_history(fresh_db, test_user["id"], query="SELECT 2")

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert len(body["history"]) == 2

    @pytest.mark.asyncio
    async def test_list_does_not_include_other_users_entries(
        self, authed_client, fresh_db, test_user
    ):
        """User should not see another user's query history."""
        # Create another user and their query history
        other_user = make_user(id="other-user-list", google_id="google_other_list")
        await _insert_user(fresh_db, other_user)
        await _insert_query_history(fresh_db, other_user["id"], query="SELECT secret")

        # Our user has one entry
        await _insert_query_history(fresh_db, test_user["id"], query="SELECT mine")

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["history"][0]["query"] == "SELECT mine"

    @pytest.mark.asyncio
    async def test_list_ordered_by_created_at_desc(
        self, authed_client, fresh_db, test_user
    ):
        """Results should be ordered most recent first."""
        import asyncio

        id1 = await _insert_query_history(
            fresh_db, test_user["id"], query="FIRST"
        )
        # Small delay to ensure different timestamps
        await asyncio.sleep(0.01)
        id2 = await _insert_query_history(
            fresh_db, test_user["id"], query="SECOND"
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 2
        # Most recent first
        assert body["history"][0]["query"] == "SECOND"
        assert body["history"][1]["query"] == "FIRST"

    @pytest.mark.asyncio
    async def test_list_with_limit(self, authed_client, fresh_db, test_user):
        """The limit parameter should cap the number of returned entries."""
        for i in range(5):
            await _insert_query_history(
                fresh_db, test_user["id"], query=f"SELECT {i}"
            )

        response = await authed_client.get("/query-history?limit=2")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 2
        # total should still reflect all entries
        assert body["total"] == 5

    @pytest.mark.asyncio
    async def test_list_with_offset(self, authed_client, fresh_db, test_user):
        """The offset parameter should skip entries."""
        for i in range(5):
            await _insert_query_history(
                fresh_db, test_user["id"], query=f"SELECT {i}"
            )

        response = await authed_client.get("/query-history?limit=2&offset=2")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 2
        assert body["total"] == 5

    @pytest.mark.asyncio
    async def test_list_with_offset_beyond_total(
        self, authed_client, fresh_db, test_user
    ):
        """Offset beyond total should return empty list but correct total."""
        await _insert_query_history(fresh_db, test_user["id"], query="SELECT 1")

        response = await authed_client.get("/query-history?offset=100")
        assert response.status_code == 200
        body = response.json()
        assert body["history"] == []
        assert body["total"] == 1

    @pytest.mark.asyncio
    async def test_list_response_contains_expected_fields(
        self, authed_client, fresh_db, test_user
    ):
        """Each history entry should contain all expected fields."""
        conv_id = await _insert_conversation(fresh_db, test_user["id"])
        await _insert_query_history(
            fresh_db,
            test_user["id"],
            query="SELECT * FROM users",
            conversation_id=conv_id,
            execution_time_ms=42.5,
            row_count=10,
            status="success",
            source="sql_panel",
            is_starred=1,
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 1

        entry = body["history"][0]
        assert "id" in entry
        assert entry["query"] == "SELECT * FROM users"
        assert entry["conversation_id"] == conv_id
        assert entry["execution_time_ms"] == 42.5
        assert entry["row_count"] == 10
        assert entry["status"] == "success"
        assert entry["source"] == "sql_panel"
        assert entry["is_starred"] == 1
        assert "created_at" in entry

    @pytest.mark.asyncio
    async def test_list_with_starred_filter_true(
        self, authed_client, fresh_db, test_user
    ):
        """starred=true should return only starred entries."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="STARRED", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="NOT STARRED", is_starred=0
        )

        response = await authed_client.get("/query-history?starred=true")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["history"][0]["query"] == "STARRED"

    @pytest.mark.asyncio
    async def test_list_with_starred_filter_false(
        self, authed_client, fresh_db, test_user
    ):
        """starred=false should return only unstarred entries."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="STARRED", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="NOT STARRED", is_starred=0
        )

        response = await authed_client.get("/query-history?starred=false")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["history"][0]["query"] == "NOT STARRED"

    @pytest.mark.asyncio
    async def test_list_without_starred_filter_returns_all(
        self, authed_client, fresh_db, test_user
    ):
        """Without starred param, both starred and unstarred entries are returned."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="STARRED", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="NOT STARRED", is_starred=0
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2

    @pytest.mark.asyncio
    async def test_list_with_error_status_entries(
        self, authed_client, fresh_db, test_user
    ):
        """Query history entries with error status should be returned."""
        await _insert_query_history(
            fresh_db,
            test_user["id"],
            query="SELECT * FROM nonexistent",
            status="error",
            error_message="table not found",
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 1
        assert body["history"][0]["status"] == "error"
        assert body["history"][0]["error_message"] == "table not found"

    @pytest.mark.asyncio
    async def test_list_with_different_sources(
        self, authed_client, fresh_db, test_user
    ):
        """Entries from different sources (sql_panel, llm, api) should all be returned."""
        for source in ("sql_panel", "llm", "api"):
            await _insert_query_history(
                fresh_db,
                test_user["id"],
                query=f"SELECT '{source}'",
                source=source,
            )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 3

    @pytest.mark.asyncio
    async def test_list_limit_validation_min(self, authed_client):
        """limit=0 should be rejected (minimum is 1)."""
        response = await authed_client.get("/query-history?limit=0")
        assert response.status_code == 422  # validation error

    @pytest.mark.asyncio
    async def test_list_limit_validation_max(self, authed_client):
        """limit=201 should be rejected (maximum is 200)."""
        response = await authed_client.get("/query-history?limit=201")
        assert response.status_code == 422  # validation error

    @pytest.mark.asyncio
    async def test_list_offset_validation_negative(self, authed_client):
        """Negative offset should be rejected."""
        response = await authed_client.get("/query-history?offset=-1")
        assert response.status_code == 422  # validation error


# =========================================================================
# Tests: DELETE /query-history (clear)
# =========================================================================


class TestClearQueryHistory:
    """DELETE /query-history -> clear all query history for the current user."""

    @pytest.mark.asyncio
    async def test_clear_removes_all_entries(
        self, authed_client, fresh_db, test_user
    ):
        """Clearing query history should remove all entries for the user."""
        for i in range(5):
            await _insert_query_history(
                fresh_db, test_user["id"], query=f"SELECT {i}"
            )

        response = await authed_client.delete("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True

        # Verify entries are gone
        list_response = await authed_client.get("/query-history")
        assert list_response.json()["total"] == 0
        assert list_response.json()["history"] == []

    @pytest.mark.asyncio
    async def test_clear_only_removes_own_entries(
        self, authed_client, fresh_db, test_user
    ):
        """Clearing should only delete the current user's history, not other users'."""
        # Create another user with query history
        other_user = make_user(id="other-user-clear", google_id="google_other_clear")
        await _insert_user(fresh_db, other_user)
        await _insert_query_history(
            fresh_db, other_user["id"], query="SELECT other"
        )

        # Current user has entries
        await _insert_query_history(
            fresh_db, test_user["id"], query="SELECT mine"
        )

        # Clear current user's history
        response = await authed_client.delete("/query-history")
        assert response.status_code == 200

        # Verify other user's entries are still there
        cursor = await fresh_db.execute(
            "SELECT COUNT(*) FROM query_history WHERE user_id = ?",
            (other_user["id"],),
        )
        row = await cursor.fetchone()
        assert row[0] == 1

    @pytest.mark.asyncio
    async def test_clear_empty_history_succeeds(self, authed_client):
        """Clearing when there is no history should succeed (idempotent)."""
        response = await authed_client.delete("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True

    @pytest.mark.asyncio
    async def test_clear_removes_starred_entries_too(
        self, authed_client, fresh_db, test_user
    ):
        """Clearing should also remove starred entries."""
        await _insert_query_history(
            fresh_db, test_user["id"], query="STARRED", is_starred=1
        )
        await _insert_query_history(
            fresh_db, test_user["id"], query="NOT STARRED", is_starred=0
        )

        response = await authed_client.delete("/query-history")
        assert response.status_code == 200

        # Both starred and unstarred should be gone
        list_response = await authed_client.get("/query-history")
        assert list_response.json()["total"] == 0


# =========================================================================
# Tests: Authentication / Authorization edge cases
# =========================================================================


class TestQueryHistoryAuth:
    """Authentication and authorization edge cases for query history endpoints."""

    @pytest.mark.asyncio
    async def test_list_without_auth_returns_401(self, unauthenticated_client):
        """GET /query-history without a session cookie should return 401."""
        response = await unauthenticated_client.get("/query-history")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_clear_without_auth_returns_401(self, unauthenticated_client):
        """DELETE /query-history without a session cookie should return 401."""
        response = await unauthenticated_client.delete("/query-history")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_star_without_auth_returns_401(self, unauthenticated_client):
        """PATCH /query-history/{id}/star without a session cookie should return 401."""
        response = await unauthenticated_client.patch(
            "/query-history/some-id/star"
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_session_token_returns_401(self, fresh_db):
        """An invalid session token should return 401."""
        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": "invalid-token-123"},
        ) as client:
            response = await client.get("/query-history")
            assert response.status_code == 401


# =========================================================================
# Tests: Pagination edge cases
# =========================================================================


class TestQueryHistoryPagination:
    """Pagination behavior for list query history."""

    @pytest.mark.asyncio
    async def test_default_limit_is_50(self, authed_client, fresh_db, test_user):
        """Default limit should be 50 when not specified."""
        # Insert 52 entries (just over the default limit of 50)
        for i in range(52):
            await _insert_query_history(
                fresh_db, test_user["id"], query=f"SELECT {i}"
            )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 50
        assert body["total"] == 52

    @pytest.mark.asyncio
    async def test_max_limit_200(self, authed_client, fresh_db, test_user):
        """limit=200 should be accepted (maximum allowed)."""
        for i in range(3):
            await _insert_query_history(
                fresh_db, test_user["id"], query=f"SELECT {i}"
            )

        response = await authed_client.get("/query-history?limit=200")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 3
        assert body["total"] == 3

    @pytest.mark.asyncio
    async def test_combined_starred_and_pagination(
        self, authed_client, fresh_db, test_user
    ):
        """Starred filter and pagination should work together."""
        for i in range(5):
            await _insert_query_history(
                fresh_db,
                test_user["id"],
                query=f"SELECT starred_{i}",
                is_starred=1,
            )
        for i in range(3):
            await _insert_query_history(
                fresh_db,
                test_user["id"],
                query=f"SELECT unstarred_{i}",
                is_starred=0,
            )

        response = await authed_client.get(
            "/query-history?starred=true&limit=2&offset=0"
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 2
        assert body["total"] == 5  # total of starred entries only

    @pytest.mark.asyncio
    async def test_null_conversation_id_entry(
        self, authed_client, fresh_db, test_user
    ):
        """Entries with NULL conversation_id should be returned normally."""
        await _insert_query_history(
            fresh_db,
            test_user["id"],
            query="SELECT 1",
            conversation_id=None,
        )

        response = await authed_client.get("/query-history")
        assert response.status_code == 200
        body = response.json()
        assert len(body["history"]) == 1
        assert body["history"][0]["conversation_id"] is None
