"""Saved queries router -- CRUD for user-saved SQL queries.

Endpoints:
- POST /saved-queries          -> save a query
- GET /saved-queries           -> list saved queries
- DELETE /saved-queries/{id}   -> delete a saved query
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import aiosqlite
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_db
from app.models import (
    SaveQueryRequest,
    SavedQueryListResponse,
    SavedQueryResponse,
    SuccessResponse,
)

router = APIRouter()


@router.post("", status_code=201, response_model=SavedQueryResponse)
async def save_query(
    body: SaveQueryRequest,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SavedQueryResponse:
    query_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    await db.execute(
        "INSERT INTO saved_queries (id, user_id, name, query, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (query_id, user["id"], body.name, body.query, body.result_json, now),
    )
    await db.commit()
    return SavedQueryResponse(
        id=query_id, name=body.name, query=body.query, result_json=body.result_json,
        created_at=datetime.fromisoformat(now),
    )


@router.get("", response_model=SavedQueryListResponse)
async def list_saved_queries(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SavedQueryListResponse:
    cursor = await db.execute(
        "SELECT id, name, query, result_json, created_at FROM saved_queries WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],),
    )
    rows = await cursor.fetchall()
    queries = [
        SavedQueryResponse(
            id=row["id"],
            name=row["name"],
            query=row["query"],
            result_json=row["result_json"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )
        for row in rows
    ]
    return SavedQueryListResponse(queries=queries)


@router.delete("/{query_id}", response_model=SuccessResponse)
async def delete_saved_query(
    query_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SuccessResponse:
    cursor = await db.execute(
        "SELECT id FROM saved_queries WHERE id = ? AND user_id = ?",
        (query_id, user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        from app.exceptions import NotFoundError

        raise NotFoundError("Saved query not found")
    await db.execute("DELETE FROM saved_queries WHERE id = ?", (query_id,))
    await db.commit()
    return SuccessResponse(success=True)
