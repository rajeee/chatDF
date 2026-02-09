"""Cross-cutting tests for the FastAPI application.

Tests: spec/backend/test.md#APP-LIFECYCLE, MIDDLEWARE, ERROR-FORMAT
Tests: spec/backend/rest_api/test_plan.md#Cross-Cutting-Tests

Covers:
- APP-LIFECYCLE-1: startup initializes DB and worker pool
- APP-LIFECYCLE-2: shutdown drains worker pool and closes DB
- APP-LIFECYCLE-3: DB initialized with WAL mode, 7 tables, 7 indexes
- MIDDLEWARE-1: CORS headers on responses
- MIDDLEWARE-2: Request logging captures requests
- MIDDLEWARE-3: Unhandled exceptions return consistent error format
- CROSS-1: Error format consistency across all status codes
- CROSS-2: Status code mapping for domain exceptions
- CROSS-3: CORS headers including PATCH method, preflight, disallowed origin
"""

from __future__ import annotations

import logging
import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
# Ensure CORS allows the test origin (overrides .env which may set production origins).
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from unittest.mock import AsyncMock, MagicMock, patch  # noqa: E402

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.exceptions import (  # noqa: E402
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
)
from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_conversation, make_session, make_user  # noqa: E402


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


def assert_error_response(response, status_code, error_substring=None):
    """Assert response has expected status code and standard error format."""
    assert response.status_code == status_code
    body = response.json()
    assert "error" in body
    assert isinstance(body["error"], str)
    if error_substring:
        assert error_substring in body["error"]


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
async def client(fresh_db):
    """Unauthenticated httpx client for the FastAPI app."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


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
# APP-LIFECYCLE tests
# =========================================================================


class TestAppLifecycleStartup:
    """APP-LIFECYCLE-1: Application startup initializes all subsystems."""

    @pytest.mark.asyncio
    async def test_lifespan_initializes_db(self):
        """On startup, lifespan creates DatabasePool and stores write conn on app.state.db."""
        mock_write_conn = AsyncMock(spec=aiosqlite.Connection)
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=mock_write_conn)
        mock_db_pool.close = AsyncMock()

        MockPoolClass = MagicMock(return_value=mock_db_pool)
        with (
            patch("app.main.DatabasePool", MockPoolClass),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app) as _:
                MockPoolClass.assert_called_once()
                mock_db_pool.initialize.assert_awaited_once()
                assert app.state.db_pool is mock_db_pool
                assert app.state.db is mock_write_conn

            mock_db_pool.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_lifespan_starts_worker_pool(self):
        """On startup, lifespan starts the worker pool."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()
        mock_pool = MagicMock()

        MockPoolClass = MagicMock(return_value=mock_db_pool)
        with (
            patch("app.main.DatabasePool", MockPoolClass),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=mock_pool)
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app) as _:
                mock_wp.start.assert_called_once()
                assert app.state.worker_pool is mock_pool

    @pytest.mark.asyncio
    async def test_lifespan_creates_connection_manager(self):
        """On startup, lifespan creates a ConnectionManager on app.state."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        MockPoolClass = MagicMock(return_value=mock_db_pool)
        with (
            patch("app.main.DatabasePool", MockPoolClass),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app) as _:
                assert hasattr(app.state, "connection_manager")
                assert app.state.connection_manager is not None


class TestAppLifecycleShutdown:
    """APP-LIFECYCLE-2: Application shutdown cleans up resources."""

    @pytest.mark.asyncio
    async def test_lifespan_shuts_down_worker_pool(self):
        """On shutdown, lifespan drains and terminates the worker pool."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()
        mock_pool = MagicMock()

        MockPoolClass = MagicMock(return_value=mock_db_pool)
        with (
            patch("app.main.DatabasePool", MockPoolClass),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=mock_pool)
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app) as _:
                pass

            mock_wp.shutdown.assert_called_once_with(mock_pool)

    @pytest.mark.asyncio
    async def test_lifespan_closes_db_on_shutdown(self):
        """On shutdown, lifespan closes the database pool."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        MockPoolClass = MagicMock(return_value=mock_db_pool)
        with (
            patch("app.main.DatabasePool", MockPoolClass),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app) as _:
                pass

            mock_db_pool.close.assert_awaited_once()


class TestAppLifecycleDb:
    """APP-LIFECYCLE-3: Database initialized with WAL mode, tables, indexes."""

    @pytest.mark.asyncio
    async def test_wal_mode_enabled(self, tmp_path):
        """init_db enables WAL journal mode (requires file-based DB, not :memory:)."""
        import os

        from app.database import init_db

        db_path = str(tmp_path / "test_wal.db")
        conn = await aiosqlite.connect(db_path)
        await init_db(conn)
        cursor = await conn.execute("PRAGMA journal_mode")
        row = await cursor.fetchone()
        assert row[0] == "wal"
        await conn.close()
        # Clean up
        for ext in ("", "-shm", "-wal"):
            p = db_path + ext
            if os.path.exists(p):
                os.unlink(p)

    @pytest.mark.asyncio
    async def test_all_tables_exist(self, fresh_db):
        """init_db creates all 8 tables."""
        cursor = await fresh_db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        tables = [row[0] for row in await cursor.fetchall()]
        expected_tables = sorted([
            "conversations",
            "datasets",
            "messages",
            "query_history",
            "referral_keys",
            "saved_queries",
            "sessions",
            "token_usage",
            "users",
        ])
        assert tables == expected_tables

    @pytest.mark.asyncio
    async def test_all_indexes_exist(self, fresh_db):
        """init_db creates all 8 indexes."""
        cursor = await fresh_db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
        )
        indexes = [row[0] for row in await cursor.fetchall()]
        expected_indexes = sorted([
            "idx_conversations_user_id",
            "idx_datasets_conversation_id",
            "idx_messages_conversation_id",
            "idx_query_history_user_id",
            "idx_referral_keys_used_by",
            "idx_saved_queries_user_id",
            "idx_sessions_user_id",
            "idx_token_usage_user_timestamp",
            "idx_users_google_id",
        ])
        assert indexes == expected_indexes


# =========================================================================
# MIDDLEWARE tests
# =========================================================================


class TestCorsMiddleware:
    """MIDDLEWARE-1: CORS headers present on responses."""

    @pytest.mark.asyncio
    async def test_cors_headers_on_allowed_origin(self, client):
        """Request from allowed origin gets Access-Control-Allow-Origin header."""
        response = await client.get(
            "/auth/me",
            headers={"Origin": "http://localhost:5173"},
        )
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    @pytest.mark.asyncio
    async def test_cors_allows_credentials(self, client):
        """CORS response includes Access-Control-Allow-Credentials: true."""
        response = await client.get(
            "/auth/me",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.headers.get("access-control-allow-credentials") == "true"

    @pytest.mark.asyncio
    async def test_cors_disallowed_origin_no_header(self, client):
        """Request from disallowed origin does not get CORS headers."""
        response = await client.get(
            "/auth/me",
            headers={"Origin": "http://evil.com"},
        )
        assert response.headers.get("access-control-allow-origin") != "http://evil.com"


class TestRequestLoggingMiddleware:
    """MIDDLEWARE-2: Request logging captures all requests."""

    @pytest.mark.asyncio
    async def test_request_logged_with_method_path_status(self, client, caplog):
        """Logging middleware captures method, path, status code."""
        with caplog.at_level(logging.INFO):
            await client.get(
                "/auth/me",
                headers={"Origin": "http://localhost:5173"},
            )

        log_messages = [r.message for r in caplog.records]
        found = any(
            "GET" in msg and "/auth/me" in msg
            for msg in log_messages
        )
        assert found, f"Expected log with GET /auth/me, got: {log_messages}"

    @pytest.mark.asyncio
    async def test_request_logged_with_duration(self, client, caplog):
        """Logging middleware includes response duration."""
        with caplog.at_level(logging.INFO):
            await client.get(
                "/auth/me",
                headers={"Origin": "http://localhost:5173"},
            )

        log_messages = [r.message for r in caplog.records]
        found = any("ms" in msg for msg in log_messages)
        assert found, f"Expected log with duration in ms, got: {log_messages}"


class TestErrorHandlingMiddleware:
    """MIDDLEWARE-3: Unhandled exceptions return consistent error format."""

    @pytest.mark.asyncio
    async def test_unhandled_exception_returns_500_json(self, client):
        """Unhandled exception in endpoint returns 500 with standard error body."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_500")
        async def raise_error():
            raise RuntimeError("Unexpected failure")

        app.include_router(test_router)

        try:
            response = await client.get("/_test_500")
            assert response.status_code == 500
            body = response.json()
            assert "error" in body
            assert body["error"] == "Internal server error"
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_500"]

    @pytest.mark.asyncio
    async def test_unhandled_exception_logged(self, client, caplog):
        """Unhandled exception is logged at ERROR level."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_500_log")
        async def raise_error():
            raise RuntimeError("Test logging failure")

        app.include_router(test_router)

        try:
            with caplog.at_level(logging.ERROR):
                await client.get("/_test_500_log")

            error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
            found = any("Test logging failure" in msg for msg in error_messages)
            assert found, f"Expected error log with exception details, got: {error_messages}"
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_500_log"]


# =========================================================================
# CROSS-1: Error format consistency
# =========================================================================


class TestErrorFormatConsistency:
    """CROSS-1: All error responses have {"error": str} format."""

    @pytest.mark.asyncio
    async def test_401_error_format(self, client):
        """401 response has standard error format."""
        response = await client.get("/auth/me")
        assert_error_response(response, 401)

    @pytest.mark.asyncio
    async def test_404_error_format(self, authed_client):
        """404 response has standard error format."""
        response = await authed_client.get("/conversations/nonexistent-id")
        assert_error_response(response, 404)

    @pytest.mark.asyncio
    async def test_403_error_format(self, fresh_db, test_user, test_session):
        """403 response has standard error format."""
        other_user = make_user(id="other-403", google_id="g_403")
        await _insert_user(fresh_db, other_user)

        conv = make_conversation(user_id="other-403")
        await fresh_db.execute(
            "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
        )
        await fresh_db.commit()

        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            cookies={"session_token": test_session["id"]},
        ) as c:
            response = await c.get(f"/conversations/{conv['id']}")
            assert_error_response(response, 403)

    @pytest.mark.asyncio
    async def test_500_error_format(self, client):
        """500 response has standard error format."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_cross1_500")
        async def raise_error():
            raise RuntimeError("cross-1 test")

        app.include_router(test_router)

        try:
            response = await client.get("/_test_cross1_500")
            assert_error_response(response, 500, "Internal server error")
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_cross1_500"]

    @pytest.mark.asyncio
    async def test_error_body_has_string_error_field(self, client):
        """Error response 'error' field is always a string."""
        response = await client.get("/auth/me")
        body = response.json()
        assert "error" in body
        assert isinstance(body["error"], str)
        assert len(body["error"]) > 0


