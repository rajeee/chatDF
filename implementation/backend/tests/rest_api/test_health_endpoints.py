"""Tests for health router endpoints.

Covers:
- GET /health — system health check
- GET /health/cache/stats — in-memory and persistent cache stats
- POST /health/cache/clear — clear query cache
- POST /health/cache/cleanup — remove expired persistent cache entries

Uses the same httpx + ASGITransport pattern as other REST API tests.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from tests.rest_api.conftest import assert_error_response, assert_success_response


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def unauthed_client(fresh_db):
    """httpx.AsyncClient without a session cookie (health endpoints need no auth)."""
    from app.main import app

    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ===========================================================================
# 1. GET /health — returns 200 with status "ok"
# ===========================================================================


class TestHealthCheck:
    """GET /health endpoint."""

    @pytest.mark.asyncio
    async def test_returns_200_with_status_ok(self, fresh_db, unauthed_client):
        """Health check returns 200 with status 'ok' when everything is healthy."""
        from app.main import app

        # Set up a healthy worker pool
        app.state.worker_pool = MagicMock()

        response = await unauthed_client.get("/health")

        body = assert_success_response(response, 200)
        assert body["status"] == "ok"

    # -----------------------------------------------------------------------
    # 2. health_check includes uptime_seconds, database, worker_pool, version
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_includes_required_fields(self, fresh_db, unauthed_client):
        """Health check response includes all required fields."""
        from app.main import app

        app.state.worker_pool = MagicMock()

        response = await unauthed_client.get("/health")

        body = assert_success_response(response, 200)
        assert "uptime_seconds" in body
        assert isinstance(body["uptime_seconds"], (int, float))
        assert body["uptime_seconds"] >= 0

        assert "database" in body
        assert body["database"] == "ok"

        assert "worker_pool" in body
        assert body["worker_pool"] == "ok"

        assert "version" in body
        assert isinstance(body["version"], str)
        assert body["version"] == "1.0.0"

    # -----------------------------------------------------------------------
    # 6. health_check returns "degraded" when worker_pool is None
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_returns_degraded_when_worker_pool_none(self, fresh_db, unauthed_client):
        """Health check returns 'degraded' status when worker_pool is None."""
        from app.main import app

        app.state.worker_pool = None

        response = await unauthed_client.get("/health")

        body = assert_success_response(response, 200)
        assert body["status"] == "degraded"
        assert body["worker_pool"] == "error"
        # Database should still be "ok"
        assert body["database"] == "ok"

    @pytest.mark.asyncio
    async def test_returns_degraded_when_db_errors(self, fresh_db, unauthed_client):
        """Health check returns 'degraded' when database query fails."""
        from app.main import app

        app.state.worker_pool = MagicMock()

        # Replace db with a mock that raises on execute
        mock_db = MagicMock()
        mock_db.execute = AsyncMock(side_effect=RuntimeError("DB down"))
        app.state.db = mock_db

        response = await unauthed_client.get("/health")

        body = assert_success_response(response, 200)
        assert body["status"] == "degraded"
        assert body["database"] == "error"

    @pytest.mark.asyncio
    async def test_uptime_is_positive(self, fresh_db, unauthed_client):
        """Uptime should be a positive number."""
        from app.main import app

        app.state.worker_pool = MagicMock()

        response = await unauthed_client.get("/health")
        body = response.json()
        assert body["uptime_seconds"] >= 0


# ===========================================================================
# 3. GET /health/cache/stats
# ===========================================================================


class TestCacheStats:
    """GET /health/cache/stats endpoint."""

    @pytest.mark.asyncio
    async def test_returns_200_with_in_memory_and_persistent(self, fresh_db, unauthed_client):
        """Cache stats returns both in_memory and persistent sections."""
        from app.main import app

        mock_cache = MagicMock()
        mock_cache.stats = {"size": 10, "hits": 5, "misses": 3}

        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        mock_pool.db_pool = mock_db_pool
        app.state.worker_pool = mock_pool

        with patch("app.routers.health.persistent_cache") as mock_persistent:
            mock_persistent.stats = AsyncMock(
                return_value={"size": 25, "oldest_entry": "2024-01-01", "newest_entry": "2024-06-15"}
            )

            response = await unauthed_client.get("/health/cache/stats")

        body = assert_success_response(response, 200)
        assert "in_memory" in body
        assert "persistent" in body
        assert body["in_memory"] == {"size": 10, "hits": 5, "misses": 3}
        assert body["persistent"]["size"] == 25

    @pytest.mark.asyncio
    async def test_returns_503_when_worker_pool_none(self, fresh_db, unauthed_client):
        """Cache stats returns 503 when worker pool is unavailable."""
        from app.main import app

        app.state.worker_pool = None

        response = await unauthed_client.get("/health/cache/stats")

        assert_error_response(response, 503, "Worker pool unavailable")

    @pytest.mark.asyncio
    async def test_persistent_defaults_when_db_pool_none(self, fresh_db, unauthed_client):
        """Persistent stats default to zeros when db_pool is None."""
        from app.main import app

        mock_cache = MagicMock()
        mock_cache.stats = {"size": 0}

        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        mock_pool.db_pool = None
        app.state.worker_pool = mock_pool

        response = await unauthed_client.get("/health/cache/stats")

        body = assert_success_response(response, 200)
        assert body["persistent"]["size"] == 0
        assert body["persistent"]["oldest_entry"] is None
        assert body["persistent"]["newest_entry"] is None


# ===========================================================================
# 4. POST /health/cache/clear
# ===========================================================================


class TestCacheClear:
    """POST /health/cache/clear endpoint."""

    @pytest.mark.asyncio
    async def test_returns_200_with_success(self, fresh_db, unauthed_client):
        """Cache clear returns 200 with success=True and a message."""
        from app.main import app

        mock_cache = MagicMock()
        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        app.state.worker_pool = mock_pool

        response = await unauthed_client.post("/health/cache/clear")

        body = assert_success_response(response, 200)
        assert body["success"] is True
        assert "message" in body
        assert isinstance(body["message"], str)

        # Verify cache.clear() was actually called
        mock_cache.clear.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_503_when_worker_pool_none(self, fresh_db, unauthed_client):
        """Cache clear returns 503 when worker pool is unavailable."""
        from app.main import app

        app.state.worker_pool = None

        response = await unauthed_client.post("/health/cache/clear")

        assert_error_response(response, 503, "Worker pool unavailable")


# ===========================================================================
# 5. POST /health/cache/cleanup
# ===========================================================================


class TestCacheCleanup:
    """POST /health/cache/cleanup endpoint."""

    @pytest.mark.asyncio
    async def test_returns_200_with_removed_count(self, fresh_db, unauthed_client):
        """Cache cleanup returns 200 with success=True and removed count."""
        from app.main import app

        mock_write_conn = MagicMock()
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        mock_pool = MagicMock()
        mock_pool.db_pool = mock_db_pool
        app.state.worker_pool = mock_pool

        with patch("app.routers.health.persistent_cache") as mock_persistent:
            mock_persistent.cleanup = AsyncMock(return_value=7)

            response = await unauthed_client.post("/health/cache/cleanup")

        body = assert_success_response(response, 200)
        assert body["success"] is True
        assert body["removed"] == 7

    @pytest.mark.asyncio
    async def test_returns_zero_removed_when_nothing_expired(self, fresh_db, unauthed_client):
        """Cache cleanup returns removed=0 when nothing is expired."""
        from app.main import app

        mock_write_conn = MagicMock()
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        mock_pool = MagicMock()
        mock_pool.db_pool = mock_db_pool
        app.state.worker_pool = mock_pool

        with patch("app.routers.health.persistent_cache") as mock_persistent:
            mock_persistent.cleanup = AsyncMock(return_value=0)

            response = await unauthed_client.post("/health/cache/cleanup")

        body = assert_success_response(response, 200)
        assert body["success"] is True
        assert body["removed"] == 0

    @pytest.mark.asyncio
    async def test_returns_503_when_worker_pool_none(self, fresh_db, unauthed_client):
        """Cache cleanup returns 503 when worker pool is unavailable."""
        from app.main import app

        app.state.worker_pool = None

        response = await unauthed_client.post("/health/cache/cleanup")

        assert_error_response(response, 503, "Worker pool unavailable")

    @pytest.mark.asyncio
    async def test_returns_503_when_db_pool_none(self, fresh_db, unauthed_client):
        """Cache cleanup returns 503 when db_pool is unavailable."""
        from app.main import app

        mock_pool = MagicMock()
        mock_pool.db_pool = None
        app.state.worker_pool = mock_pool

        response = await unauthed_client.post("/health/cache/cleanup")

        assert_error_response(response, 503, "Database pool unavailable")
