"""Saved queries router -- CRUD for user-saved SQL queries.

Endpoints:
- POST /saved-queries              -> save a query
- GET /saved-queries               -> list saved queries
- GET /saved-queries/folders       -> list unique folder names
- PATCH /saved-queries/{id}/folder -> move a query to a different folder
- PATCH /saved-queries/{id}/pin    -> toggle pin status
- DELETE /saved-queries/{id}       -> delete a saved query
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
    UpdateFolderRequest,
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
        "INSERT INTO saved_queries (id, user_id, name, query, result_json, execution_time_ms, folder, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (query_id, user["id"], body.name, body.query, body.result_json, body.execution_time_ms, body.folder, now),
    )
    await db.commit()
    return SavedQueryResponse(
        id=query_id, name=body.name, query=body.query, result_json=body.result_json,
        execution_time_ms=body.execution_time_ms,
        folder=body.folder,
        is_pinned=False,
        created_at=datetime.fromisoformat(now),
    )


@router.get("/folders")
async def list_folders(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Return unique non-empty folder names for the current user's saved queries."""
    cursor = await db.execute(
        "SELECT DISTINCT folder FROM saved_queries WHERE user_id = ? AND folder != '' ORDER BY folder",
        (user["id"],),
    )
    rows = await cursor.fetchall()
    folders = [row["folder"] for row in rows]
    return {"folders": folders}


@router.get("", response_model=SavedQueryListResponse)
async def list_saved_queries(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SavedQueryListResponse:
    cursor = await db.execute(
        "SELECT id, name, query, result_json, execution_time_ms, folder, is_pinned, created_at FROM saved_queries WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC",
        (user["id"],),
    )
    rows = await cursor.fetchall()
    queries = [
        SavedQueryResponse(
            id=row["id"],
            name=row["name"],
            query=row["query"],
            result_json=row["result_json"],
            execution_time_ms=row["execution_time_ms"],
            folder=row["folder"],
            is_pinned=bool(row["is_pinned"]),
            created_at=datetime.fromisoformat(row["created_at"]),
        )
        for row in rows
    ]
    return SavedQueryListResponse(queries=queries)


@router.patch("/{query_id}/folder", response_model=SuccessResponse)
async def update_query_folder(
    query_id: str,
    body: UpdateFolderRequest,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SuccessResponse:
    """Move a saved query to a different folder."""
    cursor = await db.execute(
        "SELECT id FROM saved_queries WHERE id = ? AND user_id = ?",
        (query_id, user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        from app.exceptions import NotFoundError

        raise NotFoundError("Saved query not found")
    await db.execute(
        "UPDATE saved_queries SET folder = ? WHERE id = ?",
        (body.folder, query_id),
    )
    await db.commit()
    return SuccessResponse(success=True)


@router.patch("/{query_id}/pin", response_model=SavedQueryResponse)
async def toggle_pin(
    query_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SavedQueryResponse:
    """Toggle the is_pinned status of a saved query."""
    cursor = await db.execute(
        "SELECT id, name, query, result_json, execution_time_ms, folder, is_pinned, created_at FROM saved_queries WHERE id = ? AND user_id = ?",
        (query_id, user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        from app.exceptions import NotFoundError

        raise NotFoundError("Saved query not found")
    new_pinned = 0 if row["is_pinned"] else 1
    await db.execute(
        "UPDATE saved_queries SET is_pinned = ? WHERE id = ?",
        (new_pinned, query_id),
    )
    await db.commit()
    return SavedQueryResponse(
        id=row["id"],
        name=row["name"],
        query=row["query"],
        result_json=row["result_json"],
        execution_time_ms=row["execution_time_ms"],
        folder=row["folder"],
        is_pinned=bool(new_pinned),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


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
