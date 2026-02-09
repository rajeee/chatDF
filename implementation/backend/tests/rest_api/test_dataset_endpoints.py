"""Dataset endpoint tests.

Tests: spec/backend/rest_api/test.md#DS-EP-1 through DS-EP-10
"""

from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_dataset
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
    insert_session,
    insert_user,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv["created_at"],
            conv["updated_at"],
        ),
    )
    await db.commit()


async def insert_dataset(db, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            ds["id"],
            ds["conversation_id"],
            ds["url"],
            ds["name"],
            ds["row_count"],
            ds["column_count"],
            ds["schema_json"],
            ds["status"],
            ds["error_message"],
            ds["loaded_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    """A conversation owned by the default test_user."""
    conv = make_conversation(user_id=test_user["id"])
    await insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def dataset_in_conversation(fresh_db, conversation_owned):
    """A single ready dataset inside conversation_owned."""
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


# ---------------------------------------------------------------------------
# DS-EP-1: POST /conversations/:id/datasets - Add Dataset (201)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_returns_201(authed_client, fresh_db, conversation_owned, mock_worker_pool):
    """POST dataset with valid URL returns 201 with dataset_id and status 'loading'."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": "https://example.com/data.parquet"},
    )

    body = assert_success_response(response, status_code=201)
    assert "dataset_id" in body
    assert body["status"] == "loading"

    # Verify dataset was persisted in the DB
    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE id = ?", (body["dataset_id"],)
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["conversation_id"] == conversation_owned["id"]
    assert row["url"] == "https://example.com/data.parquet"


# ---------------------------------------------------------------------------
# DS-EP-2: POST /conversations/:id/datasets - Invalid URL (400)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_invalid_url_returns_400(authed_client, fresh_db, conversation_owned, mock_worker_pool):
    """POST dataset with invalid URL (e.g. ftp://bad) returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": "ftp://bad"},
    )

    assert_error_response(response, 400, "Invalid URL format")


# ---------------------------------------------------------------------------
# DS-EP-3: POST /conversations/:id/datasets - Duplicate URL (400)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_duplicate_url_returns_400(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST dataset with URL already loaded in this conversation returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": dataset_in_conversation["url"]},
    )

    assert_error_response(response, 400, "This dataset is already loaded")


# ---------------------------------------------------------------------------
# DS-EP-4: POST /conversations/:id/datasets - At Limit (400)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_dataset_at_limit_returns_400(authed_client, fresh_db, conversation_owned, mock_worker_pool):
    """POST dataset when conversation already has 5 datasets returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    # Seed 5 datasets
    for i in range(5):
        ds = make_dataset(
            conversation_id=conversation_owned["id"],
            url=f"https://example.com/data{i}.parquet",
            name=f"table{i + 1}",
            status="ready",
        )
        await insert_dataset(fresh_db, ds)

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets",
        json={"url": "https://example.com/data_new.parquet"},
    )

    assert_error_response(response, 400, "Maximum 5 datasets reached")


