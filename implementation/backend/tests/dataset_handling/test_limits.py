"""Dataset limit enforcement tests.

Tests: spec/backend/dataset_handling/test.md#LIMIT-1 through LIMIT-3
"""

from __future__ import annotations

import pytest

from app.services.dataset_service import (
    MAX_DATASETS_PER_CONVERSATION,
    add_dataset,
    remove_dataset,
)


# ---------------------------------------------------------------------------
# LIMIT-1: Maximum N datasets per conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize(
    "conversation_with_datasets",
    [MAX_DATASETS_PER_CONVERSATION],
    indirect=True,
)
async def test_over_limit_dataset_rejected(
    fresh_db, conversation_with_datasets, mock_worker_pool
):
    """Adding one more dataset beyond the limit is rejected."""
    conv, datasets = conversation_with_datasets
    assert len(datasets) == MAX_DATASETS_PER_CONVERSATION

    with pytest.raises(
        ValueError,
        match=f"Maximum {MAX_DATASETS_PER_CONVERSATION} datasets reached",
    ):
        await add_dataset(
            fresh_db,
            conv["id"],
            "https://example.com/extra.parquet",
            mock_worker_pool,
        )


# ---------------------------------------------------------------------------
# LIMIT-2: Removing a dataset frees a slot
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize(
    "conversation_with_datasets",
    [MAX_DATASETS_PER_CONVERSATION],
    indirect=True,
)
async def test_removing_one_then_adding_succeeds(
    fresh_db, conversation_with_datasets, mock_worker_pool
):
    """Remove one dataset from the limit, then adding a new one succeeds."""
    conv, datasets = conversation_with_datasets

    # Remove one
    await remove_dataset(fresh_db, datasets[0]["id"])

    # Add a new one should now succeed
    result = await add_dataset(
        fresh_db,
        conv["id"],
        "https://example.com/replacement.parquet",
        mock_worker_pool,
    )
    assert result["url"] == "https://example.com/replacement.parquet"


# ---------------------------------------------------------------------------
# LIMIT-3: Exactly at the limit is allowed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_max_datasets_allowed(
    fresh_db, test_conversation, mock_worker_pool
):
    """Adding exactly MAX_DATASETS_PER_CONVERSATION datasets succeeds."""
    for i in range(MAX_DATASETS_PER_CONVERSATION):
        result = await add_dataset(
            fresh_db,
            test_conversation["id"],
            f"https://example.com/d{i}.parquet",
            mock_worker_pool,
        )
        assert result is not None

    # Verify count in DB
    cursor = await fresh_db.execute(
        "SELECT COUNT(*) as cnt FROM datasets WHERE conversation_id = ?",
        (test_conversation["id"],),
    )
    row = await cursor.fetchone()
    assert row["cnt"] == MAX_DATASETS_PER_CONVERSATION
