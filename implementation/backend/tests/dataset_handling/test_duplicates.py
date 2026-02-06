"""Duplicate detection tests.

Tests: spec/backend/dataset_handling/test.md#DUP-1 through DUP-3
"""

from __future__ import annotations

import pytest

from app.services.dataset_service import add_dataset
from ..factories import make_conversation

from .conftest import _insert_conversation


# ---------------------------------------------------------------------------
# DUP-1: Duplicate URL in same conversation rejected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_duplicate_url_same_conversation_rejected(
    fresh_db, test_conversation, mock_worker_pool
):
    """Adding the same URL to the same conversation twice is rejected."""
    url = "https://example.com/data.parquet"

    await add_dataset(fresh_db, test_conversation["id"], url, mock_worker_pool)

    with pytest.raises(ValueError, match="This dataset is already loaded"):
        await add_dataset(fresh_db, test_conversation["id"], url, mock_worker_pool)


# ---------------------------------------------------------------------------
# DUP-2: Exact string match — no URL normalization
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_urls_differing_by_query_param_are_not_duplicates(
    fresh_db, test_conversation, mock_worker_pool
):
    """URLs differing only by query param are treated as different."""
    url1 = "https://example.com/data.parquet"
    url2 = "https://example.com/data.parquet?v=1"

    result1 = await add_dataset(fresh_db, test_conversation["id"], url1, mock_worker_pool)
    result2 = await add_dataset(fresh_db, test_conversation["id"], url2, mock_worker_pool)

    assert result1["url"] != result2["url"]
    assert result1["id"] != result2["id"]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_exact_same_url_is_duplicate(
    fresh_db, test_conversation, mock_worker_pool
):
    """Two identical URL strings are duplicates."""
    url = "https://example.com/data.parquet"

    await add_dataset(fresh_db, test_conversation["id"], url, mock_worker_pool)

    with pytest.raises(ValueError, match="This dataset is already loaded"):
        await add_dataset(fresh_db, test_conversation["id"], url, mock_worker_pool)


# ---------------------------------------------------------------------------
# DUP-3: Same URL in different conversations is allowed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_same_url_in_different_conversations_allowed(
    fresh_db, test_user, mock_worker_pool
):
    """Same URL in two different conversations succeeds (independent contexts)."""
    url = "https://example.com/data.parquet"

    conv1 = make_conversation(user_id=test_user["id"])
    conv2 = make_conversation(user_id=test_user["id"])
    await _insert_conversation(fresh_db, conv1)
    await _insert_conversation(fresh_db, conv2)

    result1 = await add_dataset(fresh_db, conv1["id"], url, mock_worker_pool)
    result2 = await add_dataset(fresh_db, conv2["id"], url, mock_worker_pool)

    assert result1["conversation_id"] != result2["conversation_id"]
    assert result1["url"] == result2["url"]
