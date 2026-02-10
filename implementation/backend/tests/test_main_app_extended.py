"""Extended tests for the FastAPI main application configuration.

Tests NOT covered in test_main_app.py:
- CORS configuration: verify allowed origins, methods, headers from settings
- Exception handler registration: verify custom handlers are registered on app
- Router registration: verify all expected routes exist via app.routes
- Health endpoint: response structure and status logic
- App state initialization: verify app.state attributes after lifespan
- Middleware stack: verify all middleware layers are present and ordered correctly
"""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ["CORS_ORIGINS"] = "http://localhost:5173,http://localhost:3000"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from unittest.mock import AsyncMock, MagicMock, patch  # noqa: E402

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.middleware.sessions import SessionMiddleware  # noqa: E402

from app.exceptions import (  # noqa: E402
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
)
from app.main import (  # noqa: E402
    ErrorHandlingMiddleware,
    RequestLoggingMiddleware,
    app,
)
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
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


# =========================================================================
# 1. CORS Configuration Tests
# =========================================================================


class TestCorsConfiguration:
    """Verify CORS middleware is configured with correct origins, methods, and headers."""

    def test_cors_origins_from_settings(self):
        """CORS allowed origins are a non-empty list of URL strings."""
        # Note: The app singleton is created once at import time, so CORS origins
        # reflect the env at app creation, not necessarily current env vars.
        # We verify that the middleware has valid, non-empty origins.
        cors_mw = None
        for middleware in app.user_middleware:
            if middleware.cls.__name__ == "CORSMiddleware":
                cors_mw = middleware
                break

        assert cors_mw is not None, "CORSMiddleware not found in middleware stack"
        origins = cors_mw.kwargs["allow_origins"]
        assert isinstance(origins, list), f"Expected list, got {type(origins)}"
        assert len(origins) > 0, "Expected at least one allowed origin"
        for origin in origins:
            assert origin.startswith("http"), f"Origin should start with http: {origin}"

    def test_cors_allowed_methods_include_all_required(self):
        """CORS allows GET, POST, PATCH, DELETE, OPTIONS methods."""
        cors_mw = None
        for middleware in app.user_middleware:
            if middleware.cls.__name__ == "CORSMiddleware":
                cors_mw = middleware
                break

        assert cors_mw is not None
        allowed_methods = cors_mw.kwargs["allow_methods"]
        for method in ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]:
            assert method in allowed_methods, f"{method} not in allowed_methods: {allowed_methods}"

    def test_cors_allowed_headers_include_content_type_and_cookie(self):
        """CORS allows Content-Type and Cookie headers."""
        cors_mw = None
        for middleware in app.user_middleware:
            if middleware.cls.__name__ == "CORSMiddleware":
                cors_mw = middleware
                break

        assert cors_mw is not None
        allowed_headers = cors_mw.kwargs["allow_headers"]
        assert "Content-Type" in allowed_headers
        assert "Cookie" in allowed_headers

    def test_cors_credentials_enabled(self):
        """CORS allows credentials (cookies)."""
        cors_mw = None
        for middleware in app.user_middleware:
            if middleware.cls.__name__ == "CORSMiddleware":
                cors_mw = middleware
                break

        assert cors_mw is not None
        assert cors_mw.kwargs["allow_credentials"] is True

    def test_cors_does_not_use_wildcard_origins(self):
        """CORS does NOT use wildcard '*' as an allowed origin (security)."""
        cors_mw = None
        for middleware in app.user_middleware:
            if middleware.cls.__name__ == "CORSMiddleware":
                cors_mw = middleware
                break

        assert cors_mw is not None
        origins = cors_mw.kwargs["allow_origins"]
        assert "*" not in origins, "CORS should not allow wildcard origin"

    @pytest.mark.asyncio
    async def test_preflight_options_method_returns_allowed(self, client):
        """OPTIONS preflight includes OPTIONS in allowed methods."""
        response = await client.options(
            "/conversations",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "OPTIONS",
            },
        )
        allowed = response.headers.get("access-control-allow-methods", "")
        assert "OPTIONS" in allowed

    @pytest.mark.asyncio
    async def test_preflight_delete_method_allowed(self, client):
        """OPTIONS preflight allows DELETE method."""
        response = await client.options(
            "/conversations/some-id",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "DELETE",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        assert response.status_code == 200
        allowed = response.headers.get("access-control-allow-methods", "")
        assert "DELETE" in allowed

    @pytest.mark.asyncio
    async def test_cors_cookie_header_allowed_in_preflight(self, client):
        """Preflight request allows Cookie header."""
        response = await client.options(
            "/auth/me",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Cookie",
            },
        )
        allowed_headers = response.headers.get("access-control-allow-headers", "")
        assert "cookie" in allowed_headers.lower()

    @pytest.mark.asyncio
    async def test_non_listed_origin_gets_no_allow_origin(self, client):
        """Request from an origin not in the allowed list gets no allow-origin header."""
        response = await client.get(
            "/health",
            headers={"Origin": "http://attacker.example.com"},
        )
        allow_origin = response.headers.get("access-control-allow-origin")
        assert allow_origin != "http://attacker.example.com"


