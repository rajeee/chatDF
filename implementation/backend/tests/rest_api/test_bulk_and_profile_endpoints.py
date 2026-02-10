"""Tests for bulk conversation operations and dataset profiling endpoints.

Tests:
- BULK-DEL-1 through BULK-DEL-4: POST /conversations/bulk-delete
- BULK-PIN-1 through BULK-PIN-4: POST /conversations/bulk-pin
- PROF-1 through PROF-3: POST /conversations/:id/datasets/:id/profile
- PROF-COL-1 through PROF-COL-2: POST /conversations/:id/datasets/:id/profile-column
"""

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
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def insert_dataset(db, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ds["id"], ds["conversation_id"], ds["url"], ds["name"], ds["row_count"], ds["column_count"], ds["schema_json"], ds["status"], ds["error_message"], ds["loaded_at"]),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    """A conversation owned by the default test_user."""
    conv = make_conversation(user_id=test_user["id"], title="Test Conv")
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


# ===========================================================================
# POST /conversations/bulk-delete
# ===========================================================================


# ---------------------------------------------------------------------------
# BULK-DEL-1: Bulk delete success - delete 2 owned conversations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_success(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-delete deletes owned conversations and returns deleted count."""
    conv1 = make_conversation(user_id=test_user["id"], title="Conv 1")
    conv2 = make_conversation(user_id=test_user["id"], title="Conv 2")
    await insert_conversation(fresh_db, conv1)
    await insert_conversation(fresh_db, conv2)

    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": [conv1["id"], conv2["id"]]},
    )

    body = assert_success_response(response, status_code=200)
    assert body["deleted"] == 2

    # Verify both conversations are gone from DB
    for conv_id in [conv1["id"], conv2["id"]]:
        cursor = await fresh_db.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        )
        assert await cursor.fetchone() is None


# ---------------------------------------------------------------------------
# BULK-DEL-2: Bulk delete with empty IDs returns 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_empty_ids(authed_client, fresh_db):
    """POST /conversations/bulk-delete with empty ids list returns 400."""
    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": []},
    )

    assert_error_response(response, 400, "1-50")


# ---------------------------------------------------------------------------
# BULK-DEL-3: Bulk delete skips other user's conversations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_skips_other_user(authed_client, other_user_client, fresh_db, test_user):
    """POST /conversations/bulk-delete only deletes owned conversations, skips others."""
    # Create one conversation owned by test_user
    conv_mine = make_conversation(user_id=test_user["id"], title="My Conv")
    await insert_conversation(fresh_db, conv_mine)

    # Create one conversation owned by other-user
    conv_other = make_conversation(user_id="other-user", title="Other Conv")
    await insert_conversation(fresh_db, conv_other)

    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": [conv_mine["id"], conv_other["id"]]},
    )

    body = assert_success_response(response, status_code=200)
    assert body["deleted"] == 1

    # Verify only mine was deleted
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_mine["id"],)
    )
    assert await cursor.fetchone() is None

    # Other user's conversation should still exist
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_other["id"],)
    )
    assert await cursor.fetchone() is not None


# ---------------------------------------------------------------------------
# BULK-DEL-4: Bulk delete with nonexistent IDs silently skips (deleted=0)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_nonexistent(authed_client, fresh_db):
    """POST /conversations/bulk-delete with nonexistent IDs returns deleted=0."""
    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": ["nonexistent-1", "nonexistent-2"]},
    )

    body = assert_success_response(response, status_code=200)
    assert body["deleted"] == 0


# ===========================================================================
# POST /conversations/bulk-pin
# ===========================================================================


# ---------------------------------------------------------------------------
# BULK-PIN-1: Bulk pin success - pin 2 conversations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_pin_success(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-pin pins owned conversations and returns updated count."""
    conv1 = make_conversation(user_id=test_user["id"], title="Conv 1")
    conv2 = make_conversation(user_id=test_user["id"], title="Conv 2")
    await insert_conversation(fresh_db, conv1)
    await insert_conversation(fresh_db, conv2)

    response = await authed_client.post(
        "/conversations/bulk-pin",
        json={"ids": [conv1["id"], conv2["id"]], "is_pinned": True},
    )

    body = assert_success_response(response, status_code=200)
    assert body["updated"] == 2

    # Verify both conversations are pinned in DB
    for conv_id in [conv1["id"], conv2["id"]]:
        cursor = await fresh_db.execute(
            "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
        )
        row = await cursor.fetchone()
        assert row["is_pinned"] == 1


