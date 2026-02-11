"""Edge-case tests for conversation endpoints.

Covers:
- Create conversation when user already has many conversations
- Rename conversation with empty string title
- Rename conversation with very long title (1000+ chars)
- Pin an already-pinned conversation (idempotent)
- Delete a non-existent conversation (should return 404)
- Get messages for empty conversation
- Fork a conversation that has no messages
"""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_dataset, make_message
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
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
    conv = make_conversation(user_id=test_user["id"], title="Test Conv")
    await insert_conversation(fresh_db, conv)
    return conv


# ---------------------------------------------------------------------------
# EDGE-1: Create conversation when user has maximum conversations already
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_conversation_with_many_existing(authed_client, fresh_db, test_user):
    """User with 100 existing conversations can still create a new one.

    The API has no hard cap on conversation count per user; this test
    confirms that behaviour by inserting many conversations first.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for i in range(100):
        conv = make_conversation(
            user_id=test_user["id"],
            title=f"Conv {i}",
            created_at=(now - timedelta(minutes=i)).isoformat(),
            updated_at=(now - timedelta(minutes=i)).isoformat(),
        )
        await insert_conversation(fresh_db, conv)

    # Creating one more should succeed
    response = await authed_client.post("/conversations")

    body = assert_success_response(response, status_code=201)
    assert "id" in body

    # Verify total count is now 101
    cursor = await fresh_db.execute(
        "SELECT COUNT(*) AS cnt FROM conversations WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row["cnt"] == 101


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_conversations_after_many_creates(authed_client, fresh_db, test_user):
    """Listing after creating many conversations returns all of them."""
    for i in range(50):
        conv = make_conversation(user_id=test_user["id"], title=f"Conv {i}")
        await insert_conversation(fresh_db, conv)

    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    assert len(body["conversations"]) == 50


# ---------------------------------------------------------------------------
# EDGE-2: Rename conversation with empty string title
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_with_empty_title_rejected(
    authed_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id with an empty title should be rejected (422).

    The RenameConversationRequest model has min_length=1 on title.
    """
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": ""},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_with_whitespace_only_title(
    authed_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id with whitespace-only title should succeed.

    The model requires min_length=1, and a space counts as a character.
    """
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": "   "},
    )

    body = assert_success_response(response, status_code=200)
    assert body["title"] == "   "


# ---------------------------------------------------------------------------
# EDGE-3: Rename conversation with very long title (1000+ chars)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_with_very_long_title_rejected(
    authed_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id with a title exceeding 100 chars should be rejected (422).

    The RenameConversationRequest model has max_length=100 on title.
    """
    conv_id = conversation_owned["id"]
    long_title = "A" * 1001

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": long_title},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_with_exactly_100_chars(
    authed_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id with exactly 100 characters succeeds."""
    conv_id = conversation_owned["id"]
    title_100 = "B" * 100

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": title_100},
    )

    body = assert_success_response(response, status_code=200)
    assert body["title"] == title_100
    assert len(body["title"]) == 100


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_with_101_chars_rejected(
    authed_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id with 101 characters is rejected (422)."""
    conv_id = conversation_owned["id"]
    title_101 = "C" * 101

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": title_101},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# EDGE-4: Pin an already-pinned conversation (idempotent)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pin_already_pinned_conversation_is_idempotent(
    authed_client, fresh_db, test_user
):
    """PATCH /conversations/:id/pin on an already-pinned conversation succeeds idempotently."""
    conv = make_conversation(user_id=test_user["id"], title="Already Pinned")
    conv["is_pinned"] = 1
    await insert_conversation(fresh_db, conv)

    # Pin it again
    response = await authed_client.patch(
        f"/conversations/{conv['id']}/pin",
        json={"is_pinned": True},
    )

    body = assert_success_response(response, status_code=200)
    assert body["is_pinned"] is True

    # Verify DB still has is_pinned=1
    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv["id"],)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unpin_already_unpinned_conversation_is_idempotent(
    authed_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id/pin with is_pinned=false on unpinned conv is idempotent."""
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}/pin",
        json={"is_pinned": False},
    )

    body = assert_success_response(response, status_code=200)
    assert body["is_pinned"] is False

    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_double_pin_then_unpin(authed_client, fresh_db, conversation_owned):
    """Pinning twice, then unpinning once results in unpinned."""
    conv_id = conversation_owned["id"]

    # Pin twice
    await authed_client.patch(
        f"/conversations/{conv_id}/pin", json={"is_pinned": True}
    )
    await authed_client.patch(
        f"/conversations/{conv_id}/pin", json={"is_pinned": True}
    )

    # Unpin once
    response = await authed_client.patch(
        f"/conversations/{conv_id}/pin", json={"is_pinned": False}
    )

    body = assert_success_response(response, status_code=200)
    assert body["is_pinned"] is False


# ---------------------------------------------------------------------------
# EDGE-5: Delete a non-existent conversation (should return 404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_nonexistent_conversation_returns_404(authed_client, fresh_db):
    """DELETE /conversations/:id with a random UUID returns 404."""
    fake_id = str(uuid4())

    response = await authed_client.delete(f"/conversations/{fake_id}")

    assert_error_response(response, 404)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_already_deleted_conversation_returns_404(
    authed_client, fresh_db, conversation_owned
):
    """Deleting a conversation twice: the second attempt returns 404."""
    conv_id = conversation_owned["id"]

    # First delete succeeds
    response = await authed_client.delete(f"/conversations/{conv_id}")
    assert response.status_code == 200

    # Second delete returns 404
    response = await authed_client.delete(f"/conversations/{conv_id}")
    assert_error_response(response, 404)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_with_empty_string_id_returns_error(authed_client, fresh_db):
    """DELETE /conversations/ with empty string redirects or returns an error.

    FastAPI typically matches the empty path to GET /conversations (list),
    so DELETE to "/" may return 405 or match a different route.
    """
    response = await authed_client.delete("/conversations/")

    # Should not return 200 (cannot delete empty-id conversation)
    assert response.status_code != 200 or response.json().get("success") is not True


# ---------------------------------------------------------------------------
# EDGE-6: Get messages for empty conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_empty_conversation_detail(
    authed_client, fresh_db, conversation_owned
):
    """GET /conversations/:id for a conversation with zero messages returns empty arrays."""
    conv_id = conversation_owned["id"]

    response = await authed_client.get(f"/conversations/{conv_id}")

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert body["messages"] == []
    assert body["datasets"] == []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_empty_conversation_has_correct_metadata(
    authed_client, fresh_db, conversation_owned
):
    """An empty conversation still has correct title, created_at, updated_at."""
    conv_id = conversation_owned["id"]

    response = await authed_client.get(f"/conversations/{conv_id}")

    body = assert_success_response(response, status_code=200)
    assert body["title"] == conversation_owned["title"]
    assert "created_at" in body
    assert "updated_at" in body


@pytest.mark.asyncio
@pytest.mark.integration
async def test_empty_conversation_token_usage_is_zero(
    authed_client, fresh_db, conversation_owned
):
    """Token usage for an empty conversation should be all zeros."""
    conv_id = conversation_owned["id"]

    response = await authed_client.get(f"/conversations/{conv_id}/token-usage")

    body = assert_success_response(response, status_code=200)
    assert body["total_input_tokens"] == 0
    assert body["total_output_tokens"] == 0
    assert body["total_tokens"] == 0
    assert body["request_count"] == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_shows_zero_message_count_for_empty_conversation(
    authed_client, fresh_db, conversation_owned
):
    """GET /conversations shows message_count=0 for an empty conversation."""
    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    conversations = body["conversations"]
    assert len(conversations) == 1
    assert conversations[0]["message_count"] == 0
    assert conversations[0]["last_message_preview"] is None


# ---------------------------------------------------------------------------
# EDGE-7: Fork a conversation that has no messages
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_conversation_with_no_messages_returns_404(
    authed_client, fresh_db, conversation_owned
):
    """Forking a conversation with no messages and a fake message_id returns 404.

    The fork endpoint requires a valid message_id that belongs to the conversation.
    An empty conversation has no messages, so any message_id will fail.
    """
    conv_id = conversation_owned["id"]
    fake_message_id = str(uuid4())

    response = await authed_client.post(
        f"/conversations/{conv_id}/fork",
        json={"message_id": fake_message_id},
    )

    assert_error_response(response, 404, "Message not found")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_at_first_message_copies_only_one(
    authed_client, fresh_db, test_user
):
    """Forking at the very first message copies exactly one message."""
    conv = make_conversation(user_id=test_user["id"], title="Fork Source")
    await insert_conversation(fresh_db, conv)

    msg1 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="First message",
        created_at="2024-01-01T10:00:00",
    )
    msg2 = make_message(
        conversation_id=conv["id"],
        role="assistant",
        content="Reply",
        created_at="2024-01-01T10:00:10",
    )
    await insert_message(fresh_db, msg1)
    await insert_message(fresh_db, msg2)

    # Fork at the first message
    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": msg1["id"]},
    )

    body = assert_success_response(response, status_code=201)
    fork_id = body["id"]

    # Verify only the first message was copied
    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (fork_id,),
    )
    forked_messages = await cursor.fetchall()
    assert len(forked_messages) == 1
    assert forked_messages[0]["content"] == "First message"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_preserves_datasets(authed_client, fresh_db, test_user):
    """Forking copies all datasets even when forking at the first message."""
    conv = make_conversation(user_id=test_user["id"], title="DS Fork")
    await insert_conversation(fresh_db, conv)

    msg = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Load data",
        created_at="2024-01-01T10:00:00",
    )
    await insert_message(fresh_db, msg)

    ds = make_dataset(
        conversation_id=conv["id"],
        url="https://example.com/data.parquet",
        name="my_table",
        status="ready",
    )
    await insert_dataset(fresh_db, ds)

    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": msg["id"]},
    )

    body = assert_success_response(response, status_code=201)
    fork_id = body["id"]

    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE conversation_id = ?", (fork_id,)
    )
    forked_datasets = await cursor.fetchall()
    assert len(forked_datasets) == 1
    assert forked_datasets[0]["name"] == "my_table"
    assert forked_datasets[0]["url"] == "https://example.com/data.parquet"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_nonexistent_conversation_returns_404(authed_client, fresh_db):
    """Forking a conversation that does not exist returns 404."""
    fake_conv_id = str(uuid4())
    fake_msg_id = str(uuid4())

    response = await authed_client.post(
        f"/conversations/{fake_conv_id}/fork",
        json={"message_id": fake_msg_id},
    )

    assert_error_response(response, 404)
