"""Tests for the health check endpoint."""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from unittest.mock import MagicMock  # noqa: E402

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402


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
async def client(fresh_db):
    """Unauthenticated httpx client for the FastAPI app."""
    app.state.db = fresh_db
    app.state.worker_pool = MagicMock()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    """Tests for GET /health."""

    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        """Health endpoint returns HTTP 200."""
        response = await client.get("/health")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_health_returns_ok_status(self, client):
        """Health endpoint returns status ok when DB and pool are healthy."""
        response = await client.get("/health")
        data = response.json()
        assert data["status"] == "ok"

    @pytest.mark.asyncio
    async def test_health_includes_uptime(self, client):
        """Health endpoint includes uptime_seconds as a number."""
        response = await client.get("/health")
        data = response.json()
        assert "uptime_seconds" in data
        assert isinstance(data["uptime_seconds"], (int, float))
        assert data["uptime_seconds"] >= 0

    @pytest.mark.asyncio
    async def test_health_includes_version(self, client):
        """Health endpoint returns version string."""
        response = await client.get("/health")
        data = response.json()
        assert data["version"] == "1.0.0"

    @pytest.mark.asyncio
    async def test_health_database_ok(self, client):
        """Health endpoint reports database as ok when SELECT 1 succeeds."""
        response = await client.get("/health")
        data = response.json()
        assert data["database"] == "ok"

    @pytest.mark.asyncio
    async def test_health_worker_pool_ok(self, client):
        """Health endpoint reports worker_pool as ok when pool exists."""
        response = await client.get("/health")
        data = response.json()
        assert data["worker_pool"] == "ok"

    @pytest.mark.asyncio
    async def test_health_degraded_when_pool_none(self, fresh_db):
        """Health endpoint returns degraded when worker_pool is None."""
        app.state.db = fresh_db
        app.state.worker_pool = None
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as c:
            response = await c.get("/health")
            data = response.json()
            assert data["status"] == "degraded"
            assert data["worker_pool"] == "error"

    @pytest.mark.asyncio
    async def test_health_no_auth_required(self, fresh_db):
        """Health endpoint does not require authentication (no session cookie)."""
        app.state.db = fresh_db
        app.state.worker_pool = MagicMock()
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as c:
            response = await c.get("/health")
            # Should be 200, not 401
            assert response.status_code == 200