# =========================================================================
# 2. Exception Handler Registration Tests
# =========================================================================


class TestExceptionHandlerRegistration:
    """Verify custom exception handlers are registered on the app."""

    def test_not_found_error_handler_registered(self):
        """NotFoundError has a registered exception handler."""
        assert NotFoundError in app.exception_handlers

    def test_forbidden_error_handler_registered(self):
        """ForbiddenError has a registered exception handler."""
        assert ForbiddenError in app.exception_handlers

    def test_rate_limit_error_handler_registered(self):
        """RateLimitError has a registered exception handler."""
        assert RateLimitError in app.exception_handlers

    def test_conflict_error_handler_registered(self):
        """ConflictError has a registered exception handler."""
        assert ConflictError in app.exception_handlers

    def test_http_exception_handler_registered(self):
        """HTTPException has a registered exception handler."""
        from fastapi import HTTPException

        assert HTTPException in app.exception_handlers

    def test_handler_count_is_at_least_five(self):
        """At least 5 custom exception handlers are registered."""
        assert len(app.exception_handlers) >= 5

    @pytest.mark.asyncio
    async def test_not_found_handler_returns_404_json(self, client):
        """NotFoundError handler returns 404 with JSON error body."""
        from fastapi import APIRouter

        router = APIRouter()

        @router.get("/_ext_test_not_found")
        async def raise_nf():
            raise NotFoundError("thing missing")

        app.include_router(router)
        try:
            response = await client.get("/_ext_test_not_found")
            assert response.status_code == 404
            body = response.json()
            assert body["error"] == "thing missing"
        finally:
            app.routes[:] = [
                r for r in app.routes if getattr(r, "path", None) != "/_ext_test_not_found"
            ]

    @pytest.mark.asyncio
    async def test_conflict_handler_returns_409_json(self, client):
        """ConflictError handler returns 409 with JSON error body."""
        from fastapi import APIRouter

        router = APIRouter()

        @router.get("/_ext_test_conflict")
        async def raise_conflict():
            raise ConflictError("already exists")

        app.include_router(router)
        try:
            response = await client.get("/_ext_test_conflict")
            assert response.status_code == 409
            body = response.json()
            assert body["error"] == "already exists"
        finally:
            app.routes[:] = [
                r for r in app.routes if getattr(r, "path", None) != "/_ext_test_conflict"
            ]

    @pytest.mark.asyncio
    async def test_rate_limit_handler_includes_reset_details(self, client):
        """RateLimitError handler returns 429 with resets_in_seconds in details."""
        from fastapi import APIRouter

        router = APIRouter()

        @router.get("/_ext_test_rate_limit")
        async def raise_rl():
            raise RateLimitError("too many", resets_in_seconds=120)

        app.include_router(router)
        try:
            response = await client.get("/_ext_test_rate_limit")
            assert response.status_code == 429
            body = response.json()
            assert body["error"] == "too many"
            assert "120" in body["details"]
        finally:
            app.routes[:] = [
                r for r in app.routes if getattr(r, "path", None) != "/_ext_test_rate_limit"
            ]

    @pytest.mark.asyncio
    async def test_forbidden_handler_returns_403_json(self, client):
        """ForbiddenError handler returns 403 with JSON error body."""
        from fastapi import APIRouter

        router = APIRouter()

        @router.get("/_ext_test_forbidden")
        async def raise_fb():
            raise ForbiddenError("no access")

        app.include_router(router)
        try:
            response = await client.get("/_ext_test_forbidden")
            assert response.status_code == 403
            body = response.json()
            assert body["error"] == "no access"
        finally:
            app.routes[:] = [
                r for r in app.routes if getattr(r, "path", None) != "/_ext_test_forbidden"
            ]

    @pytest.mark.asyncio
    async def test_http_exception_handler_normalizes_detail(self, client):
        """HTTPException handler normalizes response to {"error": detail}."""
        from fastapi import APIRouter, HTTPException

        router = APIRouter()

        @router.get("/_ext_test_http_exc")
        async def raise_http():
            raise HTTPException(status_code=422, detail="Validation failed")

        app.include_router(router)
        try:
            response = await client.get("/_ext_test_http_exc")
            assert response.status_code == 422
            body = response.json()
            assert body["error"] == "Validation failed"
            # Should NOT have 'detail' key - we normalize to 'error'
            assert "detail" not in body
        finally:
            app.routes[:] = [
                r for r in app.routes if getattr(r, "path", None) != "/_ext_test_http_exc"
            ]


