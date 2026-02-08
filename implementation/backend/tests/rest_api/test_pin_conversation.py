"""Tests for conversation pinning feature.

Tests:
- PIN-1: PATCH /conversations/:id/pin toggles is_pinned
- PIN-2: Pinned conversations appear first in list
- PIN-3: Pin endpoint returns correct response
- PIN-4: Unpinning a conversation works
- PIN-5: Pin endpoint requires authentication (403 for other user)
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio

from tests.factories import make_conversation
from tests.rest_api.conftest import (
    assert_success_response,
    insert_session,
    insert_user,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, is_pinned, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv.get("is_pinned", 0),
            conv["created_at"],
            conv["updated_at"],
        ),
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


# ---------------------------------------------------------------------------
# PIN-1: PATCH /conversations/:id/pin - Pin a conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pin_conversation(authed_client, fresh_db, conversation_owned):
    """PATCH /conversations/:id/pin with is_pinned=true pins the conversation."""
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}/pin",
        json={"is_pinned": True},
    )

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert body["is_pinned"] is True
    assert "updated_at" in body

    # Verify DB was updated
    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 1


# ---------------------------------------------------------------------------
# PIN-2: Pinned conversations appear first in list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pinned_conversations_appear_first(authed_client, fresh_db, test_user):
    """GET /conversations returns pinned conversations before unpinned ones."""
    now = datetime.utcnow()

    # Create an older pinned conversation
    conv_pinned = make_conversation(
        user_id=test_user["id"],
        title="Pinned Conv",
        created_at=(now - timedelta(hours=5)).isoformat(),
        updated_at=(now - timedelta(hours=5)).isoformat(),
    )
    conv_pinned["is_pinned"] = 1

    # Create a newer unpinned conversation
    conv_recent = make_conversation(
        user_id=test_user["id"],
        title="Recent Conv",
        created_at=(now - timedelta(hours=1)).isoformat(),
        updated_at=(now - timedelta(hours=1)).isoformat(),
    )

    await insert_conversation(fresh_db, conv_pinned)
    await insert_conversation(fresh_db, conv_recent)

    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    conversations = body["conversations"]
    assert len(conversations) == 2

    # Pinned should be first despite being older
    assert conversations[0]["id"] == conv_pinned["id"]
    assert conversations[0]["is_pinned"] is True
    assert conversations[1]["id"] == conv_recent["id"]
    assert conversations[1]["is_pinned"] is False


# ---------------------------------------------------------------------------
# PIN-3: Pin endpoint returns correct response shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pin_response_shape(authed_client, fresh_db, conversation_owned):
    """PATCH /conversations/:id/pin returns id, is_pinned, and updated_at."""
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}/pin",
        json={"is_pinned": True},
    )

    body = assert_success_response(response, status_code=200)
    assert set(body.keys()) == {"id", "is_pinned", "updated_at"}


# ---------------------------------------------------------------------------
# PIN-4: Unpin a conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unpin_conversation(authed_client, fresh_db, test_user):
    """PATCH /conversations/:id/pin with is_pinned=false unpins the conversation."""
    conv = make_conversation(user_id=test_user["id"], title="Pinned Conv")
    conv["is_pinned"] = 1
    await insert_conversation(fresh_db, conv)

    response = await authed_client.patch(
        f"/conversations/{conv['id']}/pin",
        json={"is_pinned": False},
    )

    body = assert_success_response(response, status_code=200)
    assert body["is_pinned"] is False

    # Verify DB was updated
    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv["id"],)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 0


# ---------------------------------------------------------------------------
# PIN-5: Pin endpoint requires ownership (403 for other user)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pin_conversation_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id/pin for another user's conversation returns 403."""
    response = await other_user_client.patch(
        f"/conversations/{conversation_owned['id']}/pin",
        json={"is_pinned": True},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# PIN-6: is_pinned appears in list response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_conversations_includes_is_pinned(authed_client, fresh_db, test_user):
    """GET /conversations response includes is_pinned field for each conversation."""
    conv = make_conversation(user_id=test_user["id"], title="Test Conv")
    await insert_conversation(fresh_db, conv)

    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    conversations = body["conversations"]
    assert len(conversations) == 1
    assert "is_pinned" in conversations[0]
    assert conversations[0]["is_pinned"] is False
