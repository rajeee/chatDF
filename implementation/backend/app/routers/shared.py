"""Shared results router -- public (no auth) viewing of shared saved query results.

Endpoints:
- GET /api/shared/result/{token} -> view a shared saved query result (no auth)
"""

from __future__ import annotations

import json

import aiosqlite
from fastapi import APIRouter, Depends

from app.dependencies import get_db
from app.exceptions import NotFoundError
from app.models import SharedResultResponse

router = APIRouter()


@router.get("/shared/result/{token}", response_model=SharedResultResponse)
async def get_shared_result(
    token: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> SharedResultResponse:
    """View a shared saved query result by its share token (no authentication required)."""
    cursor = await db.execute(
        "SELECT name, query, result_json, execution_time_ms, created_at "
        "FROM saved_queries WHERE share_token = ?",
        (token,),
    )
    row = await cursor.fetchone()
    if not row:
        raise NotFoundError("Shared result not found")

    # Parse result_json into structured data
    result_data = None
    if row["result_json"]:
        try:
            result_data = json.loads(row["result_json"])
        except (json.JSONDecodeError, TypeError):
            pass

    return SharedResultResponse(
        name=row["name"],
        query=row["query"],
        result_data=result_data,
        execution_time_ms=row["execution_time_ms"],
        created_at=row["created_at"],
    )
