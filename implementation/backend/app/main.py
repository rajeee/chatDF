"""FastAPI application entry point.

Implements: spec/backend/plan.md#FastAPI-Application-Structure

Application wiring: lifespan, middleware stack, router mounting, exception handlers.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.database import init_db
from app.exceptions import ConflictError, ForbiddenError, NotFoundError, RateLimitError
from app.routers import auth, conversations, datasets, usage
from app.routers.websocket import router as ws_router
from app.services import worker_pool
from app.services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# Implements: spec/backend/plan.md#Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Open the database and start worker pool on startup; clean up on shutdown."""
    settings = get_settings()

    # -- Database --
    db_path = settings.database_url.replace("sqlite:///", "")
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await init_db(conn)

    application.state.db = conn
    application.state.connection_manager = ConnectionManager()

    # -- Worker pool --
    # Implements: spec/backend/plan.md#Lifespan (start worker pool on startup)
    pool = worker_pool.start(settings.worker_pool_size)
    application.state.worker_pool = pool

    yield

    # -- Shutdown --
    # Implements: spec/backend/plan.md#Lifespan (drain pool, close DB on shutdown)
    worker_pool.shutdown(pool)
    await conn.close()


# ---------------------------------------------------------------------------
# Custom Middleware
# Implements: spec/backend/plan.md#Middleware-Stack
# ---------------------------------------------------------------------------


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log method, path, status_code, duration_ms for every request.

    Implements: spec/backend/plan.md#Logging-Setup
    """

    async def dispatch(self, request: Request, call_next):
        start_time = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start_time) * 1000

        logger.info(
            "%s %s %d %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Catch unhandled exceptions and return a standard JSON 500 response.

    Implements: spec/backend/plan.md#Error-Handling-Middleware
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.error(
                "Unhandled exception on %s %s: %s",
                request.method,
                request.url.path,
                exc,
                exc_info=True,
            )
            return JSONResponse(
                status_code=500,
                content={"error": "Internal server error", "details": str(exc)},
            )


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(title="ChatDF", lifespan=lifespan)

# -- Middleware stack (applied in reverse order of add_middleware calls) --
# Implements: spec/backend/plan.md#Middleware-Stack
# Order: CORS -> RequestLogging -> ErrorHandling
# (add_middleware wraps outermost-first, so add in reverse)

settings = get_settings()

# 1. CORS (outermost)
# Implements: spec/backend/plan.md#CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Cookie"],
    allow_credentials=True,
)

# 2. Session middleware (for Authlib OAuth state)
# Implements: spec/backend/auth/plan.md#OAuth-State-Management
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.google_client_secret,
)

# 3. Request logging
app.add_middleware(RequestLoggingMiddleware)

# 4. Error handling (innermost)
app.add_middleware(ErrorHandlingMiddleware)


# ---------------------------------------------------------------------------
# Exception handlers
# Implements: spec/backend/rest_api/plan.md#Error-Response-Standardization
# ---------------------------------------------------------------------------


@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"error": exc.message})


@app.exception_handler(ForbiddenError)
async def forbidden_handler(request: Request, exc: ForbiddenError):
    return JSONResponse(status_code=403, content={"error": exc.message})


@app.exception_handler(RateLimitError)
async def rate_limit_handler(request: Request, exc: RateLimitError):
    return JSONResponse(
        status_code=429,
        content={"error": exc.message, "details": f"Resets in {exc.resets_in_seconds}s"},
    )


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"error": exc.message})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Normalize HTTPException responses to use the standard error format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )


# -- Routers --
# Implements: spec/backend/plan.md#Router-Organization
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(usage.router, prefix="/usage", tags=["usage"])
app.include_router(
    datasets.router,
    prefix="/conversations/{conversation_id}/datasets",
    tags=["datasets"],
)
app.include_router(ws_router)
