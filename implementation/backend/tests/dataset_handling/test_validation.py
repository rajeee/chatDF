"""URL validation pipeline tests.

Tests: spec/backend/dataset_handling/test.md#VALIDATE-1 through VALIDATE-6
"""

from __future__ import annotations

import re
from unittest.mock import AsyncMock

import pytest

from app.services.dataset_service import add_dataset, validate_url


# ---------------------------------------------------------------------------
# VALIDATE-1: Step 1 - URL Format Check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_accepts_https():
    """HTTPS URL passes format validation."""
    validate_url("https://example.com/data.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_accepts_http():
    """HTTP URL passes format validation."""
    validate_url("http://example.com/data.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_ftp():
    """FTP URL rejected with ValueError."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("ftp://example.com/data.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_s3():
    """S3 URL rejected with ValueError."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("s3://bucket/data.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_empty_string():
    """Empty string rejected with ValueError."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_missing_scheme():
    """URL without scheme rejected."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("example.com/data.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_url_with_spaces():
    """URL with spaces rejected."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("https://example.com/my file.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_file_scheme():
    """file:// scheme rejected."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("file:///tmp/data.parquet")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_url_rejects_gs_scheme():
    """gs:// scheme rejected."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        validate_url("gs://bucket/data.parquet")


# ---------------------------------------------------------------------------
# VALIDATE-2/3/4: Worker pool validation steps (mocked)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_add_dataset_worker_validate_url_failure(
    fresh_db, test_conversation, mock_worker_pool
):
    """When worker_pool.validate_url returns error, add_dataset raises."""
    mock_worker_pool.validate_url = AsyncMock(
        return_value={"valid": False, "error": "Could not access URL"}
    )

    with pytest.raises(ValueError, match="Could not access URL"):
        await add_dataset(
            fresh_db,
            test_conversation["id"],
            "https://example.com/data.parquet",
            mock_worker_pool,
        )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_add_dataset_worker_not_parquet(
    fresh_db, test_conversation, mock_worker_pool
):
    """When worker_pool.validate_url says not parquet, add_dataset raises."""
    mock_worker_pool.validate_url = AsyncMock(
        return_value={"valid": False, "error": "Not a valid parquet file"}
    )

    with pytest.raises(ValueError, match="Not a valid parquet file"):
        await add_dataset(
            fresh_db,
            test_conversation["id"],
            "https://example.com/data.csv",
            mock_worker_pool,
        )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_add_dataset_worker_schema_extraction_failure(
    fresh_db, test_conversation, mock_worker_pool
):
    """When worker_pool.get_schema returns error, add_dataset raises."""
    mock_worker_pool.get_schema = AsyncMock(
        return_value={"error": "Could not read parquet schema"}
    )

    with pytest.raises(ValueError, match="Could not read parquet schema"):
        await add_dataset(
            fresh_db,
            test_conversation["id"],
            "https://example.com/data.parquet",
            mock_worker_pool,
        )


# ---------------------------------------------------------------------------
# VALIDATE-5: Cache schema in SQLite after successful add
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_add_dataset_caches_schema_in_db(
    fresh_db, test_conversation, mock_worker_pool
):
    """After add_dataset, schema_json, row_count, column_count stored in datasets table."""
    result = await add_dataset(
        fresh_db,
        test_conversation["id"],
        "https://example.com/data.parquet",
        mock_worker_pool,
    )

    cursor = await fresh_db.execute(
        "SELECT schema_json, row_count, column_count, status FROM datasets WHERE id = ?",
        (result["id"],),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["row_count"] == 100
    assert row["column_count"] == 2
    assert row["status"] == "ready"
    assert '"name"' in row["schema_json"]  # JSON contains column info


# ---------------------------------------------------------------------------
# VALIDATE-6: Fail-fast — earlier failures prevent later steps
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_invalid_url_format_skips_worker_calls(
    fresh_db, test_conversation, mock_worker_pool
):
    """If URL format is invalid, worker_pool.validate_url is never called."""
    with pytest.raises(ValueError, match="Invalid URL format"):
        await add_dataset(
            fresh_db,
            test_conversation["id"],
            "ftp://example.com/bad.parquet",
            mock_worker_pool,
        )

    mock_worker_pool.validate_url.assert_not_called()
    mock_worker_pool.get_schema.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_worker_validate_failure_skips_get_schema(
    fresh_db, test_conversation, mock_worker_pool
):
    """If worker_pool.validate_url fails, get_schema is never called."""
    mock_worker_pool.validate_url = AsyncMock(
        return_value={"valid": False, "error": "Could not access URL"}
    )

    with pytest.raises(ValueError, match="Could not access URL"):
        await add_dataset(
            fresh_db,
            test_conversation["id"],
            "https://example.com/data.parquet",
            mock_worker_pool,
        )

    mock_worker_pool.get_schema.assert_not_called()
