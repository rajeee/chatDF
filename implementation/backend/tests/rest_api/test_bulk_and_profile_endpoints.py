"""Tests for bulk conversation operations.

Tests:
- BULK-DEL-1 through BULK-DEL-4: POST /conversations/bulk-delete
- BULK-PIN-1 through BULK-PIN-4: POST /conversations/bulk-pin
"""

from __future__ import annotations

import pytest
import pytest_asyncio

from tests.factories import make_conversation
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
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