# =========================================================================
# 3. Router Registration Tests
# =========================================================================


class TestRouterRegistration:
    """Verify all expected routes exist by inspecting app.routes."""

    def _get_route_paths(self):
        """Extract all path strings from app.routes."""
        paths = set()
        for route in app.routes:
            if hasattr(route, "path"):
                paths.add(route.path)
            # APIRoute objects also have sub-routes on Mount objects
            if hasattr(route, "routes"):
                for sub in route.routes:
                    if hasattr(sub, "path"):
                        paths.add(sub.path)
        return paths

    def test_auth_routes_registered(self):
        """Auth router routes exist under /auth prefix."""
        paths = self._get_route_paths()
        # /auth/me is a known endpoint
        auth_paths = [p for p in paths if p.startswith("/auth")]
        assert len(auth_paths) > 0, f"No /auth routes found. All paths: {sorted(paths)}"

    def test_conversations_routes_registered(self):
        """Conversations router routes exist under /conversations prefix."""
        paths = self._get_route_paths()
        conv_paths = [p for p in paths if p.startswith("/conversations")]
        assert len(conv_paths) > 0, f"No /conversations routes found. All paths: {sorted(paths)}"

    def test_usage_routes_registered(self):
        """Usage router routes exist under /usage prefix."""
        paths = self._get_route_paths()
        usage_paths = [p for p in paths if p.startswith("/usage")]
        assert len(usage_paths) > 0, f"No /usage routes found. All paths: {sorted(paths)}"

    def test_datasets_routes_registered(self):
        """Datasets router routes exist under /conversations/{id}/datasets prefix."""
        paths = self._get_route_paths()
        ds_paths = [p for p in paths if "/datasets" in p]
        assert len(ds_paths) > 0, f"No dataset routes found. All paths: {sorted(paths)}"

    def test_saved_queries_routes_registered(self):
        """Saved queries router routes exist under /saved-queries prefix."""
        paths = self._get_route_paths()
        sq_paths = [p for p in paths if p.startswith("/saved-queries")]
        assert len(sq_paths) > 0, f"No /saved-queries routes found. All paths: {sorted(paths)}"

    def test_query_history_routes_registered(self):
        """Query history router routes exist under /query-history prefix."""
        paths = self._get_route_paths()
        qh_paths = [p for p in paths if p.startswith("/query-history")]
        assert len(qh_paths) > 0, f"No /query-history routes found. All paths: {sorted(paths)}"

    def test_settings_routes_registered(self):
        """Settings router routes exist under /settings prefix."""
        paths = self._get_route_paths()
        settings_paths = [p for p in paths if p.startswith("/settings")]
        assert len(settings_paths) > 0, f"No /settings routes found. All paths: {sorted(paths)}"

    def test_export_routes_registered(self):
        """Export router routes exist under /export prefix."""
        paths = self._get_route_paths()
        export_paths = [p for p in paths if p.startswith("/export")]
        assert len(export_paths) > 0, f"No /export routes found. All paths: {sorted(paths)}"

    def test_shared_routes_registered(self):
        """Shared (public conversation) routes exist under /shared prefix."""
        paths = self._get_route_paths()
        shared_paths = [p for p in paths if p.startswith("/shared")]
        assert len(shared_paths) > 0, f"No /shared routes found. All paths: {sorted(paths)}"

    def test_health_routes_registered(self):
        """Health router routes exist under /health prefix."""
        paths = self._get_route_paths()
        health_paths = [p for p in paths if p.startswith("/health")]
        assert len(health_paths) > 0, f"No /health routes found. All paths: {sorted(paths)}"

    def test_api_routes_registered(self):
        """API routes (shared-results, dataset-search) exist under /api prefix."""
        paths = self._get_route_paths()
        api_paths = [p for p in paths if p.startswith("/api")]
        assert len(api_paths) > 0, f"No /api routes found. All paths: {sorted(paths)}"

    def test_websocket_route_registered(self):
        """WebSocket route /ws is registered."""
        paths = self._get_route_paths()
        assert "/ws" in paths, f"/ws route not found. All paths: {sorted(paths)}"

    def test_total_route_count_reasonable(self):
        """App has a reasonable number of routes (sanity check)."""
        paths = self._get_route_paths()
        # We have 13 routers with multiple endpoints each; should be > 15 routes at minimum
        assert len(paths) >= 15, f"Expected at least 15 routes, got {len(paths)}: {sorted(paths)}"

    def test_health_cache_sub_routes_registered(self):
        """Health cache sub-routes exist: /health/cache/stats, /health/cache/clear, /health/cache/cleanup."""
        paths = self._get_route_paths()
        assert "/health/cache/stats" in paths, f"/health/cache/stats not found in {sorted(paths)}"
        assert "/health/cache/clear" in paths, f"/health/cache/clear not found in {sorted(paths)}"
        assert "/health/cache/cleanup" in paths, f"/health/cache/cleanup not found in {sorted(paths)}"

    def test_no_duplicate_route_paths_for_same_method(self):
        """No two routes share the exact same path and method combination (ignoring test routes)."""
        seen = set()
        duplicates = []
        for route in app.routes:
            if hasattr(route, "path") and hasattr(route, "methods"):
                # Skip any leftover test routes
                if "/_" in getattr(route, "path", ""):
                    continue
                for method in route.methods:
                    key = (route.path, method)
                    if key in seen:
                        duplicates.append(key)
                    seen.add(key)
        assert len(duplicates) == 0, f"Duplicate route+method: {duplicates}"


