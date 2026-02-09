"""Health check endpoint -- no auth required."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request

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
