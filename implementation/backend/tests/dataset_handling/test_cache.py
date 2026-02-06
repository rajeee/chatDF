"""Schema caching and refresh tests.

Tests: spec/backend/dataset_handling/test.md#CACHE-1, CACHE-2
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from app.services.dataset_service import add_dataset, refresh_schema


# ---------------------------------------------------------------------------
# CACHE-1: Schema cached in SQLite after add_dataset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_schema_cached_after_add(
    fresh_db, test_conversation, mock_worker_pool
):
    """After add_dataset, schema available in DB without re-fetching."""
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/data.parquet",
        mock_worker_pool,
    )

    cursor = await fresh_db.execute(
        "SELECT schema_json, row_count, column_count FROM datasets WHERE id = ?",
        (result["id"],),
    )
    row = await cursor.fetchone()
    assert row is not None

    schema = json.loads(row["schema_json"])
    assert len(schema) == 2
    assert schema[0]["name"] == "id"
    assert schema[0]["type"] == "Int64"
    assert schema[1]["name"] == "name"
    assert schema[1]["type"] == "Utf8"

    assert row["row_count"] == 100
    assert row["column_count"] == 2


# ---------------------------------------------------------------------------
# CACHE-2: Refresh schema re-runs pipeline and updates row
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_refresh_schema_updates_row(
    fresh_db, test_conversation, mock_worker_pool
):
    """refresh_schema updates schema_json, row_count, column_count, loaded_at."""
    # Add initial dataset
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/data.parquet",
        mock_worker_pool,
    )
    original_loaded_at = result["loaded_at"]

    # Update mock to return a different schema
    mock_worker_pool.get_schema = AsyncMock(
        return_value={
            "columns": [
                {"name": "id", "type": "Int64"},
                {"name": "name", "type": "Utf8"},
                {"name": "age", "type": "Int32"},
            ],
            "row_count": 250,
        },
    )

    # Refresh
    updated = await refresh_schema(fresh_db, result["id"], mock_worker_pool)

    assert updated["row_count"] == 250
    assert updated["column_count"] == 3

    schema = json.loads(updated["schema_json"])
    assert len(schema) == 3
    assert schema[2]["name"] == "age"

    # Verify persisted in DB
    cursor = await fresh_db.execute(
        "SELECT schema_json, row_count, column_count FROM datasets WHERE id = ?",
        (result["id"],),
    )
    db_row = await cursor.fetchone()
    assert db_row["row_count"] == 250
    assert db_row["column_count"] == 3


@pytest.mark.asyncio
@pytest.mark.unit
async def test_refresh_schema_failure_preserves_old_schema(
    fresh_db, test_conversation, mock_worker_pool
):
    """If refresh fails, old schema remains in DB."""
    # Add initial dataset
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/data.parquet",
        mock_worker_pool,
    )

    # Mock worker failure on validate_url
    mock_worker_pool.validate_url = AsyncMock(
        return_value={"valid": False, "error": "Could not access URL"}
    )

    with pytest.raises(ValueError, match="Could not access URL"):
        await refresh_schema(fresh_db, result["id"], mock_worker_pool)

    # Old schema should remain
    cursor = await fresh_db.execute(
        "SELECT schema_json, row_count, column_count FROM datasets WHERE id = ?",
        (result["id"],),
    )
    db_row = await cursor.fetchone()
    assert db_row["row_count"] == 100  # Original value
    assert db_row["column_count"] == 2  # Original value