# =========================================================================
# 4. Health Endpoint Response Tests
# =========================================================================


class TestHealthEndpointResponse:
    """Verify the /health endpoint returns expected response structure."""

    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        """GET /health returns 200 status code."""
        app.state.worker_pool = MagicMock()
        response = await client.get("/health")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_health_response_has_all_keys(self, client):
        """Health response includes status, uptime_seconds, database, worker_pool, version."""
        app.state.worker_pool = MagicMock()
        response = await client.get("/health")
        body = response.json()
        expected_keys = {"status", "uptime_seconds", "database", "worker_pool", "version"}
        assert expected_keys.issubset(body.keys()), f"Missing keys: {expected_keys - body.keys()}"

    @pytest.mark.asyncio
    async def test_health_version_is_string(self, client):
        """Health response version field is a non-empty string."""
        app.state.worker_pool = MagicMock()
        response = await client.get("/health")
        body = response.json()
        assert isinstance(body["version"], str)
        assert len(body["version"]) > 0

    @pytest.mark.asyncio
    async def test_health_status_ok_when_all_healthy(self, client):
        """Health status is 'ok' when both database and worker pool are healthy."""
        app.state.worker_pool = MagicMock()
        response = await client.get("/health")
        body = response.json()
        assert body["status"] == "ok"
        assert body["database"] == "ok"
        assert body["worker_pool"] == "ok"

    @pytest.mark.asyncio
    async def test_health_status_degraded_when_no_worker_pool(self, client):
        """Health status is 'degraded' when worker_pool is None."""
        app.state.worker_pool = None
        response = await client.get("/health")
        body = response.json()
        assert body["status"] == "degraded"
        assert body["worker_pool"] == "error"

    @pytest.mark.asyncio
    async def test_health_status_degraded_when_db_fails(self, client):
        """Health status is 'degraded' when database query fails."""
        app.state.worker_pool = MagicMock()
        mock_db = MagicMock()
        mock_db.execute = AsyncMock(side_effect=RuntimeError("connection lost"))
        app.state.db = mock_db
        response = await client.get("/health")
        body = response.json()
        assert body["status"] == "degraded"
        assert body["database"] == "error"

    @pytest.mark.asyncio
    async def test_health_uptime_is_non_negative_number(self, client):
        """Health uptime_seconds is a non-negative numeric value."""
        app.state.worker_pool = MagicMock()
        response = await client.get("/health")
        body = response.json()
        assert isinstance(body["uptime_seconds"], (int, float))
        assert body["uptime_seconds"] >= 0

    @pytest.mark.asyncio
    async def test_health_no_auth_required(self, client):
        """Health endpoint does not require authentication (no 401)."""
        app.state.worker_pool = MagicMock()
        # Client has no session cookie
        response = await client.get("/health")
        assert response.status_code != 401

    @pytest.mark.asyncio
    async def test_health_response_is_json(self, client):
        """Health endpoint returns application/json content type."""
        app.state.worker_pool = MagicMock()
        response = await client.get("/health")
        assert "application/json" in response.headers.get("content-type", "")