# ---------------------------------------------------------------------------
# DS-EP-5: DELETE /conversations/:id/datasets/:dataset_id - Remove
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_dataset_returns_success(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """DELETE dataset returns 200 with {success: true} and removes from DB."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.delete(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
    )

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    # Verify dataset was removed
    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE id = ?", (dataset_id,)
    )
    row = await cursor.fetchone()
    assert row is None


# ---------------------------------------------------------------------------
# DS-EP-6: DELETE /conversations/:id/datasets/:dataset_id - Not Found (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_nonexistent_dataset_returns_404(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """DELETE dataset with nonexistent ID returns 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.delete(
        f"/conversations/{conversation_owned['id']}/datasets/nonexistent-id",
    )

    assert_error_response(response, 404)


# ---------------------------------------------------------------------------
# DS-EP-7: PATCH /conversations/:id/datasets/:dataset_id - Rename
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_dataset_updates_name(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """PATCH dataset with valid tableName returns 200 with updated name."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.patch(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
        json={"tableName": "sales_data"},
    )

    body = assert_success_response(response, status_code=200)
    assert body["id"] == dataset_id
    assert body["tableName"] == "sales_data"
    assert body["name"] == "sales_data"

    # Verify DB was updated
    cursor = await fresh_db.execute(
        "SELECT name FROM datasets WHERE id = ?", (dataset_id,)
    )
    row = await cursor.fetchone()
    assert row["name"] == "sales_data"


# ---------------------------------------------------------------------------
# DS-EP-8: PATCH /conversations/:id/datasets/:dataset_id - Not Owner (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_dataset_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """PATCH dataset on another user's conversation returns 403."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await other_user_client.patch(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}",
        json={"tableName": "sales_data"},
    )

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# DS-EP-9: POST /conversations/:id/datasets/:dataset_id/refresh - Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_refresh_schema_returns_updated_dataset(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST refresh returns 200 with updated schema fields."""
    from app.main import app

    # Configure mock to return refreshed schema
    mock_worker_pool.get_schema.return_value = {
        "columns": [
            {"name": "id", "type": "INTEGER"},
            {"name": "value", "type": "TEXT"},
            {"name": "new_col", "type": "FLOAT"},
        ],
        "row_count": 200,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/refresh",
    )

    body = assert_success_response(response, status_code=200)
    assert body["id"] == dataset_id
    assert body["row_count"] == 200
    assert body["column_count"] == 3
    assert "url" in body
    assert "name" in body


# ---------------------------------------------------------------------------
# DS-EP-10: POST /conversations/:id/datasets/:dataset_id/refresh - Not Found (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_refresh_nonexistent_dataset_returns_404(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST refresh for nonexistent dataset returns 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/nonexistent-id/refresh",
    )

    assert_error_response(response, 404)


# ---------------------------------------------------------------------------
# DS-EP-11: POST /conversations/:id/datasets/:dataset_id/preview - Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_dataset_returns_columns_and_rows(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview returns 200 with columns, rows (list-of-lists), and total_rows."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value"],
        "rows": [{"id": 1, "value": "a"}, {"id": 2, "value": "b"}],
        "total_rows": 2,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview",
    )

    body = assert_success_response(response, status_code=200)
    assert body["columns"] == ["id", "value"]
    assert body["rows"] == [[1, "a"], [2, "b"]]
    assert body["total_rows"] == dataset_in_conversation["row_count"]

    # Verify the SQL query passed to run_query
    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "LIMIT 10" in sql_arg
    datasets_arg = call_args[0][1]
    assert datasets_arg[0]["url"] == dataset_in_conversation["url"]
    assert datasets_arg[0]["table_name"] == dataset_in_conversation["name"]


# ---------------------------------------------------------------------------
# DS-EP-12: POST /conversations/:id/datasets/:dataset_id/preview - Not Found (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_nonexistent_dataset_returns_404(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST preview for nonexistent dataset returns 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/nonexistent-id/preview",
    )

    assert_error_response(response, 404)


# ---------------------------------------------------------------------------
# DS-EP-13: POST /conversations/:id/datasets/:dataset_id/preview - Worker Error (500)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_dataset_worker_error_returns_500(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview returns 500 when worker pool returns an error."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "error_type": "internal",
        "message": "Failed to read parquet file",
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview",
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Unauthenticated returns 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unauthenticated_returns_401(authed_client, conversation_owned):
    """All dataset endpoints return 401 without a session cookie."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        conv_id = conversation_owned["id"]

        resp = await unauthed.post(
            f"/conversations/{conv_id}/datasets",
            json={"url": "https://example.com/data.parquet"},
        )
        assert resp.status_code == 401

        resp = await unauthed.patch(
            f"/conversations/{conv_id}/datasets/some-id",
            json={"tableName": "foo"},
        )
        assert resp.status_code == 401

        resp = await unauthed.post(
            f"/conversations/{conv_id}/datasets/some-id/refresh",
        )
        assert resp.status_code == 401

        resp = await unauthed.delete(
            f"/conversations/{conv_id}/datasets/some-id",
        )
        assert resp.status_code == 401
