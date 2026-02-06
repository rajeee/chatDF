"""Dataset removal tests.

Tests: spec/backend/dataset_handling/test.md#REMOVE-1 through REMOVE-3
"""

from __future__ import annotations

import pytest

from app.services.dataset_service import add_dataset, get_datasets, remove_dataset


# ---------------------------------------------------------------------------
# REMOVE-1: Dataset removal clears schema row from DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_dataset_deletes_row(
    fresh_db, test_conversation, mock_worker_pool
):
    """After remove_dataset, the row is deleted from datasets table."""
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/data.parquet",
        mock_worker_pool,
    )

    await remove_dataset(fresh_db, result["id"])

    cursor = await fresh_db.execute(
        "SELECT id FROM datasets WHERE id = ?", (result["id"],)
    )
    row = await cursor.fetchone()
    assert row is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_dataset_leaves_other_datasets(
    fresh_db, test_conversation, mock_worker_pool
):
    """Removing one dataset does not affect others in the same conversation."""
    ds1 = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/d1.parquet",
        mock_worker_pool,
    )
    ds2 = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/d2.parquet",
        mock_worker_pool,
    )

    await remove_dataset(fresh_db, ds1["id"])

    remaining = await get_datasets(fresh_db, test_conversation["id"])
    assert len(remaining) == 1
    assert remaining[0]["id"] == ds2["id"]


# ---------------------------------------------------------------------------
# REMOVE-2/3: LLM context update after removal
# (Integration between dataset_service and LLM service - we test the data
#  layer here: get_datasets should not return removed datasets.)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_datasets_excludes_removed(
    fresh_db, test_conversation, mock_worker_pool
):
    """get_datasets does not return a removed dataset."""
    ds1 = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/d1.parquet",
        mock_worker_pool,
    )
    ds2 = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/d2.parquet",
        mock_worker_pool,
    )

    await remove_dataset(fresh_db, ds1["id"])

    datasets = await get_datasets(fresh_db, test_conversation["id"])
    dataset_ids = [d["id"] for d in datasets]
    assert ds1["id"] not in dataset_ids
    assert ds2["id"] in dataset_ids


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_nonexistent_dataset_no_error(fresh_db):
    """Removing a dataset ID that doesn't exist does not raise."""
    await remove_dataset(fresh_db, "nonexistent-id")
