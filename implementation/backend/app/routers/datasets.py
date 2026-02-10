"""Datasets router -- CRUD for datasets within a conversation.

Implements: spec/backend/rest_api/plan.md#routersdatasetspy

Endpoints (all under /conversations/{conversation_id}/datasets):
- POST /                          -> add_dataset
- POST /upload                    -> upload_dataset (file upload)
- PATCH /{dataset_id}             -> rename_dataset
- POST /{dataset_id}/refresh      -> refresh_dataset_schema
- DELETE /{dataset_id}            -> remove_dataset
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import aiosqlite
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile

from app.config import get_settings
from app.dependencies import get_conversation, get_current_user, get_db
from app.models import (
    AddDatasetRequest,
    DatasetAckResponse,
    DatasetDetailResponse,
    DatasetPreviewResponse,
    ProfileColumnRequest,
    RenameDatasetRequest,
    SuccessResponse,
)
from app.services import dataset_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: get worker_pool from app.state
# ---------------------------------------------------------------------------


def _get_worker_pool(request: Request) -> object:
    return request.app.state.worker_pool


async def _auto_profile_dataset(
    worker_pool, connection_manager, user_id: str, dataset_id: str, url: str
) -> None:
    """Background task: profile columns after dataset load, send results via WS."""
    try:
        profile_result = await worker_pool.profile_columns(url)
        if connection_manager is not None and profile_result.get("profiles"):
            await connection_manager.send_to_user(
                user_id,
                {
                    "type": "dataset_profiled",
                    "dataset_id": dataset_id,
                    "profiles": profile_result["profiles"],
                },
            )
    except Exception:
        logger.warning("Auto-profile failed for dataset %s", dataset_id, exc_info=True)


# ---------------------------------------------------------------------------
# Helper: look up dataset row, raise 404 if missing
# ---------------------------------------------------------------------------


async def _get_dataset_or_404(
    db: aiosqlite.Connection, dataset_id: str, conversation_id: str
) -> dict:
    """Fetch a dataset by ID scoped to conversation_id. Raise 404 if not found."""
    cursor = await db.execute(
        "SELECT id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, error_message, loaded_at, file_size_bytes, column_descriptions "
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
                    "file_size_bytes": result.get("file_size_bytes"),
                },
            },
        )

    # Fire-and-forget: auto-profile columns in the background
    asyncio.create_task(
        _auto_profile_dataset(
            worker_pool, connection_manager, user["id"], result["id"], result["url"]
        )
    )

    return DatasetAckResponse(dataset_id=result["id"], status="loading")


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/datasets/upload
# File upload endpoint for local parquet files
# ---------------------------------------------------------------------------


@router.post("/upload", status_code=201, response_model=DatasetAckResponse)
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> DatasetAckResponse:
    """Upload a local data file (parquet, CSV, TSV) as a dataset."""
    settings = get_settings()
    worker_pool = _get_worker_pool(request)
    conversation_id = conversation["id"]

    # 1. Validate file extension
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    allowed_exts = {"parquet", "csv", "tsv"}
    if ext not in allowed_exts and not filename.lower().endswith(".csv.gz"):
        raise HTTPException(status_code=400, detail="Only .parquet, .csv, .tsv, and .csv.gz files are supported")

    # 2. Validate file size (read content to check)
    max_size = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {settings.max_upload_size_mb}MB)",
        )

    # 3. Check dataset limit
    cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM datasets WHERE conversation_id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row["cnt"] >= dataset_service.MAX_DATASETS_PER_CONVERSATION:
        raise HTTPException(status_code=400, detail="Maximum 50 datasets reached")

    # 4. Validate parquet magic bytes (only for .parquet files)
    if ext == "parquet" and (len(content) < 4 or content[:4] != b"PAR1"):
        raise HTTPException(status_code=400, detail="Not a valid parquet file")

    # 5. Save file to uploads directory
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_uuid = str(uuid4())
    file_ext = ".csv.gz" if filename.lower().endswith(".csv.gz") else f".{ext}"
    saved_filename = f"{file_uuid}{file_ext}"
    saved_path = upload_dir / saved_filename
    with open(saved_path, "wb") as f:
        f.write(content)

    # 6. Extract schema using worker pool (local file path)
    local_path = str(saved_path.resolve())
    schema_result = await worker_pool.get_schema(local_path)
    if "error_type" in schema_result:
        # Clean up the saved file on schema extraction failure
        saved_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=schema_result.get("message", "Failed to extract schema"),
        )

    # 7. Persist to DB
    columns = schema_result.get("columns", [])
    row_count = schema_result.get("row_count", 0)
    column_count = len(columns)
    schema_json = json.dumps(columns)
    table_name = await dataset_service._next_table_name(db, conversation_id)
    dataset_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    file_size_bytes = len(content)
    stored_url = f"file://{local_path}"

    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at, file_size_bytes) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (dataset_id, conversation_id, stored_url, table_name, row_count, column_count, schema_json, "ready", None, now, file_size_bytes),
    )
    await db.commit()

    # 8. Send dataset_loaded WS event
    connection_manager = getattr(request.app.state, "connection_manager", None)
    if connection_manager is not None:
        await connection_manager.send_to_user(
            user["id"],
            {
                "type": "dataset_loaded",
                "dataset": {
                    "id": dataset_id,
                    "conversation_id": conversation_id,
                    "url": stored_url,
                    "name": table_name,
                    "row_count": row_count,
                    "column_count": column_count,
                    "schema_json": schema_json,
                    "status": "ready",
                    "error_message": None,
                    "file_size_bytes": file_size_bytes,
                },
            },
        )

    return DatasetAckResponse(dataset_id=dataset_id, status="loading")


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
# POST /conversations/{conversation_id}/datasets/{dataset_id}/profile
# Column profiling endpoint
# ---------------------------------------------------------------------------


@router.post("/{dataset_id}/profile")
async def profile_dataset(
    request: Request,
    dataset_id: str,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Compute per-column profiling statistics for a dataset."""
    ds = await _get_dataset_or_404(db, dataset_id, conversation["id"])

    worker_pool = _get_worker_pool(request)
    result = await worker_pool.profile_columns(ds["url"])

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    if "error_type" in result:
        raise HTTPException(status_code=500, detail=result.get("message", "Profiling failed"))

    return result


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/datasets/{dataset_id}/profile-column
# Single-column detailed profiling endpoint
# ---------------------------------------------------------------------------


