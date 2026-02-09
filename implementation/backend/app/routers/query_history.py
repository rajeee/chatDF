"""Query history router -- tracks all SQL queries executed by users.

Endpoints:
- GET /query-history          -> list_query_history
- DELETE /query-history       -> clear_query_history
"""

from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/query-history", tags=["query-history"])


@router.get("")
async def list_query_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """List the current user's query history, most recent first."""
    cursor = await db.execute(
        """
        SELECT id, conversation_id, query, execution_time_ms, row_count,
               status, error_message, source, created_at
        FROM query_history
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (user["id"], limit, offset),
    )
    rows = await cursor.fetchall()

    # Get total count
    count_cursor = await db.execute(
        "SELECT COUNT(*) FROM query_history WHERE user_id = ?",
        (user["id"],),
    )
    total = (await count_cursor.fetchone())[0]

    return {
        "history": [dict(row) for row in rows],
        "total": total,
    }


@router.delete("")
async def clear_query_history(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Clear all query history for the current user."""
    await db.execute(
        "DELETE FROM query_history WHERE user_id = ?",
        (user["id"],),
    )
    await db.commit()
    return {"success": True}
