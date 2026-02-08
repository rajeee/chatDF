"""Datasets router -- CRUD for datasets within a conversation.

Implements: spec/backend/rest_api/plan.md#routersdatasetspy

Endpoints (all under /conversations/{conversation_id}/datasets):
- POST /                          -> add_dataset
- PATCH /{dataset_id}             -> rename_dataset
- POST /{dataset_id}/refresh      -> refresh_dataset_schema
- DELETE /{dataset_id}            -> remove_dataset
"""

from __future__ import annotations

import json

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencies import get_conversation, get_current_user, get_db
from app.models import (
    AddDatasetRequest,
    DatasetAckResponse,
    DatasetDetailResponse,
    RenameDatasetRequest,
    SuccessResponse,
)
from app.services import dataset_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: get worker_pool from app.state
# ---------------------------------------------------------------------------


def _get_worker_pool(request: Request) -> object:
    return request.app.state.worker_pool


# ---------------------------------------------------------------------------
# Helper: look up dataset row, raise 404 if missing
# ---------------------------------------------------------------------------


async def _get_dataset_or_404(
    db: aiosqlite.Connection, dataset_id: str, conversation_id: str
) -> dict:
    """Fetch a dataset by ID scoped to conversation_id. Raise 404 if not found."""
    cursor = await db.execute(
        "SELECT id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, error_message, loaded_at "
        "FROM datasets WHERE id = ? AND conversation_id = ?",
        (dataset_id, conversation_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dict(row)


def _parse_schema_json(schema_json: str | None) -> dict | None:
    """Parse schema_json column into a dict suitable for DatasetDetailResponse.

    The DB stores a JSON array of column dicts. The response model expects
    ``dict[str, Any] | None``, so we wrap the array in ``{"columns": [...]}``.
    """
    if not schema_json:
        return None
    try:
        parsed = json.loads(schema_json)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(parsed, list):
        return {"columns": parsed}
    if isinstance(parsed, dict):
        return parsed
    return None


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/datasets
# Implements: spec/backend/rest_api/plan.md#routersdatasetspy
# ---------------------------------------------------------------------------


@router.post("", status_code=201, response_model=DatasetAckResponse)
async def add_dataset(
    request: Request,
    body: AddDatasetRequest,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> DatasetAckResponse:
    """Add a dataset to the conversation via the validation pipeline."""
    worker_pool = _get_worker_pool(request)

    try:
        result = await dataset_service.add_dataset(
            db, conversation["id"], body.url, worker_pool, name=body.name
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Send dataset_loaded WS event so frontend can update from "loading" to "ready"
    connection_manager = getattr(request.app.state, "connection_manager", None)
    if connection_manager is not None:
        await connection_manager.send_to_user(
            user["id"],
            {
                "type": "dataset_loaded",
                "dataset": {
                    "id": result["id"],
                    "conversation_id": conversation["id"],
                    "url": result["url"],
                    "name": result["name"],
                    "row_count": result["row_count"],
                    "column_count": result["column_count"],
                    "schema_json": result["schema_json"],
                    "status": "ready",
                    "error_message": None,
                },
            },
        )

    return DatasetAckResponse(dataset_id=result["id"], status="loading")


# ---------------------------------------------------------------------------
# PATCH /conversations/{conversation_id}/datasets/{dataset_id}
# Implements: spec/backend/rest_api/plan.md#routersdatasetspy
# ---------------------------------------------------------------------------


@router.patch("/{dataset_id}", response_model=DatasetDetailResponse)
async def rename_dataset(
    dataset_id: str,
    body: RenameDatasetRequest,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> DatasetDetailResponse:
    """Rename a dataset's tableName / name."""
    ds = await _get_dataset_or_404(db, dataset_id, conversation["id"])

    new_name = body.tableName
    await db.execute(
        "UPDATE datasets SET name = ? WHERE id = ?",
        (new_name, dataset_id),
    )
    await db.commit()

    schema = _parse_schema_json(ds["schema_json"])

    return DatasetDetailResponse(
        id=ds["id"],
        name=new_name,
        tableName=new_name,
        url=ds["url"],
        row_count=ds["row_count"],
        column_count=ds["column_count"],
        schema=schema,
    )


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/datasets/{dataset_id}/refresh
# Implements: spec/backend/rest_api/plan.md#routersdatasetspy
# ---------------------------------------------------------------------------


@router.post("/{dataset_id}/refresh", response_model=DatasetDetailResponse)
async def refresh_dataset_schema(
    request: Request,
    dataset_id: str,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> DatasetDetailResponse:
    """Re-fetch schema for an existing dataset."""
    # Verify dataset exists and belongs to this conversation
    await _get_dataset_or_404(db, dataset_id, conversation["id"])

    worker_pool = _get_worker_pool(request)

    try:
        result = await dataset_service.refresh_schema(db, dataset_id, worker_pool)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    schema = _parse_schema_json(result.get("schema_json"))

    return DatasetDetailResponse(
        id=result["id"],
        name=result["name"],
        tableName=result["name"],
        url=result["url"],
        row_count=result["row_count"],
        column_count=result["column_count"],
        schema=schema,
    )


# ---------------------------------------------------------------------------
# DELETE /conversations/{conversation_id}/datasets/{dataset_id}
# Implements: spec/backend/rest_api/plan.md#routersdatasetspy
# ---------------------------------------------------------------------------


@router.delete("/{dataset_id}", response_model=SuccessResponse)
async def remove_dataset(
    dataset_id: str,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> SuccessResponse:
    """Remove a dataset from the conversation."""
    await _get_dataset_or_404(db, dataset_id, conversation["id"])

    await dataset_service.remove_dataset(db, dataset_id)

    return SuccessResponse(success=True)