@router.post("/{dataset_id}/profile-column")
async def profile_single_column(
    request: Request,
    dataset_id: str,
    body: ProfileColumnRequest,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Profile a single column with detailed statistics."""
    ds = await _get_dataset_or_404(db, dataset_id, conversation["id"])

    worker_pool = _get_worker_pool(request)
    result = await worker_pool.profile_column(
        ds["url"], ds["name"], body.column_name, body.column_type
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return result


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/datasets/{dataset_id}/preview
# Quick-preview: return up to 10 sample rows from the dataset
# ---------------------------------------------------------------------------


@router.post("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
async def preview_dataset(
    request: Request,
    dataset_id: str,
    sample_size: int = Query(default=10, ge=1, le=100),
    random_sample: bool = Query(default=False),
    sample_method: str = Query(default="head", pattern="^(head|tail|random|stratified|percentage)$"),
    sample_column: str | None = Query(default=None),
    sample_percentage: float = Query(default=1.0, ge=0.01, le=100.0),
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> DatasetPreviewResponse:
    """Return sample rows from a dataset for quick preview.

    Query params:
      - sample_size: number of rows to return (1-100, default 10)
      - random_sample: if true, treat as sample_method="random" (backward compat)
      - sample_method: sampling strategy — head, tail, random, stratified, percentage
      - sample_column: column name for stratified sampling (required when method=stratified)
      - sample_percentage: percentage of rows for percentage sampling (0.01-100.0)
    """
    ds = await _get_dataset_or_404(db, dataset_id, conversation["id"])

    # Backward compatibility: random_sample=True overrides sample_method
    if random_sample and sample_method == "head":
        sample_method = "random"

    # Validate stratified requires sample_column
    if sample_method == "stratified" and not sample_column:
        raise HTTPException(
            status_code=400,
            detail="sample_column is required for stratified sampling",
        )

    worker_pool = _get_worker_pool(request)
    table_name = ds["name"]

    # Build SQL based on sample_method
    if sample_method == "head":
        sql = f'SELECT * FROM "{table_name}" LIMIT {sample_size}'

    elif sample_method == "tail":
        sql = (
            f'SELECT * FROM ('
            f'SELECT *, ROW_NUMBER() OVER () as _rn FROM "{table_name}"'
            f') sub ORDER BY _rn DESC LIMIT {sample_size}'
        )

    elif sample_method == "random":
        sql = f'SELECT * FROM "{table_name}" ORDER BY RANDOM() LIMIT {sample_size}'

    elif sample_method == "stratified":
        # Validate sample_column exists in schema
        schema_json = ds.get("schema_json", "[]")
        try:
            columns_schema = json.loads(schema_json) if schema_json else []
        except (json.JSONDecodeError, TypeError):
            columns_schema = []
        column_names = [c.get("name", "") for c in columns_schema if isinstance(c, dict)]
        if sample_column not in column_names:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{sample_column}' not found in dataset schema",
            )

        # Get distinct count to compute per-group limit
        count_sql = f'SELECT COUNT(DISTINCT "{sample_column}") as cnt FROM "{table_name}"'
        datasets_arg = [{"url": ds["url"], "table_name": table_name}]
        count_result = await worker_pool.run_query(count_sql, datasets_arg)
        if "error_type" in count_result:
            raise HTTPException(
                status_code=500,
                detail=count_result.get("message", "Failed to count distinct values"),
            )
        count_rows = count_result.get("rows", [])
        num_distinct = count_rows[0].get("cnt", 1) if count_rows else 1
        num_distinct = max(num_distinct, 1)
        per_group = math.ceil(sample_size / num_distinct)

        sql = (
            f'SELECT * FROM ('
            f'SELECT *, ROW_NUMBER() OVER (PARTITION BY "{sample_column}" ORDER BY RANDOM()) as _rn '
            f'FROM "{table_name}"'
            f') sub WHERE _rn <= {per_group} LIMIT {sample_size}'
        )

    elif sample_method == "percentage":
        total_rows = ds["row_count"] or 0
        computed_count = max(1, min(100, round(total_rows * sample_percentage / 100)))
        sql = f'SELECT * FROM "{table_name}" ORDER BY RANDOM() LIMIT {computed_count}'

    else:
        # Should not reach here due to regex validation, but just in case
        sql = f'SELECT * FROM "{table_name}" LIMIT {sample_size}'

    datasets = [{"url": ds["url"], "table_name": table_name}]

    result = await worker_pool.run_query(sql, datasets)

    if "error_type" in result:
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "Preview query failed"),
        )

    # Convert row dicts to list-of-lists for the response
    columns = result.get("columns", [])
    row_dicts = result.get("rows", [])
    # Filter out internal columns added by window functions
    display_columns = [c for c in columns if c != "_rn"]
    rows = [[row.get(col) for col in display_columns] for row in row_dicts]

    return DatasetPreviewResponse(
        columns=display_columns,
        rows=rows,
        total_rows=ds["row_count"],
        sample_method=sample_method,
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


# ---------------------------------------------------------------------------
# GET /conversations/{conversation_id}/datasets/{dataset_id}/column-descriptions
# ---------------------------------------------------------------------------


@router.get("/{dataset_id}/column-descriptions")
async def get_column_descriptions(
    dataset_id: str,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Get column descriptions for a dataset."""
    ds = await _get_dataset_or_404(db, dataset_id, conversation["id"])

    raw = ds.get("column_descriptions", "{}")
    try:
        descriptions = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        descriptions = {}

    return {"descriptions": descriptions}


# ---------------------------------------------------------------------------
# PATCH /conversations/{conversation_id}/datasets/{dataset_id}/column-descriptions
# ---------------------------------------------------------------------------


@router.patch("/{dataset_id}/column-descriptions")
async def update_column_descriptions(
    dataset_id: str,
    body: dict,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Update column descriptions for a dataset.

    Body: {"descriptions": {"column_name": "description text", ...}}
    """
    await _get_dataset_or_404(db, dataset_id, conversation["id"])

    descriptions = body.get("descriptions", {})
    if not isinstance(descriptions, dict):
        raise HTTPException(status_code=400, detail="descriptions must be a dict")

    # Validate all keys are strings and values are strings
    for k, v in descriptions.items():
        if not isinstance(k, str) or not isinstance(v, str):
            raise HTTPException(status_code=400, detail="All keys and values must be strings")
        if len(v) > 500:
            raise HTTPException(status_code=400, detail=f"Description for '{k}' exceeds 500 chars")

    await db.execute(
        "UPDATE datasets SET column_descriptions = ? WHERE id = ?",
        (json.dumps(descriptions), dataset_id),
    )
    await db.commit()

    return {"success": True, "descriptions": descriptions}