# =========================================================================
# 5. App State Initialization Tests
# =========================================================================


class TestAppStateInitialization:
    """Verify app.state gets expected attributes after lifespan startup."""

    @pytest.mark.asyncio
    async def test_lifespan_sets_db_pool(self):
        """Lifespan stores a DatabasePool on app.state.db_pool."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                assert hasattr(app.state, "db_pool")
                assert app.state.db_pool is mock_db_pool

    @pytest.mark.asyncio
    async def test_lifespan_sets_db_write_connection(self):
        """Lifespan stores the write connection on app.state.db for backward compat."""
        mock_write_conn = AsyncMock()
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=mock_write_conn)
        mock_db_pool.close = AsyncMock()

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                assert hasattr(app.state, "db")
                assert app.state.db is mock_write_conn

    @pytest.mark.asyncio
    async def test_lifespan_sets_connection_manager(self):
        """Lifespan creates a ConnectionManager on app.state.connection_manager."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                assert hasattr(app.state, "connection_manager")
                from app.services.connection_manager import ConnectionManager

                assert isinstance(app.state.connection_manager, ConnectionManager)

    @pytest.mark.asyncio
    async def test_lifespan_sets_worker_pool(self):
        """Lifespan stores the worker pool on app.state.worker_pool."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()
        mock_pool = MagicMock()

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=mock_pool)
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                assert hasattr(app.state, "worker_pool")
                assert app.state.worker_pool is mock_pool

    @pytest.mark.asyncio
    async def test_lifespan_db_pool_initialized_before_yield(self):
        """DatabasePool.initialize() is called before yielding control."""
        call_order = []

        mock_db_pool = AsyncMock()

        async def track_init():
            call_order.append("initialize")

        mock_db_pool.initialize = track_init
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                call_order.append("yielded")

        assert call_order.index("initialize") < call_order.index("yielded")

    @pytest.mark.asyncio
    async def test_lifespan_worker_pool_gets_db_pool(self):
        """Worker pool's set_db_pool is called with the database pool."""
        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()
        mock_pool = MagicMock()

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
        ):
            mock_wp.start = MagicMock(return_value=mock_pool)
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                mock_pool.set_db_pool.assert_called_once_with(mock_db_pool)

    @pytest.mark.asyncio
    async def test_lifespan_starts_periodic_cache_cleanup(self):
        """Lifespan creates a background task for periodic cache cleanup."""
        import asyncio

        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        created_tasks = []
        original_create_task = asyncio.create_task

        def tracking_create_task(coro, **kwargs):
            task = original_create_task(coro, **kwargs)
            created_tasks.append(task)
            return task

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
            patch("app.main.asyncio.create_task", side_effect=tracking_create_task),
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                assert len(created_tasks) == 1, "Expected one background task to be created"

    @pytest.mark.asyncio
    async def test_lifespan_cancels_cleanup_task_on_shutdown(self):
        """Lifespan cancels the periodic cache cleanup task on shutdown."""
        import asyncio

        mock_db_pool = AsyncMock()
        mock_db_pool.initialize = AsyncMock()
        mock_db_pool.get_write_connection = MagicMock(return_value=AsyncMock())
        mock_db_pool.close = AsyncMock()

        created_tasks = []
        original_create_task = asyncio.create_task

        def tracking_create_task(coro, **kwargs):
            task = original_create_task(coro, **kwargs)
            created_tasks.append(task)
            return task

        with (
            patch("app.main.DatabasePool", MagicMock(return_value=mock_db_pool)),
            patch("app.main.worker_pool") as mock_wp,
            patch("app.main.asyncio.create_task", side_effect=tracking_create_task),
        ):
            mock_wp.start = MagicMock(return_value=MagicMock())
            mock_wp.shutdown = MagicMock()

            from app.main import lifespan

            async with lifespan(app):
                pass

            # After shutdown, the cleanup task should have been cancelled
            assert len(created_tasks) == 1
            assert created_tasks[0].cancelled()


