"""Message deletion endpoint tests."""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_message
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
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv["created_at"],
            conv["updated_at"],
        ),
    )
    await db.commit()


async def insert_message(db, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, reasoning, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg["sql_query"],
            msg.get("reasoning"),
            msg["token_count"],
            msg["created_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_with_messages(fresh_db, test_user):
    """A conversation with 3 messages (user, assistant, user)."""
    conv = make_conversation(user_id=test_user["id"], title="Test conversation")
    await insert_conversation(fresh_db, conv)

    msg1 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Hello",
        created_at="2024-01-01T10:00:00",
    )
    msg2 = make_message(
        conversation_id=conv["id"],
        role="assistant",
        content="Hi there",
        created_at="2024-01-01T10:00:10",
    )
    msg3 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="How are you?",
        created_at="2024-01-01T10:00:20",
    )

    await insert_message(fresh_db, msg1)
    await insert_message(fresh_db, msg2)
    await insert_message(fresh_db, msg3)

    return {
        "conversation": conv,
        "messages": [msg1, msg2, msg3],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_message_success(
    authed_client, fresh_db, conversation_with_messages
):
    """Successfully deletes a message and returns success response."""
    conv = conversation_with_messages["conversation"]
    messages = conversation_with_messages["messages"]
    target_msg = messages[1]  # assistant message

    response = await authed_client.delete(
        f"/conversations/{conv['id']}/messages/{target_msg['id']}",
    )

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_message_removes_from_db(
    authed_client, fresh_db, conversation_with_messages
):
    """Verifies the message is actually removed from the database after deletion."""
    conv = conversation_with_messages["conversation"]
    messages = conversation_with_messages["messages"]
    target_msg = messages[1]

    # Delete the message
    response = await authed_client.delete(
        f"/conversations/{conv['id']}/messages/{target_msg['id']}",
    )
    assert response.status_code == 200

    # Verify it's gone from the DB
    cursor = await fresh_db.execute(
        "SELECT id FROM messages WHERE id = ?", (target_msg["id"],)
    )
    row = await cursor.fetchone()
    assert row is None

    # Verify other messages are still there
    cursor = await fresh_db.execute(
        "SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conv["id"],),
    )
    remaining = await cursor.fetchall()
    assert len(remaining) == 2
    remaining_ids = {r["id"] for r in remaining}
    assert messages[0]["id"] in remaining_ids
    assert messages[2]["id"] in remaining_ids


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_nonexistent_message_returns_404(
    authed_client, fresh_db, conversation_with_messages
):
    """Returns 404 for a message_id that doesn't exist."""
    conv = conversation_with_messages["conversation"]

    response = await authed_client.delete(
        f"/conversations/{conv['id']}/messages/{str(uuid4())}",
    )

    assert_error_response(response, 404, "Message not found")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_message_from_different_conversation_returns_404(
    authed_client, fresh_db, test_user, conversation_with_messages
):
    """Returns 404 when trying to delete a message that belongs to a different conversation."""
    conv = conversation_with_messages["conversation"]

    # Create another conversation with a message
    other_conv = make_conversation(user_id=test_user["id"], title="Other conv")
    await insert_conversation(fresh_db, other_conv)

    other_msg = make_message(
        conversation_id=other_conv["id"],
        role="user",
        content="Other message",
        created_at="2024-01-01T10:00:00",
    )
    await insert_message(fresh_db, other_msg)

    # Try to delete other_msg via the first conversation's URL
    response = await authed_client.delete(
        f"/conversations/{conv['id']}/messages/{other_msg['id']}",
    )

    assert_error_response(response, 404, "Message not found")

    # Verify the message still exists in its own conversation
    cursor = await fresh_db.execute(
        "SELECT id FROM messages WHERE id = ?", (other_msg["id"],)
    )
    row = await cursor.fetchone()
    assert row is not None
