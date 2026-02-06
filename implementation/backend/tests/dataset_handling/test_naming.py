"""Auto-naming tests.

Tests: spec/backend/dataset_handling/test.md#NAME-1 through NAME-3
"""

from __future__ import annotations

import re

import pytest

from app.services.dataset_service import add_dataset, remove_dataset, _next_table_name


# ---------------------------------------------------------------------------
# NAME-1: Auto-naming sequential — table1, table2, table3
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_first_dataset_named_table1(
    fresh_db, test_conversation, mock_worker_pool
):
    """First dataset added gets name table1."""
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/d1.parquet",
        mock_worker_pool,
    )
    assert result["name"] == "table1"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_three_datasets_named_sequentially(
    fresh_db, test_conversation, mock_worker_pool
):
    """First three datasets named table1, table2, table3."""
    names = []
    for i in range(3):
        result = await add_dataset(
            fresh_db,
            test_conversation["id"],
            f"https://example.com/d{i}.parquet",
            mock_worker_pool,
        )
        names.append(result["name"])

    assert names == ["table1", "table2", "table3"]


# ---------------------------------------------------------------------------
# NAME-2: After removal, new dataset does NOT reuse old name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_naming_after_removal_does_not_reuse(
    fresh_db, test_conversation, mock_worker_pool
):
    """Add 3 datasets, remove table2, add new one -> name based on count.

    Per plan: _next_table_name uses COUNT(*) of existing rows + 1.
    After removing one of three, 2 remain, so next name = table3.
    The plan notes "gaps are acceptable since users can rename".
    """
    datasets = []
    for i in range(3):
        result = await add_dataset(
            fresh_db,
            test_conversation["id"],
            f"https://example.com/d{i}.parquet",
            mock_worker_pool,
        )
        datasets.append(result)

    # Remove the second dataset (table2)
    await remove_dataset(fresh_db, datasets[1]["id"])

    # Add a new dataset — count-based naming: 2 existing + 1 = table3
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/d_new.parquet",
        mock_worker_pool,
    )

    assert result["name"] != "table2"  # Must not reuse removed name
    assert result["name"] == "table3"  # count-based: 2 existing + 1 = table3


# ---------------------------------------------------------------------------
# NAME-3: Name must be valid SQL identifier
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_auto_generated_names_are_valid_sql_identifiers(
    fresh_db, test_conversation, mock_worker_pool
):
    """Auto-generated names match [a-zA-Z_][a-zA-Z0-9_]* regex."""
    sql_ident_re = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

    for i in range(5):
        result = await add_dataset(
            fresh_db,
            test_conversation["id"],
            f"https://example.com/d{i}.parquet",
            mock_worker_pool,
        )
        assert sql_ident_re.match(result["name"]), (
            f"Name {result['name']!r} is not a valid SQL identifier"
        )


# ---------------------------------------------------------------------------
# _next_table_name unit test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_next_table_name_empty_conversation(fresh_db, test_conversation):
    """With no datasets, _next_table_name returns table1."""
    name = await _next_table_name(fresh_db, test_conversation["id"])
    assert name == "table1"
