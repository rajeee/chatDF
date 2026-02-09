"""Integration tests for query cache wiring into the run_query endpoint.

Covers:
- Cache miss on first query (cached=False in response)
- Cache hit on second identical query (cached=True in response)
- Cache stats endpoint returns correct counters
- Cache clear endpoint resets the cache
- RunQueryResponse includes the cached boolean field
"""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from unittest.mock import AsyncMock, MagicMock, PropertyMock  # noqa: E402
from uuid import uuid4  # noqa: E402

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.query_cache import QueryCache  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_session, make_user  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_QUERY_RESULT = {
    "rows": [{"id": 1, "value": "hello"}],
    "columns": ["id", "value"],
    "total_rows": 1,
}


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
async def seeded_db(fresh_db):
    """Fresh DB with a user, session, conversation, and ready dataset."""
    user = make_user()
    session = make_session(user_id=user["id"])
    conv_id = str(uuid4())
    now = "2025-01-01T00:00:00"

    await fresh_db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], user["google_id"], user["email"], user["name"],
         user["avatar_url"], user["created_at"], user["last_login_at"]),
    )
    await fresh_db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session["id"], session["user_id"], session["created_at"], session["expires_at"]),
    )
    await fresh_db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, user["id"], "Test Conv", now, now),
    )
    await fresh_db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, loaded_at, file_size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid4()), conv_id, "https://example.com/data.parquet", "test_table",
         100, 2, '[{"name":"id","type":"INTEGER"},{"name":"value","type":"TEXT"}]',
         "ready", now, 1024),
    )
    await fresh_db.commit()

    return {
        "db": fresh_db,
        "user": user,
        "session": session,
        "conv_id": conv_id,
    }


def _make_mock_pool(query_cache: QueryCache | None = None):
    """Build a mock worker pool with a real QueryCache for integration testing."""
    pool = MagicMock()
    cache = query_cache or QueryCache()

    # Expose query_cache property
    type(pool).query_cache = PropertyMock(return_value=cache)

    call_count = 0

    async def mock_run_query(sql, datasets):
        nonlocal call_count
        # Check cache first (mirrors WorkerPool.run_query logic)
        cached = cache.get(sql, datasets)
        if cached is not None:
            return {**cached, "cached": True}
        # Simulate execution
        call_count += 1
        result = dict(SAMPLE_QUERY_RESULT)
        cache.put(sql, datasets, result)
        return result

    pool.run_query = AsyncMock(side_effect=mock_run_query)
    pool._call_count = lambda: call_count
    return pool, cache


@pytest_asyncio.fixture
async def authed_client(seeded_db):
    """httpx.AsyncClient with session cookie and mock worker pool."""
    pool, cache = _make_mock_pool()
    app.state.db = seeded_db["db"]
    app.state.worker_pool = pool

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": seeded_db["session"]["id"]},
    ) as client:
        yield {
            "client": client,
            "conv_id": seeded_db["conv_id"],
            "pool": pool,
            "cache": cache,
        }


# ---------------------------------------------------------------------------
# Tests: cache integration with run_query endpoint
# ---------------------------------------------------------------------------


class TestQueryCacheIntegration:
    """Verify the cache is wired into the query execution path."""

    @pytest.mark.asyncio
    async def test_first_query_is_cache_miss(self, authed_client):
        """First execution of a query should return cached=False."""
        ctx = authed_client
        response = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": "SELECT * FROM test_table"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["cached"] is False
        assert data["columns"] == ["id", "value"]
        assert data["total_rows"] == 1

    @pytest.mark.asyncio
    async def test_second_query_is_cache_hit(self, authed_client):
        """Re-executing the same query should return cached=True."""
        ctx = authed_client
        sql = "SELECT * FROM test_table"

        # First call -- miss
        resp1 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )
        assert resp1.status_code == 200
        assert resp1.json()["cached"] is False

        # Second call -- hit
        resp2 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )
        assert resp2.status_code == 200
        assert resp2.json()["cached"] is True

    @pytest.mark.asyncio
    async def test_different_sql_is_cache_miss(self, authed_client):
        """Different SQL text should not hit the cache."""
        ctx = authed_client

        resp1 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": "SELECT * FROM test_table"},
        )
        assert resp1.json()["cached"] is False

        resp2 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": "SELECT id FROM test_table"},
        )
        assert resp2.json()["cached"] is False

    @pytest.mark.asyncio
    async def test_cached_response_has_all_fields(self, authed_client):
        """Cached responses still contain all expected RunQueryResponse fields."""
        ctx = authed_client
        sql = "SELECT * FROM test_table"

        # Populate cache
        await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )

        # Cached response
        resp = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )
        data = resp.json()
        assert "columns" in data
        assert "rows" in data
        assert "total_rows" in data
        assert "execution_time_ms" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        assert "cached" in data