# =========================================================================
# 6. Middleware Stack Verification Tests
# =========================================================================


class TestMiddlewareStack:
    """Verify all middleware layers are present and of the correct types."""

    def test_cors_middleware_in_stack(self):
        """CORSMiddleware is present in the middleware stack."""
        middleware_classes = [m.cls.__name__ for m in app.user_middleware]
        assert "CORSMiddleware" in middleware_classes

    def test_session_middleware_in_stack(self):
        """SessionMiddleware is present in the middleware stack."""
        middleware_classes = [m.cls.__name__ for m in app.user_middleware]
        assert "SessionMiddleware" in middleware_classes

    def test_request_logging_middleware_in_stack(self):
        """RequestLoggingMiddleware is present in the middleware stack."""
        middleware_classes = [m.cls for m in app.user_middleware]
        assert RequestLoggingMiddleware in middleware_classes

    def test_error_handling_middleware_in_stack(self):
        """ErrorHandlingMiddleware is present in the middleware stack."""
        middleware_classes = [m.cls for m in app.user_middleware]
        assert ErrorHandlingMiddleware in middleware_classes

    def test_middleware_count_is_four(self):
        """Exactly four middleware layers are registered."""
        assert len(app.user_middleware) == 4, (
            f"Expected 4 middleware, got {len(app.user_middleware)}: "
            f"{[m.cls.__name__ for m in app.user_middleware]}"
        )

    def test_middleware_ordering_cors_outermost(self):
        """CORSMiddleware is the outermost (last in user_middleware list, wraps everything).

        FastAPI's user_middleware list is stored in reverse execution order:
        the last entry wraps everything (outermost), the first entry is innermost.
        In main.py, add_middleware calls go: CORS, Session, Logging, Error.
        So user_middleware = [Error, Logging, Session, CORS] and execution
        order is CORS -> Session -> Logging -> Error -> handler.
        """
        names = [m.cls.__name__ for m in app.user_middleware]
        cors_idx = names.index("CORSMiddleware")
        error_idx = names.index("ErrorHandlingMiddleware")
        # CORS should be after ErrorHandling in the list (outermost wraps last)
        assert cors_idx > error_idx, (
            f"CORSMiddleware (idx {cors_idx}) should be after "
            f"ErrorHandlingMiddleware (idx {error_idx}) in user_middleware. "
            f"Order: {names}"
        )

    def test_middleware_ordering_error_innermost(self):
        """ErrorHandlingMiddleware is the innermost middleware (first in user_middleware list)."""
        names = [m.cls.__name__ for m in app.user_middleware]
        assert names[0] == "ErrorHandlingMiddleware", (
            f"Expected ErrorHandlingMiddleware first, got: {names}"
        )

    def test_middleware_ordering_session_before_cors(self):
        """SessionMiddleware is between CORSMiddleware and RequestLoggingMiddleware."""
        names = [m.cls.__name__ for m in app.user_middleware]
        session_idx = names.index("SessionMiddleware")
        cors_idx = names.index("CORSMiddleware")
        logging_idx = names.index("RequestLoggingMiddleware")
        assert logging_idx < session_idx < cors_idx, (
            f"Expected Logging < Session < CORS ordering. Got: {names}"
        )

    def test_middleware_ordering_logging_before_session(self):
        """RequestLoggingMiddleware comes before SessionMiddleware in the stack."""
        names = [m.cls.__name__ for m in app.user_middleware]
        logging_idx = names.index("RequestLoggingMiddleware")
        session_idx = names.index("SessionMiddleware")
        assert logging_idx < session_idx, (
            f"Expected Logging before Session. Got: {names}"
        )

    def test_session_middleware_has_secret_key(self):
        """SessionMiddleware is configured with a secret_key."""
        session_mw = None
        for m in app.user_middleware:
            if m.cls.__name__ == "SessionMiddleware":
                session_mw = m
                break
        assert session_mw is not None
        assert "secret_key" in session_mw.kwargs

    @pytest.mark.asyncio
    async def test_request_logging_middleware_logs_request(self, client, caplog):
        """RequestLoggingMiddleware logs method, path, and status."""
        import logging

        app.state.worker_pool = MagicMock()
        with caplog.at_level(logging.INFO):
            await client.get("/health")

        log_messages = [r.message for r in caplog.records]
        found = any("GET" in msg and "/health" in msg for msg in log_messages)
        assert found, f"Expected log with 'GET /health', got: {log_messages}"

    @pytest.mark.asyncio
    async def test_error_handling_middleware_catches_unhandled(self, client):
        """ErrorHandlingMiddleware returns 500 JSON for unhandled exceptions."""
        from fastapi import APIRouter

        router = APIRouter()

        @router.get("/_ext_test_mw_500")
        async def crash():
            raise ValueError("middleware test crash")

        app.include_router(router)
        try:
            response = await client.get("/_ext_test_mw_500")
            assert response.status_code == 500
            body = response.json()
            assert body["error"] == "Internal server error"
            assert "middleware test crash" in body.get("details", "")
        finally:
            app.routes[:] = [
                r for r in app.routes if getattr(r, "path", None) != "/_ext_test_mw_500"
            ]

    @pytest.mark.asyncio
    async def test_middleware_chain_processes_in_order(self, client, caplog):
        """Request flows through all middleware layers (CORS -> Session -> Logging -> Error)."""
        import logging

        app.state.worker_pool = MagicMock()
        with caplog.at_level(logging.INFO):
            response = await client.get(
                "/health",
                headers={"Origin": "http://localhost:5173"},
            )

        # CORS processed (origin header present)
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
        # Logging processed (log record exists)
        log_messages = [r.message for r in caplog.records]
        found = any("GET" in msg and "/health" in msg for msg in log_messages)
        assert found
        # Response successful (no error middleware intervention)
        assert response.status_code == 200


# =========================================================================
# 7. App Metadata Tests
# =========================================================================


class TestAppMetadata:
    """Verify FastAPI application metadata configuration."""

    def test_app_title_is_chatdf(self):
        """App title is 'ChatDF'."""
        assert app.title == "ChatDF"

    def test_app_has_lifespan(self):
        """App has a lifespan context manager configured."""
        assert app.router.lifespan_context is not None

    def test_app_has_openapi_url(self):
        """App has the default OpenAPI URL configured."""
        assert app.openapi_url is not None