# ---------------------------------------------------------------------------
# BULK-PIN-2: Bulk unpin - set is_pinned=false
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_pin_unpin(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-pin with is_pinned=false unpins conversations."""
    conv1 = make_conversation(user_id=test_user["id"], title="Pinned Conv 1")
    conv2 = make_conversation(user_id=test_user["id"], title="Pinned Conv 2")
    await insert_conversation(fresh_db, conv1)
    await insert_conversation(fresh_db, conv2)

    # First pin them
    for conv_id in [conv1["id"], conv2["id"]]:
        await fresh_db.execute(
            "UPDATE conversations SET is_pinned = 1 WHERE id = ?", (conv_id,)
        )
    await fresh_db.commit()

    # Now unpin via bulk endpoint
    response = await authed_client.post(
        "/conversations/bulk-pin",
        json={"ids": [conv1["id"], conv2["id"]], "is_pinned": False},
    )

    body = assert_success_response(response, status_code=200)
    assert body["updated"] == 2

    # Verify both are unpinned
    for conv_id in [conv1["id"], conv2["id"]]:
        cursor = await fresh_db.execute(
            "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
        )
        row = await cursor.fetchone()
        assert row["is_pinned"] == 0


# ---------------------------------------------------------------------------
# BULK-PIN-3: Bulk pin with empty IDs returns 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_pin_empty_ids(authed_client, fresh_db):
    """POST /conversations/bulk-pin with empty ids list returns 400."""
    response = await authed_client.post(
        "/conversations/bulk-pin",
        json={"ids": [], "is_pinned": True},
    )

    assert_error_response(response, 400, "1-50")


# ---------------------------------------------------------------------------
# BULK-PIN-4: Bulk pin skips other user's conversations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_pin_skips_other_user(authed_client, other_user_client, fresh_db, test_user):
    """POST /conversations/bulk-pin only updates owned conversations, skips others."""
    conv_mine = make_conversation(user_id=test_user["id"], title="My Conv")
    await insert_conversation(fresh_db, conv_mine)

    conv_other = make_conversation(user_id="other-user", title="Other Conv")
    await insert_conversation(fresh_db, conv_other)

    response = await authed_client.post(
        "/conversations/bulk-pin",
        json={"ids": [conv_mine["id"], conv_other["id"]], "is_pinned": True},
    )

    body = assert_success_response(response, status_code=200)
    assert body["updated"] == 1

    # Only mine should be pinned
    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv_mine["id"],)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 1

    # Other user's conversation should remain unpinned
    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv_other["id"],)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 0


# ===========================================================================
# POST /conversations/{conv_id}/datasets/{dataset_id}/profile
# ===========================================================================


# ---------------------------------------------------------------------------
# PROF-1: Profile dataset success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_profile_dataset_success(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST profile returns profiling data when worker_pool succeeds."""
    from app.main import app

    mock_worker_pool.profile_columns.return_value = {
        "profiles": [
            {"column": "id", "type": "INTEGER", "min": 1, "max": 100, "null_count": 0},
            {"column": "value", "type": "TEXT", "unique_count": 50, "null_count": 2},
        ],
    }
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_in_conversation['id']}/profile",
    )

    body = assert_success_response(response, status_code=200)
    assert "profiles" in body
    assert len(body["profiles"]) == 2
    assert body["profiles"][0]["column"] == "id"


# ---------------------------------------------------------------------------
# PROF-2: Profile dataset error - worker returns error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_profile_dataset_error(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST profile returns 500 when worker_pool returns an error."""
    from app.main import app

    mock_worker_pool.profile_columns.return_value = {"error": "Failed to read file"}
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_in_conversation['id']}/profile",
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# PROF-3: Profile dataset not found - invalid dataset_id returns 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_profile_dataset_not_found(
    authed_client, fresh_db, conversation_owned, mock_worker_pool
):
    """POST profile for nonexistent dataset returns 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/nonexistent-id/profile",
    )

    assert_error_response(response, 404)


# ===========================================================================
# POST /conversations/{conv_id}/datasets/{dataset_id}/profile-column
# ===========================================================================


# ---------------------------------------------------------------------------
# PROF-COL-1: Profile single column success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_profile_column_success(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST profile-column returns detailed column profiling data."""
    from app.main import app

    mock_worker_pool.profile_column.return_value = {
        "column": "id",
        "type": "INTEGER",
        "min": 1,
        "max": 100,
        "mean": 50.5,
        "null_count": 0,
        "histogram": [10, 20, 30, 20, 10, 5, 3, 1, 0, 1],
    }
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_in_conversation['id']}/profile-column",
        json={"column_name": "id", "column_type": "Int64"},
    )

    body = assert_success_response(response, status_code=200)
    assert body["column"] == "id"
    assert body["min"] == 1
    assert body["max"] == 100

    # Verify the correct arguments were passed to worker_pool.profile_column
    mock_worker_pool.profile_column.assert_called_once_with(
        dataset_in_conversation["url"],
        dataset_in_conversation["name"],
        "id",
        "Int64",
    )


# ---------------------------------------------------------------------------
# PROF-COL-2: Profile single column error - worker returns error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_profile_column_error(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST profile-column returns 500 when worker_pool returns an error."""
    from app.main import app

    mock_worker_pool.profile_column.return_value = {"error": "Column not found"}
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_in_conversation['id']}/profile-column",
        json={"column_name": "nonexistent", "column_type": "Int64"},
    )

    assert response.status_code == 500