# ---------------------------------------------------------------------------
# Tests: cache stats endpoint
# ---------------------------------------------------------------------------


class TestCacheStatsEndpoint:
    """Verify GET /health/cache/stats returns correct statistics."""

    @pytest.mark.asyncio
    async def test_stats_returns_200(self, authed_client):
        """Cache stats endpoint returns HTTP 200."""
        ctx = authed_client
        response = await ctx["client"].get("/health/cache/stats")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_stats_initial_values(self, authed_client):
        """Fresh cache should have zero hits, misses, and entries."""
        ctx = authed_client
        response = await ctx["client"].get("/health/cache/stats")
        data = response.json()
        assert "in_memory" in data
        assert "persistent" in data
        mem = data["in_memory"]
        assert mem["size"] == 0
        assert mem["hits"] == 0
        assert mem["misses"] == 0
        assert mem["hit_rate"] == 0.0

    @pytest.mark.asyncio
    async def test_stats_after_queries(self, authed_client):
        """Stats reflect hits and misses after query execution."""
        ctx = authed_client
        sql = "SELECT * FROM test_table"

        # First query -- miss + put (cache.get miss, then cache.put)
        await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )

        # Second query -- hit (cache.get hit)
        await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )

        response = await ctx["client"].get("/health/cache/stats")
        data = response.json()
        mem = data["in_memory"]
        assert mem["hits"] == 1
        assert mem["misses"] == 1
        assert mem["size"] == 1
        assert mem["hit_rate"] == 50.0

    @pytest.mark.asyncio
    async def test_stats_no_auth_required(self, seeded_db):
        """Cache stats endpoint does not require authentication."""
        pool, cache = _make_mock_pool()
        app.state.db = seeded_db["db"]
        app.state.worker_pool = pool

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.get("/health/cache/stats")
            assert response.status_code == 200


# ---------------------------------------------------------------------------
# Tests: cache clear endpoint
# ---------------------------------------------------------------------------


class TestCacheClearEndpoint:
    """Verify POST /health/cache/clear empties the cache."""

    @pytest.mark.asyncio
    async def test_clear_returns_200(self, authed_client):
        """Cache clear endpoint returns HTTP 200 with success message."""
        ctx = authed_client
        response = await ctx["client"].post("/health/cache/clear")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_clear_resets_cache(self, authed_client):
        """Clearing cache removes all entries and makes next query a miss."""
        ctx = authed_client
        sql = "SELECT * FROM test_table"

        # Populate cache
        await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )

        # Verify entry exists
        stats_resp = await ctx["client"].get("/health/cache/stats")
        assert stats_resp.json()["in_memory"]["size"] == 1

        # Clear
        clear_resp = await ctx["client"].post("/health/cache/clear")
        assert clear_resp.json()["success"] is True

        # Verify cache is empty
        stats_resp = await ctx["client"].get("/health/cache/stats")
        assert stats_resp.json()["in_memory"]["size"] == 0

    @pytest.mark.asyncio
    async def test_query_after_clear_is_miss(self, authed_client):
        """After clearing, the same query should be a cache miss again."""
        ctx = authed_client
        sql = "SELECT * FROM test_table"

        # Populate cache
        resp1 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )
        assert resp1.json()["cached"] is False

        # Confirm cache hit
        resp2 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )
        assert resp2.json()["cached"] is True

        # Clear cache
        await ctx["client"].post("/health/cache/clear")

        # Query again -- should be a miss
        resp3 = await ctx["client"].post(
            f"/conversations/{ctx['conv_id']}/query",
            json={"sql": sql},
        )
        assert resp3.json()["cached"] is False

    @pytest.mark.asyncio
    async def test_clear_no_auth_required(self, seeded_db):
        """Cache clear endpoint does not require authentication."""
        pool, cache = _make_mock_pool()
        app.state.db = seeded_db["db"]
        app.state.worker_pool = pool

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post("/health/cache/clear")
            assert response.status_code == 200
