"""Query history router -- tracks all SQL queries executed by users.

Endpoints:
- GET /query-history              -> list_query_history
- DELETE /query-history           -> clear_query_history
- PATCH /query-history/{id}/star  -> toggle_star_query
"""

from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/query-history", tags=["query-history"])


@router.get("")
async def list_query_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    starred: bool | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """List the current user's query history, most recent first."""
    where = "WHERE user_id = ?"
    params: list = [user["id"]]

    if starred is not None:
        where += " AND is_starred = ?"
        params.append(1 if starred else 0)

    cursor = await db.execute(
        f"""
        SELECT id, conversation_id, query, execution_time_ms, row_count,
               status, error_message, source, created_at, is_starred
        FROM query_history
        {where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    )
    rows = await cursor.fetchall()

    # Get total count
    count_cursor = await db.execute(
        f"SELECT COUNT(*) FROM query_history {where}",
        params,
    )
    total = (await count_cursor.fetchone())[0]

    return {
        "history": [dict(row) for row in rows],
        "total": total,
    }


@router.patch("/{query_id}/star")
async def toggle_star_query(
    query_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Toggle the starred status of a query history entry."""
    cursor = await db.execute(
        "SELECT is_starred FROM query_history WHERE id = ? AND user_id = ?",
        (query_id, user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Query not found")

    new_status = 0 if row["is_starred"] else 1
    await db.execute(
        "UPDATE query_history SET is_starred = ? WHERE id = ?",
        (new_status, query_id),
    )
    await db.commit()
    return {"id": query_id, "is_starred": bool(new_status)}


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
