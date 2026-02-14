"""Comprehensive tests for app.services.dataset_service.

Tests: validate_url, _next_table_name, add_dataset, remove_dataset,
       refresh_schema, get_datasets, MAX_DATASETS_PER_CONVERSATION
Verifies: spec/backend/dataset_handling/plan.md
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import aiosqlite
import pytest

from .factories import make_conversation, make_dataset


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _insert_conversation(db: aiosqlite.Connection, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def _insert_dataset(db: aiosqlite.Connection, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            ds["id"], ds["conversation_id"], ds["url"], ds["name"],
            ds["row_count"], ds["column_count"], ds["schema_json"],
            ds["status"], ds["error_message"], ds["loaded_at"],
        ),
    )
    await db.commit()


async def _count_datasets(db: aiosqlite.Connection, conversation_id: str) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM datasets WHERE conversation_id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    return row["cnt"]


async def _get_dataset(db: aiosqlite.Connection, dataset_id: str) -> dict | None:
    cursor = await db.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# validate_url
# ---------------------------------------------------------------------------


class TestValidateUrl:
    """Tests for dataset_service.validate_url."""

    def test_accepts_http_url(self):
        from app.services.dataset_service import validate_url

        validate_url("http://example.com/data.csv")  # should not raise

    def test_accepts_https_url(self):
        from app.services.dataset_service import validate_url

        validate_url("https://example.com/data.parquet")  # should not raise

    def test_accepts_https_with_path_and_query(self):
        from app.services.dataset_service import validate_url

        validate_url("https://api.example.com/v2/data?key=abc&fmt=csv")

    def test_accepts_https_with_port(self):
        from app.services.dataset_service import validate_url

        validate_url("https://example.com:8080/data.csv")

    def test_rejects_empty_string(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("")

    def test_rejects_none(self):
        from app.services.dataset_service import validate_url

        with pytest.raises((ValueError, TypeError)):
            validate_url(None)  # type: ignore[arg-type]

    def test_rejects_ftp_scheme(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("ftp://example.com/data.csv")

    def test_rejects_no_scheme(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("example.com/data.csv")

    def test_rejects_url_with_spaces(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("https://example.com/my file.csv")

    def test_rejects_just_scheme(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("https://")

    def test_rejects_file_scheme(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("file:///etc/passwd")

    def test_rejects_javascript_scheme(self):
        from app.services.dataset_service import validate_url

        with pytest.raises(ValueError, match="Invalid URL format"):
            validate_url("javascript:alert(1)")


# ---------------------------------------------------------------------------
# _next_table_name
# ---------------------------------------------------------------------------


class TestNextTableName:
    """Tests for dataset_service._next_table_name."""

    async def test_returns_table1_for_empty_conversation(self, fresh_db, test_user):
        from app.services.dataset_service import _next_table_name

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        name = await _next_table_name(fresh_db, conv["id"])
        assert name == "table1"

    async def test_returns_table2_for_one_dataset(self, fresh_db, test_user):
        from app.services.dataset_service import _next_table_name

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"], name="table1")
        await _insert_dataset(fresh_db, ds)

        name = await _next_table_name(fresh_db, conv["id"])
        assert name == "table2"

    async def test_returns_table3_for_two_datasets(self, fresh_db, test_user):
        from app.services.dataset_service import _next_table_name

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        for i in range(2):
            ds = make_dataset(
                conversation_id=conv["id"],
                name=f"table{i+1}",
                url=f"https://example.com/d{i}.csv",
            )
            await _insert_dataset(fresh_db, ds)

        name = await _next_table_name(fresh_db, conv["id"])
        assert name == "table3"

    async def test_independent_per_conversation(self, fresh_db, test_user):
        from app.services.dataset_service import _next_table_name

        conv1 = make_conversation(user_id=test_user["id"])
        conv2 = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv1)
        await _insert_conversation(fresh_db, conv2)

        # Add dataset to conv1 only
        ds = make_dataset(conversation_id=conv1["id"])
        await _insert_dataset(fresh_db, ds)

        assert await _next_table_name(fresh_db, conv1["id"]) == "table2"
        assert await _next_table_name(fresh_db, conv2["id"]) == "table1"


# ---------------------------------------------------------------------------
# MAX_DATASETS_PER_CONVERSATION
# ---------------------------------------------------------------------------


class TestMaxDatasetsConstant:
    """Tests for the MAX_DATASETS_PER_CONVERSATION constant."""

    def test_value_is_50(self):
        from app.services.dataset_service import MAX_DATASETS_PER_CONVERSATION

        assert MAX_DATASETS_PER_CONVERSATION == 50

    def test_is_int(self):
        from app.services.dataset_service import MAX_DATASETS_PER_CONVERSATION

        assert isinstance(MAX_DATASETS_PER_CONVERSATION, int)


# ---------------------------------------------------------------------------
# add_dataset
# ---------------------------------------------------------------------------


class TestAddDataset:
    """Tests for dataset_service.add_dataset."""

    async def test_full_pipeline_success(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        result = await add_dataset(
            fresh_db, conv["id"], "https://example.com/data.parquet", mock_worker_pool
        )

        assert result["conversation_id"] == conv["id"]
        assert result["url"] == "https://example.com/data.parquet"
        assert result["status"] == "ready"
        assert result["error_message"] is None
        assert result["id"] is not None
        assert result["schema_json"] is not None

    async def test_auto_generates_table_name_when_none(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        result = await add_dataset(
            fresh_db, conv["id"], "https://example.com/data1.csv", mock_worker_pool
        )
        assert result["name"] == "table1"

    async def test_uses_provided_name(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        result = await add_dataset(
            fresh_db, conv["id"], "https://example.com/sales.csv", mock_worker_pool,
            name="sales_data",
        )
        assert result["name"] == "sales_data"

    async def test_persists_to_database(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        result = await add_dataset(
            fresh_db, conv["id"], "https://example.com/persist.csv", mock_worker_pool
        )

        row = await _get_dataset(fresh_db, result["id"])
        assert row is not None
        assert row["url"] == "https://example.com/persist.csv"
        assert row["status"] == "ready"

    async def test_stores_schema_from_worker(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        result = await add_dataset(
            fresh_db, conv["id"], "https://example.com/schema.csv", mock_worker_pool
        )

        # mock_worker_pool.get_schema returns columns with id and value
        schema = json.loads(result["schema_json"])
        assert len(schema) == 2
        assert result["column_count"] == 2
        assert result["row_count"] == 100

    async def test_calls_worker_validate_url(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        await add_dataset(
            fresh_db, conv["id"], "https://example.com/validated.csv", mock_worker_pool
        )

        mock_worker_pool.validate_url.assert_called_once_with("https://example.com/validated.csv")

    async def test_calls_worker_get_schema(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        await add_dataset(
            fresh_db, conv["id"], "https://example.com/schemaed.csv", mock_worker_pool
        )

        mock_worker_pool.get_schema.assert_called_once_with("https://example.com/schemaed.csv")

    async def test_raises_for_invalid_url_format(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        with pytest.raises(ValueError, match="Invalid URL format"):
            await add_dataset(fresh_db, conv["id"], "not-a-url", mock_worker_pool)

    async def test_raises_for_duplicate_url(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        url = "https://example.com/dup.csv"
        await add_dataset(fresh_db, conv["id"], url, mock_worker_pool)

        with pytest.raises(ValueError, match="already loaded"):
            await add_dataset(fresh_db, conv["id"], url, mock_worker_pool)

    async def test_raises_when_max_datasets_reached(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import MAX_DATASETS_PER_CONVERSATION, add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        # Insert MAX datasets directly into DB
        for i in range(MAX_DATASETS_PER_CONVERSATION):
            ds = make_dataset(
                conversation_id=conv["id"],
                name=f"table{i+1}",
                url=f"https://example.com/data{i}.csv",
            )
            await _insert_dataset(fresh_db, ds)

        with pytest.raises(ValueError, match="Maximum 50 datasets"):
            await add_dataset(
                fresh_db, conv["id"], "https://example.com/one-too-many.csv", mock_worker_pool
            )

    async def test_raises_when_worker_validation_fails(self, fresh_db, test_user):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        pool = AsyncMock()
        pool.validate_url = AsyncMock(return_value={"valid": False, "error": "404 Not Found"})

        with pytest.raises(ValueError, match="404 Not Found"):
            await add_dataset(fresh_db, conv["id"], "https://example.com/missing.csv", pool)

    async def test_raises_when_worker_validation_fails_no_error_msg(self, fresh_db, test_user):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        pool = AsyncMock()
        pool.validate_url = AsyncMock(return_value={"valid": False})

        with pytest.raises(ValueError, match="Could not access URL"):
            await add_dataset(fresh_db, conv["id"], "https://example.com/unreachable.csv", pool)

    async def test_raises_when_schema_extraction_fails(self, fresh_db, test_user):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        pool = AsyncMock()
        pool.validate_url = AsyncMock(return_value={"valid": True})
        pool.get_schema = AsyncMock(return_value={"error": "Unsupported file format"})

        with pytest.raises(ValueError, match="Unsupported file format"):
            await add_dataset(fresh_db, conv["id"], "https://example.com/bad.xyz", pool)

    async def test_auto_name_increments(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        r1 = await add_dataset(
            fresh_db, conv["id"], "https://example.com/a.csv", mock_worker_pool
        )
        r2 = await add_dataset(
            fresh_db, conv["id"], "https://example.com/b.csv", mock_worker_pool
        )

        assert r1["name"] == "table1"
        assert r2["name"] == "table2"

    async def test_same_url_different_conversations(self, fresh_db, test_user, mock_worker_pool):
        """Same URL is allowed in different conversations."""
        from app.services.dataset_service import add_dataset

        conv1 = make_conversation(user_id=test_user["id"])
        conv2 = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv1)
        await _insert_conversation(fresh_db, conv2)

        url = "https://example.com/shared.csv"
        r1 = await add_dataset(fresh_db, conv1["id"], url, mock_worker_pool)
        r2 = await add_dataset(fresh_db, conv2["id"], url, mock_worker_pool)

        assert r1["id"] != r2["id"]
        assert r1["conversation_id"] == conv1["id"]
        assert r2["conversation_id"] == conv2["id"]

    async def test_stores_file_size_bytes(self, fresh_db, test_user):
        from app.services.dataset_service import add_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        pool = AsyncMock()
        pool.validate_url = AsyncMock(return_value={"valid": True, "file_size_bytes": 12345})
        pool.get_schema = AsyncMock(
            return_value={"columns": [{"name": "id", "type": "INTEGER"}], "row_count": 10}
        )

        result = await add_dataset(fresh_db, conv["id"], "https://example.com/sized.csv", pool)
        assert result["file_size_bytes"] == 12345


# ---------------------------------------------------------------------------
# remove_dataset
# ---------------------------------------------------------------------------


class TestRemoveDataset:
    """Tests for dataset_service.remove_dataset."""

    async def test_deletes_dataset(self, fresh_db, test_user):
        from app.services.dataset_service import remove_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"])
        await _insert_dataset(fresh_db, ds)
        assert await _get_dataset(fresh_db, ds["id"]) is not None

        await remove_dataset(fresh_db, ds["id"])
        assert await _get_dataset(fresh_db, ds["id"]) is None

    async def test_no_op_for_nonexistent_dataset(self, fresh_db):
        from app.services.dataset_service import remove_dataset

        # Should not raise
        await remove_dataset(fresh_db, "nonexistent-dataset-id")

    async def test_does_not_affect_other_datasets(self, fresh_db, test_user):
        from app.services.dataset_service import remove_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds1 = make_dataset(conversation_id=conv["id"], url="https://a.com/1.csv", name="t1")
        ds2 = make_dataset(conversation_id=conv["id"], url="https://a.com/2.csv", name="t2")
        await _insert_dataset(fresh_db, ds1)
        await _insert_dataset(fresh_db, ds2)

        await remove_dataset(fresh_db, ds1["id"])
        assert await _get_dataset(fresh_db, ds1["id"]) is None
        assert await _get_dataset(fresh_db, ds2["id"]) is not None

    async def test_deletes_uploaded_file_on_removal(self, fresh_db, test_user):
        """Deleting an uploaded dataset (file:// URL) should remove the physical file."""
        from app.config import get_settings
        from app.services.dataset_service import remove_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        # Create a real temp file inside the uploads dir (path traversal guard
        # only allows deletion within upload_dir).
        upload_dir = os.path.abspath(get_settings().upload_dir)
        os.makedirs(upload_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".parquet", dir=upload_dir
        ) as f:
            f.write(b"PAR1fakecontent")
            temp_path = f.name

        try:
            ds = make_dataset(
                conversation_id=conv["id"],
                url=f"file://{temp_path}",
            )
            await _insert_dataset(fresh_db, ds)
            assert os.path.exists(temp_path)

            await remove_dataset(fresh_db, ds["id"])

            assert not os.path.exists(temp_path), "Physical file should be deleted"
            assert await _get_dataset(fresh_db, ds["id"]) is None
        finally:
            # Safety cleanup in case the test fails before removal
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    async def test_does_not_delete_file_for_http_url(self, fresh_db, test_user):
        """Deleting a URL-based dataset should NOT attempt file cleanup."""
        from app.services.dataset_service import remove_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/data.parquet",
        )
        await _insert_dataset(fresh_db, ds)

        with patch("app.services.dataset_service.os.unlink") as mock_unlink:
            await remove_dataset(fresh_db, ds["id"])
            mock_unlink.assert_not_called()

        assert await _get_dataset(fresh_db, ds["id"]) is None

    async def test_graceful_when_file_already_missing(self, fresh_db, test_user):
        """Deleting an uploaded dataset whose file is already gone should not raise."""
        from app.services.dataset_service import remove_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        # Use a path that does not exist
        nonexistent_path = "/tmp/chatdf_test_nonexistent_file_12345.parquet"
        assert not os.path.exists(nonexistent_path)

        ds = make_dataset(
            conversation_id=conv["id"],
            url=f"file://{nonexistent_path}",
        )
        await _insert_dataset(fresh_db, ds)

        # Should not raise even though file doesn't exist
        await remove_dataset(fresh_db, ds["id"])
        assert await _get_dataset(fresh_db, ds["id"]) is None

    async def test_graceful_on_os_permission_error(self, fresh_db, test_user):
        """If os.unlink raises a non-FileNotFoundError OSError, deletion still succeeds."""
        from app.services.dataset_service import remove_dataset

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="file:///some/protected/file.parquet",
        )
        await _insert_dataset(fresh_db, ds)

        with patch(
            "app.services.dataset_service.os.unlink",
            side_effect=PermissionError("Permission denied"),
        ):
            # Should not raise -- the DB row should still be deleted
            await remove_dataset(fresh_db, ds["id"])

        assert await _get_dataset(fresh_db, ds["id"]) is None


