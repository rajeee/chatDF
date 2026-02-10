"""Tests for export endpoints (CSV/XLSX), health cache stats, and query execution.

Covers:
- POST /export/xlsx  -> valid data, empty data, special characters, auth required
- POST /export/csv   -> valid data, empty data, special characters, auth required
- GET /health/cache/stats -> returns proper stats structure, handles missing pool
- POST /conversations/{id}/query -> executes SQL via mocked worker pool, errors
"""

from __future__ import annotations

import csv
import io
import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from unittest.mock import AsyncMock, MagicMock  # noqa: E402

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_conversation, make_dataset, make_session, make_user  # noqa: E402


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


async def _insert_conversation(db: aiosqlite.Connection, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def _insert_dataset(db: aiosqlite.Connection, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
async def unauthed_client(fresh_db):
    """Unauthenticated httpx client."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture
async def conversation_with_dataset(fresh_db, test_user):
    """A conversation owned by test_user with one ready dataset."""
    conv = make_conversation(user_id=test_user["id"], title="Test Conv")
    await _insert_conversation(fresh_db, conv)

    ds = make_dataset(
        conversation_id=conv["id"],
        name="sales",
        url="https://example.com/sales.parquet",
        status="ready",
        row_count=50,
        column_count=2,
        schema_json='[{"name": "id", "type": "INTEGER"}, {"name": "amount", "type": "FLOAT"}]',
    )
    await _insert_dataset(fresh_db, ds)

    return conv, ds


# ===========================================================================
# 1. POST /export/xlsx
# ===========================================================================


class TestExportXlsx:
    """POST /export/xlsx endpoint tests."""

    @pytest.mark.asyncio
    async def test_xlsx_valid_data(self, authed_client):
        """Export XLSX with valid columns/rows returns a valid Excel file."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["name", "age", "city"],
                "rows": [
                    ["Alice", 30, "New York"],
                    ["Bob", 25, "London"],
                    ["Charlie", 35, "Tokyo"],
                ],
                "filename": "people-export",
            },
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument" in response.headers["content-type"]
        assert "people-export.xlsx" in response.headers.get("content-disposition", "")
        # Valid xlsx starts with PK zip signature
        assert response.content[:2] == b"PK"
        # Non-empty content
        assert len(response.content) > 100

    @pytest.mark.asyncio
    async def test_xlsx_empty_rows(self, authed_client):
        """Export XLSX with empty rows still succeeds."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["col_a", "col_b"],
                "rows": [],
                "filename": "empty",
            },
        )
        assert response.status_code == 200
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_xlsx_special_characters(self, authed_client):
        """Export XLSX handles special characters in data and filename."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["text", "notes"],
                "rows": [
                    ['He said "hello"', "Line1\nLine2"],
                    ["Comma, here", "Tab\there"],
                    ["Accented: cafe\u0301", "Unicode: \u2603"],
                ],
                "filename": "special chars!@#$%",
            },
        )
        assert response.status_code == 200
        assert response.content[:2] == b"PK"
        # Filename should have special chars stripped (only alnum, -, _, space kept)
        disposition = response.headers.get("content-disposition", "")
        assert "special chars.xlsx" in disposition

    @pytest.mark.asyncio
    async def test_xlsx_requires_auth(self, unauthed_client):
        """Export XLSX requires authentication."""
        response = await unauthed_client.post(
            "/export/xlsx",
            json={"columns": ["a"], "rows": [["1"]]},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_xlsx_sanitizes_dangerous_filename(self, authed_client):
        """Filenames with only special characters fall back to 'export'."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["x"],
                "rows": [["val"]],
                "filename": "!!!@@@###",
            },
        )
        assert response.status_code == 200
        disposition = response.headers.get("content-disposition", "")
        assert "export.xlsx" in disposition


# ===========================================================================
# 2. POST /export/csv
# ===========================================================================


class TestExportCsv:
    """POST /export/csv endpoint tests."""

    @pytest.mark.asyncio
    async def test_csv_valid_data(self, authed_client):
        """Export CSV with valid columns/rows returns a valid CSV file."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["name", "age", "city"],
                "rows": [
                    ["Alice", 30, "New York"],
                    ["Bob", 25, "London"],
                ],
                "filename": "people-csv",
            },
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "people-csv.csv" in response.headers.get("content-disposition", "")

        # Parse the CSV content and verify structure
        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)

        # Header + 2 data rows
        assert len(rows) == 3
        assert rows[0] == ["name", "age", "city"]
        assert rows[1] == ["Alice", "30", "New York"]
        assert rows[2] == ["Bob", "25", "London"]

    @pytest.mark.asyncio
    async def test_csv_empty_rows(self, authed_client):
        """Export CSV with empty rows returns header-only CSV."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["x", "y"],
                "rows": [],
                "filename": "empty-csv",
            },
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        # Only the header row
        assert len(rows) == 1
        assert rows[0] == ["x", "y"]

    @pytest.mark.asyncio
    async def test_csv_special_characters(self, authed_client):
        """Export CSV correctly encodes special characters in cells."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["text", "notes"],
                "rows": [
                    ['He said "hello"', "has,comma"],
                    ["Line1\nLine2", "normal"],
                    ["Accented: cafe\u0301", "Unicode: \u2603"],
                ],
                "filename": "special",
            },
        )
        assert response.status_code == 200

        text = response.content.decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)

        assert len(rows) == 4  # header + 3 data rows
        # Verify the special characters survived round-trip
        assert rows[1][0] == 'He said "hello"'
        assert rows[1][1] == "has,comma"
        assert rows[2][0] == "Line1\nLine2"
        assert "cafe\u0301" in rows[3][0]
        assert "\u2603" in rows[3][1]

    @pytest.mark.asyncio
    async def test_csv_requires_auth(self, unauthed_client):
        """Export CSV requires authentication."""
        response = await unauthed_client.post(
            "/export/csv",
            json={"columns": ["a"], "rows": [["1"]]},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_csv_sanitizes_filename(self, authed_client):
        """Filenames with only special characters fall back to 'export'."""
        response = await authed_client.post(
            "/export/csv",
            json={
                "columns": ["x"],
                "rows": [["v"]],
                "filename": "###$$$",
            },
        )
        assert response.status_code == 200
        disposition = response.headers.get("content-disposition", "")
        assert "export.csv" in disposition


# ===========================================================================
# 3. GET /health/cache/stats
# ===========================================================================


class TestHealthCacheStats:
    """GET /health/cache/stats endpoint tests."""

    @pytest.mark.asyncio
    async def test_cache_stats_returns_structure(self, fresh_db):
        """Cache stats returns both in_memory and persistent sections."""
        mock_cache = MagicMock()
        mock_cache.stats = {
            "size": 10,
            "max_size": 100,
            "hits": 50,
            "misses": 20,
        }

        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        mock_pool.db_pool = mock_db_pool

        app.state.db = fresh_db
        app.state.worker_pool = mock_pool

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/cache/stats")

        assert response.status_code == 200
        data = response.json()
        assert "in_memory" in data
        assert "persistent" in data
        assert data["in_memory"]["size"] == 10
        assert data["in_memory"]["max_size"] == 100
        assert data["in_memory"]["hits"] == 50
        assert data["in_memory"]["misses"] == 20

    @pytest.mark.asyncio
    async def test_cache_stats_no_db_pool(self, fresh_db):
        """Cache stats works when db_pool is None (returns default persistent stats)."""
        mock_cache = MagicMock()
        mock_cache.stats = {"size": 0, "max_size": 50, "hits": 0, "misses": 0}

        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        mock_pool.db_pool = None

        app.state.db = fresh_db
        app.state.worker_pool = mock_pool

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/cache/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["persistent"]["size"] == 0
        assert data["persistent"]["oldest_entry"] is None
        assert data["persistent"]["newest_entry"] is None

    @pytest.mark.asyncio
    async def test_cache_stats_no_worker_pool(self, fresh_db):
        """Cache stats returns 503 when worker pool is unavailable."""
        app.state.db = fresh_db
        app.state.worker_pool = None

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/cache/stats")

        assert response.status_code == 503
        data = response.json()
        assert "Worker pool unavailable" in data["error"]

    @pytest.mark.asyncio
    async def test_cache_stats_no_auth_required(self, fresh_db):
        """Cache stats endpoint does not require authentication."""
        mock_cache = MagicMock()
        mock_cache.stats = {"size": 0}

        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        mock_pool.db_pool = None

        app.state.db = fresh_db
        app.state.worker_pool = mock_pool

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # No session cookie set -- should still succeed
            response = await client.get("/health/cache/stats")

        assert response.status_code == 200


# ===========================================================================
# 4. POST /conversations/{id}/query
# ===========================================================================


class TestRunQuery:
    """POST /conversations/{id}/query endpoint tests."""

    @pytest.mark.asyncio
    async def test_successful_query(self, authed_client, fresh_db, conversation_with_dataset):
        """Executing a valid SQL query returns paginated results."""
        conv, ds = conversation_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id", "amount"],
            "rows": [
                {"id": 1, "amount": 100.0},
                {"id": 2, "amount": 200.0},
                {"id": 3, "amount": 300.0},
            ],
            "total_rows": 3,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT id, amount FROM sales"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["columns"] == ["id", "amount"]
        assert len(data["rows"]) == 3
        assert data["total_rows"] == 3
        assert data["page"] == 1
        assert data["page_size"] == 100
        assert data["total_pages"] == 1
        assert isinstance(data["execution_time_ms"], (int, float))
        assert data["execution_time_ms"] >= 0

        # Verify worker pool was called with correct args
        mock_pool.run_query.assert_called_once()
        call_args = mock_pool.run_query.call_args
        assert call_args[0][0] == "SELECT id, amount FROM sales"
        # Should pass the dataset list
        datasets_arg = call_args[0][1]
        assert len(datasets_arg) == 1
        assert datasets_arg[0]["table_name"] == "sales"
        assert datasets_arg[0]["url"] == "https://example.com/sales.parquet"

    @pytest.mark.asyncio
    async def test_query_with_pagination(self, authed_client, fresh_db, conversation_with_dataset):
        """Query with custom page/page_size returns correct pagination."""
        conv, ds = conversation_with_dataset

        # Create 5 result rows
        result_rows = [{"id": i, "amount": i * 10.0} for i in range(1, 6)]
        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id", "amount"],
            "rows": result_rows,
            "total_rows": 5,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT * FROM sales", "page": 2, "page_size": 2},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2
        assert data["page_size"] == 2
        # 5 rows / 2 per page = 3 pages
        assert data["total_pages"] == 3
        # Page 2 with page_size 2 should return rows at index 2-3
        assert len(data["rows"]) == 2
        assert data["rows"][0] == [3, 30.0]
        assert data["rows"][1] == [4, 40.0]

    @pytest.mark.asyncio
    async def test_query_error_from_worker(self, authed_client, fresh_db, conversation_with_dataset):
        """Worker returning an error type results in HTTP 400."""
        conv, ds = conversation_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "error_type": "sql_error",
            "message": "no such table: nonexistent",
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT * FROM nonexistent"},
        )

        assert response.status_code == 400
        data = response.json()
        assert "no such table: nonexistent" in data["error"]

    @pytest.mark.asyncio
    async def test_query_no_datasets(self, authed_client, fresh_db, test_user):
        """Query on a conversation with no datasets returns 400."""
        # Create a conversation with no datasets
        conv = make_conversation(user_id=test_user["id"], title="Empty Conv")
        await _insert_conversation(fresh_db, conv)

        mock_pool = AsyncMock()
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT 1"},
        )

        assert response.status_code == 400
        data = response.json()
        assert "No datasets loaded" in data["error"]

    @pytest.mark.asyncio
    async def test_query_no_worker_pool(self, authed_client, fresh_db, conversation_with_dataset):
        """Query with unavailable worker pool returns 503."""
        conv, ds = conversation_with_dataset
        app.state.worker_pool = None

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT 1"},
        )

        assert response.status_code == 503
        data = response.json()
        assert "Worker pool unavailable" in data["error"]

    @pytest.mark.asyncio
    async def test_query_requires_auth(self, unauthed_client, fresh_db):
        """Query endpoint requires authentication."""
        response = await unauthed_client.post(
            "/conversations/some-id/query",
            json={"sql": "SELECT 1"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_query_conversation_not_found(self, authed_client, fresh_db):
        """Query on a nonexistent conversation returns 404."""
        mock_pool = AsyncMock()
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            "/conversations/nonexistent-id/query",
            json={"sql": "SELECT 1"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_query_cached_result(self, authed_client, fresh_db, conversation_with_dataset):
        """Worker returning cached=True is reflected in the response."""
        conv, ds = conversation_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id"],
            "rows": [{"id": 1}],
            "total_rows": 1,
            "cached": True,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT id FROM sales"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["cached"] is True

    @pytest.mark.asyncio
    async def test_query_limit_applied(self, authed_client, fresh_db, conversation_with_dataset):
        """Worker returning limit_applied=True is reflected in the response."""
        conv, ds = conversation_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id"],
            "rows": [{"id": i} for i in range(10)],
            "total_rows": 10,
            "limit_applied": True,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT id FROM sales"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["limit_applied"] is True

    @pytest.mark.asyncio
    async def test_query_records_history(self, authed_client, fresh_db, conversation_with_dataset):
        """Successful query is recorded in query_history table."""
        conv, ds = conversation_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id"],
            "rows": [{"id": 1}],
            "total_rows": 1,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT id FROM sales"},
        )
        assert response.status_code == 200

        # Verify query was recorded in history
        cursor = await fresh_db.execute(
            "SELECT * FROM query_history WHERE conversation_id = ?",
            (conv["id"],),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row["query"] == "SELECT id FROM sales"
        assert row["status"] == "success"
        assert row["source"] == "sql_panel"
