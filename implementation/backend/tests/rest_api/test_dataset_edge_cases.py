"""Edge-case tests for dataset endpoints."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_dataset
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
    insert_user,
    insert_session,
)
from tests.factories import make_user, make_session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv):
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def insert_dataset(db, ds):
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ds["id"], ds["conversation_id"], ds["url"], ds["name"], ds["row_count"], ds["column_count"], ds["schema_json"], ds["status"], ds["error_message"], ds["loaded_at"]),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    conv = make_conversation(user_id=test_user["id"])
    await insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def dataset_in_conversation(fresh_db, conversation_owned):
    ds = make_dataset(
        conversation_id=conversation_owned["id"],
        url="https://example.com/data.parquet",
        name="table1",
        row_count=100,
        column_count=2,
        schema_json=json.dumps([{"name": "id", "type": "INTEGER"}, {"name": "value", "type": "TEXT"}]),
        status="ready",
    )
    await insert_dataset(fresh_db, ds)
    return ds


# ===========================================================================
# 1. Rename validation edge cases
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_to_empty_string_returns_422(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """PATCH with empty tableName should fail validation (min_length=1)."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.patch(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
        json={"tableName": ""},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_to_very_long_name_returns_422(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """PATCH with tableName over 50 chars should fail validation (max_length=50)."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    long_name = "a" * 101
    response = await authed_client.patch(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
        json={"tableName": long_name},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_with_special_chars_returns_422(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """PATCH with spaces, dots, dashes in tableName should fail (pattern is ^[a-zA-Z_][a-zA-Z0-9_]*$)."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    invalid_names = ["table with spaces", "table.name", "table-name", "1starts_with_digit", "'; DROP TABLE--"]

    for name in invalid_names:
        response = await authed_client.patch(
            f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
            json={"tableName": name},
        )
        assert response.status_code == 422, f"Expected 422 for tableName={name!r}, got {response.status_code}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_with_valid_identifier_succeeds(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """PATCH with valid SQL identifier (letters, digits, underscores) should succeed."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    valid_names = ["sales_data", "_private", "Table1", "a"]

    for name in valid_names:
        response = await authed_client.patch(
            f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
            json={"tableName": name},
        )
        body = assert_success_response(response, status_code=200)
        assert body["tableName"] == name, f"Expected tableName={name!r}, got {body['tableName']!r}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_nonexistent_dataset_returns_404(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """PATCH on a dataset ID that does not exist should return 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    fake_id = str(uuid4())
    response = await authed_client.patch(
        f"/conversations/{conversation_owned['id']}/datasets/{fake_id}",
        json={"tableName": "new_name"},
    )

    assert_error_response(response, 404)


# ===========================================================================
# 2. Preview with different sampling modes
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_tail_sampling(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=tail should use DESC ordering in SQL."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value"],
        "rows": [{"id": 100, "value": "z"}, {"id": 99, "value": "y"}],
        "total_rows": 2,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview?sample_method=tail",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "tail"
    # The _rn internal column should be filtered out
    assert "_rn" not in body["columns"]

    # Verify SQL uses DESC ordering
    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "DESC" in sql_arg
    assert "ROW_NUMBER()" in sql_arg


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_stratified_without_column_returns_400(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with method=stratified but no sample_column should return 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview?sample_method=stratified",
    )

    assert_error_response(response, 400, "sample_column is required")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_percentage_sampling(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with method=percentage and sample_percentage=10 should compute row count from total."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value"],
        "rows": [{"id": i, "value": f"v{i}"} for i in range(10)],
        "total_rows": 10,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=percentage&sample_percentage=10",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "percentage"

    # 10% of 100 rows = 10 rows limit
    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "LIMIT 10" in sql_arg
    assert "ORDER BY RANDOM()" in sql_arg


# ===========================================================================
# 4. Delete cascade verification
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_dataset_verified_gone_from_db(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """DELETE dataset and verify both the HTTP response and that the DB row is removed."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]

    # Verify it exists before deleting
    cursor = await fresh_db.execute("SELECT COUNT(*) AS cnt FROM datasets WHERE id = ?", (dataset_id,))
    row = await cursor.fetchone()
    assert row["cnt"] == 1

    response = await authed_client.delete(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
    )

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    # Verify it's gone
    cursor = await fresh_db.execute("SELECT COUNT(*) AS cnt FROM datasets WHERE id = ?", (dataset_id,))
    row = await cursor.fetchone()
    assert row["cnt"] == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_dataset_from_different_conversation_returns_404(
    authed_client, fresh_db, test_user, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """DELETE a dataset using a different conversation ID should return 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    # Create a second conversation owned by the same user
    conv2 = make_conversation(user_id=test_user["id"])
    await insert_conversation(fresh_db, conv2)

    # Try to delete the dataset using the second conversation's ID
    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.delete(
        f"/conversations/{conv2['id']}/datasets/{dataset_id}",
    )

    assert_error_response(response, 404)

    # Verify the dataset still exists (not deleted)
    cursor = await fresh_db.execute("SELECT COUNT(*) AS cnt FROM datasets WHERE id = ?", (dataset_id,))
    row = await cursor.fetchone()
    assert row["cnt"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_dataset_other_user_returns_403(
    other_user_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """DELETE dataset by a different user should return 403."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await other_user_client.delete(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
    )

    assert response.status_code == 403

    # Verify the dataset still exists
    cursor = await fresh_db.execute("SELECT COUNT(*) AS cnt FROM datasets WHERE id = ?", (dataset_id,))
    row = await cursor.fetchone()
    assert row["cnt"] == 1


# ===========================================================================
# 5. Add dataset validation
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_private_ip_ssrf_rejected(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST dataset with private IP URL should be rejected when worker validates.

    The SSRF check happens in the worker pool's validate_url step (step 4).
    The service raises ValueError which the router converts to 400.
    """
    from app.main import app

    mock_worker_pool.validate_url = AsyncMock(
        return_value={
            "valid": False,
            "error": "URLs pointing to internal/private networks are not allowed.",
            "error_type": "validation",
        }
    )
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": "https://192.168.1.1/data.parquet"},
    )

    assert_error_response(response, 400, "internal/private")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_localhost_ssrf_rejected(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST dataset with localhost URL should be rejected by SSRF protection."""
    from app.main import app

    mock_worker_pool.validate_url = AsyncMock(
        return_value={
            "valid": False,
            "error": "URLs pointing to internal/private networks are not allowed.",
            "error_type": "validation",
        }
    )
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": "https://127.0.0.1/data.parquet"},
    )

    assert_error_response(response, 400, "internal/private")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_very_long_url(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST dataset with very long URL (2000+ chars) should still pass format check and reach worker validation."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    # URL format is valid (http://), just very long path
    long_path = "a" * 2000
    long_url = f"https://example.com/{long_path}.parquet"

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": long_url},
    )

    # Should reach the worker_pool (format is valid), so we expect 201 since mock returns valid
    body = assert_success_response(response, status_code=201)
    assert "dataset_id" in body
    assert body["status"] == "loading"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_missing_url_returns_422(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST dataset without the required url field should return 422."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={},
    )

    assert response.status_code == 422