# ---------------------------------------------------------------------------
# refresh_schema
# ---------------------------------------------------------------------------


class TestRefreshSchema:
    """Tests for dataset_service.refresh_schema."""

    async def test_updates_schema_for_existing_dataset(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import refresh_schema

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/refresh.csv",
            schema_json="[]",
            row_count=0,
            column_count=0,
            status="ready",
        )
        await _insert_dataset(fresh_db, ds)

        # mock_worker_pool returns 2 columns and 100 rows
        result = await refresh_schema(fresh_db, ds["id"], mock_worker_pool)

        assert result["row_count"] == 100
        assert result["column_count"] == 2
        schema = json.loads(result["schema_json"])
        assert len(schema) == 2

    async def test_raises_for_nonexistent_dataset(self, fresh_db, mock_worker_pool):
        from app.services.dataset_service import refresh_schema

        with pytest.raises(ValueError, match="Dataset not found"):
            await refresh_schema(fresh_db, "no-such-dataset", mock_worker_pool)

    async def test_calls_worker_validate_url_with_dataset_url(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import refresh_schema

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        url = "https://example.com/check-url.csv"
        ds = make_dataset(conversation_id=conv["id"], url=url, status="ready")
        await _insert_dataset(fresh_db, ds)

        await refresh_schema(fresh_db, ds["id"], mock_worker_pool)
        mock_worker_pool.validate_url.assert_called_with(url)

    async def test_raises_when_validation_fails(self, fresh_db, test_user):
        from app.services.dataset_service import refresh_schema

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"], status="ready")
        await _insert_dataset(fresh_db, ds)

        pool = AsyncMock()
        pool.validate_url = AsyncMock(return_value={"valid": False, "error": "URL no longer accessible"})

        with pytest.raises(ValueError, match="URL no longer accessible"):
            await refresh_schema(fresh_db, ds["id"], pool)

    async def test_raises_when_schema_extraction_fails(self, fresh_db, test_user):
        from app.services.dataset_service import refresh_schema

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"], status="ready")
        await _insert_dataset(fresh_db, ds)

        pool = AsyncMock()
        pool.validate_url = AsyncMock(return_value={"valid": True})
        pool.get_schema = AsyncMock(return_value={"error": "Corrupt file"})

        with pytest.raises(ValueError, match="Corrupt file"):
            await refresh_schema(fresh_db, ds["id"], pool)

    async def test_updates_loaded_at(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import refresh_schema

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            status="ready",
            loaded_at="2020-01-01T00:00:00",
        )
        await _insert_dataset(fresh_db, ds)

        result = await refresh_schema(fresh_db, ds["id"], mock_worker_pool)
        # loaded_at should be updated to a recent time
        assert result["loaded_at"] > "2020-01-01T00:00:00"

    async def test_returns_full_dataset_dict(self, fresh_db, test_user, mock_worker_pool):
        from app.services.dataset_service import refresh_schema

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"], status="ready", name="mydata")
        await _insert_dataset(fresh_db, ds)

        result = await refresh_schema(fresh_db, ds["id"], mock_worker_pool)
        assert result["id"] == ds["id"]
        assert result["name"] == "mydata"
        assert result["conversation_id"] == conv["id"]
        assert "url" in result
        assert "schema_json" in result


# ---------------------------------------------------------------------------
# get_datasets
# ---------------------------------------------------------------------------


class TestGetDatasets:
    """Tests for dataset_service.get_datasets."""

    async def test_returns_empty_list_for_no_datasets(self, fresh_db, test_user):
        from app.services.dataset_service import get_datasets

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        result = await get_datasets(fresh_db, conv["id"])
        assert result == []

    async def test_returns_all_datasets_for_conversation(self, fresh_db, test_user):
        from app.services.dataset_service import get_datasets

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        for i in range(3):
            ds = make_dataset(
                conversation_id=conv["id"],
                name=f"table{i+1}",
                url=f"https://example.com/{i}.csv",
            )
            await _insert_dataset(fresh_db, ds)

        result = await get_datasets(fresh_db, conv["id"])
        assert len(result) == 3

    async def test_ordered_by_loaded_at(self, fresh_db, test_user):
        from app.services.dataset_service import get_datasets

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds_early = make_dataset(
            conversation_id=conv["id"],
            name="early",
            url="https://example.com/early.csv",
            loaded_at="2024-01-01T00:00:00",
        )
        ds_late = make_dataset(
            conversation_id=conv["id"],
            name="late",
            url="https://example.com/late.csv",
            loaded_at="2024-12-31T23:59:59",
        )
        # Insert in reverse order
        await _insert_dataset(fresh_db, ds_late)
        await _insert_dataset(fresh_db, ds_early)

        result = await get_datasets(fresh_db, conv["id"])
        assert result[0]["name"] == "early"
        assert result[1]["name"] == "late"

    async def test_does_not_return_datasets_from_other_conversations(self, fresh_db, test_user):
        from app.services.dataset_service import get_datasets

        conv1 = make_conversation(user_id=test_user["id"])
        conv2 = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv1)
        await _insert_conversation(fresh_db, conv2)

        ds1 = make_dataset(conversation_id=conv1["id"], url="https://a.com/1.csv")
        ds2 = make_dataset(conversation_id=conv2["id"], url="https://b.com/2.csv")
        await _insert_dataset(fresh_db, ds1)
        await _insert_dataset(fresh_db, ds2)

        result1 = await get_datasets(fresh_db, conv1["id"])
        result2 = await get_datasets(fresh_db, conv2["id"])
        assert len(result1) == 1
        assert len(result2) == 1
        assert result1[0]["id"] == ds1["id"]
        assert result2[0]["id"] == ds2["id"]

    async def test_returns_dicts_with_expected_keys(self, fresh_db, test_user):
        from app.services.dataset_service import get_datasets

        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"])
        await _insert_dataset(fresh_db, ds)

        result = await get_datasets(fresh_db, conv["id"])
        assert len(result) == 1
        row = result[0]
        expected_keys = {
            "id", "conversation_id", "url", "name", "row_count",
            "column_count", "schema_json", "status", "error_message",
            "loaded_at", "file_size_bytes", "column_descriptions",
        }
        assert set(row.keys()) == expected_keys

    async def test_returns_empty_for_nonexistent_conversation(self, fresh_db):
        from app.services.dataset_service import get_datasets

        result = await get_datasets(fresh_db, "nonexistent-conv-id")
        assert result == []
