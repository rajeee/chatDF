"""Health check endpoint -- no auth required."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Request

from app.services import persistent_cache

router = APIRouter()

_start_time = time.monotonic()


@router.get("")
async def health_check(request: Request):
    """Return system health status. No auth required."""
    uptime = time.monotonic() - _start_time

    # Check database
    db_status = "ok"
    try:
        db = request.app.state.db
        await db.execute("SELECT 1")
    except Exception:
        db_status = "error"

    # Check worker pool
    pool_status = "ok"
    try:
        pool = request.app.state.worker_pool
        if pool is None:
            pool_status = "error"
    except Exception:
        pool_status = "error"

    return {
        "status": "ok" if db_status == "ok" and pool_status == "ok" else "degraded",
        "uptime_seconds": round(uptime, 1),
        "database": db_status,
        "worker_pool": pool_status,
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# Cache management endpoints
# ---------------------------------------------------------------------------


def _get_cache(request: Request):
    """Get the query cache from the worker pool, or raise 503."""
    pool = getattr(request.app.state, "worker_pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Worker pool unavailable")
    return pool.query_cache


@router.get("/cache/stats")
async def cache_stats(request: Request):
    """Return in-memory and persistent query cache statistics."""
    pool = getattr(request.app.state, "worker_pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Worker pool unavailable")

    in_memory = pool.query_cache.stats

    # Persistent cache stats (if db_pool is available)
    persistent_stats = {"size": 0, "oldest_entry": None, "newest_entry": None}
    if pool.db_pool is not None:
        try:
            db_conn = await pool.db_pool.acquire_read()
            try:
                persistent_stats = await persistent_cache.stats(db_conn)
            finally:
                await pool.db_pool.release_read(db_conn)
        except Exception:
            pass  # return defaults on error

    return {
        "in_memory": in_memory,
        "persistent": persistent_stats,
    }


@router.post("/cache/clear")
async def cache_clear(request: Request):
    """Clear the query cache. Useful for debugging."""
    cache = _get_cache(request)
    cache.clear()
    return {"success": True, "message": "Cache cleared"}


@router.post("/cache/cleanup")
async def cache_cleanup(request: Request):
    """Remove expired entries from the persistent query cache."""
    pool = getattr(request.app.state, "worker_pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Worker pool unavailable")
    if pool.db_pool is None:
        raise HTTPException(status_code=503, detail="Database pool unavailable")

    write_conn = pool.db_pool.get_write_connection()
    removed = await persistent_cache.cleanup(write_conn)
    return {"success": True, "removed": removed}