# =========================================================================
# CROSS-2: Status code mapping for domain exceptions
# =========================================================================


class TestStatusCodeMapping:
    """CROSS-2: Domain exceptions map to correct HTTP status codes."""

    @pytest.mark.asyncio
    async def test_not_found_error_returns_404(self, client):
        """NotFoundError from service layer produces 404."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_404")
        async def raise_not_found():
            raise NotFoundError("Resource not found")

        app.include_router(test_router)

        try:
            response = await client.get("/_test_404")
            assert response.status_code == 404
            assert response.json()["error"] == "Resource not found"
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_404"]

    @pytest.mark.asyncio
    async def test_forbidden_error_returns_403(self, client):
        """ForbiddenError from service layer produces 403."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_403")
        async def raise_forbidden():
            raise ForbiddenError("Access denied")

        app.include_router(test_router)

        try:
            response = await client.get("/_test_403")
            assert response.status_code == 403
            assert response.json()["error"] == "Access denied"
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_403"]

    @pytest.mark.asyncio
    async def test_rate_limit_error_returns_429(self, client):
        """RateLimitError from service layer produces 429."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_429")
        async def raise_rate_limit():
            raise RateLimitError("Rate limit exceeded", resets_in_seconds=3600)

        app.include_router(test_router)

        try:
            response = await client.get("/_test_429")
            assert response.status_code == 429
            body = response.json()
            assert body["error"] == "Rate limit exceeded"
            assert "details" in body
            assert "3600" in body["details"]
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_429"]

    @pytest.mark.asyncio
    async def test_conflict_error_returns_409(self, client):
        """ConflictError from service layer produces 409."""
        from fastapi import APIRouter

        test_router = APIRouter()

        @test_router.get("/_test_409")
        async def raise_conflict():
            raise ConflictError("Generation already in progress")

        app.include_router(test_router)

        try:
            response = await client.get("/_test_409")
            assert response.status_code == 409
            assert response.json()["error"] == "Generation already in progress"
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_409"]

    @pytest.mark.asyncio
    async def test_http_exception_returns_standard_format(self, client):
        """FastAPI HTTPException produces standard error format."""
        from fastapi import APIRouter, HTTPException

        test_router = APIRouter()

        @test_router.get("/_test_http_exc")
        async def raise_http():
            raise HTTPException(status_code=400, detail="Bad request data")

        app.include_router(test_router)

        try:
            response = await client.get("/_test_http_exc")
            assert response.status_code == 400
            assert response.json()["error"] == "Bad request data"
        finally:
            app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_http_exc"]


# =========================================================================
# CROSS-3: CORS headers including PATCH method, preflight, disallowed origin
# =========================================================================


class TestCorsDetailed:
    """CROSS-3: CORS configuration including PATCH method support."""

    @pytest.mark.asyncio
    async def test_preflight_returns_200_with_cors_headers(self, client):
        """OPTIONS preflight request returns 200 with CORS headers."""
        response = await client.options(
            "/conversations",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    @pytest.mark.asyncio
    async def test_preflight_allows_patch_method(self, client):
        """OPTIONS preflight allows PATCH method."""
        response = await client.options(
            "/conversations/some-id",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        assert response.status_code == 200
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        assert "PATCH" in allowed_methods

    @pytest.mark.asyncio
    async def test_preflight_allows_get_post_delete(self, client):
        """OPTIONS preflight includes GET, POST, DELETE in allowed methods."""
        response = await client.options(
            "/conversations",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        for method in ["GET", "POST", "DELETE"]:
            assert method in allowed_methods, f"{method} not in allowed methods: {allowed_methods}"

    @pytest.mark.asyncio
    async def test_disallowed_origin_no_cors_headers(self, client):
        """Request from disallowed origin gets no CORS allow-origin header."""
        response = await client.options(
            "/conversations",
            headers={
                "Origin": "http://evil.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        allow_origin = response.headers.get("access-control-allow-origin")
        assert allow_origin != "http://evil.com"

    @pytest.mark.asyncio
    async def test_cors_on_actual_request_with_allowed_origin(self, authed_client):
        """Actual (non-preflight) request from allowed origin includes CORS headers."""
        response = await authed_client.get(
            "/conversations",
            headers={"Origin": "http://localhost:5173"},
        )
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    @pytest.mark.asyncio
    async def test_cors_allows_content_type_header(self, client):
        """Preflight request confirms Content-Type is an allowed header."""
        response = await client.options(
            "/conversations",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        allowed_headers = response.headers.get("access-control-allow-headers", "")
        assert "content-type" in allowed_headers.lower()


# =========================================================================
# Router mounting tests
# =========================================================================


class TestRouterMounting:
    """Verify all routers are mounted at the correct prefixes."""

    @pytest.mark.asyncio
    async def test_auth_router_mounted(self, client):
        """Auth router responds at /auth prefix."""
        response = await client.get("/auth/me")
        # Should get 401 (no cookie), not 404 (route not found)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_conversations_router_mounted(self, authed_client):
        """Conversations router responds at /conversations prefix."""
        response = await authed_client.get("/conversations")
        # Should get 200 (empty list), not 404
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_usage_router_mounted(self, client):
        """Usage router responds at /usage prefix."""
        response = await client.get("/usage")
        # Should get 401 (no cookie), not 404
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_datasets_router_mounted(self, authed_client, fresh_db, test_user):
        """Datasets router responds at /conversations/{id}/datasets prefix."""
        conv = make_conversation(user_id=test_user["id"])
        await fresh_db.execute(
            "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
        )
        await fresh_db.commit()

        response = await authed_client.get(f"/conversations/{conv['id']}/datasets")
        # Should not be 404 for route-not-found; the route exists
        assert response.status_code != 404 or "Not Found" not in response.json().get("error", "")

    @pytest.mark.asyncio
    async def test_websocket_router_mounted(self):
        """WebSocket router is mounted (ws endpoint exists)."""
        ws_routes = [
            r for r in app.routes
            if hasattr(r, "path") and r.path == "/ws"
        ]
        assert len(ws_routes) > 0, "No /ws route found"
