"""Health check endpoint -- no auth required."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Request

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
    """Return query cache statistics (hit rate, total hits, misses, entry count)."""
    cache = _get_cache(request)
    return cache.stats


@router.post("/cache/clear")
async def cache_clear(request: Request):
    """Clear the query cache. Useful for debugging."""
    cache = _get_cache(request)
    cache.clear()
    return {"success": True, "message": "Cache cleared"}
