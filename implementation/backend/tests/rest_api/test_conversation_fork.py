"""Conversation fork endpoint tests."""

from __future__ import annotations

import json
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
async def conversation_with_messages(fresh_db, test_user):
    """A conversation with 3 messages (user, assistant, user)."""
    conv = make_conversation(user_id=test_user["id"], title="Original conversation")
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


@pytest_asyncio.fixture
async def conversation_with_datasets(fresh_db, test_user):
    """A conversation with 2 datasets."""
    conv = make_conversation(user_id=test_user["id"], title="Data conversation")
    await insert_conversation(fresh_db, conv)

    msg1 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Load data",
        created_at="2024-01-01T10:00:00",
    )
    await insert_message(fresh_db, msg1)

    ds1 = make_dataset(
        conversation_id=conv["id"],
        url="https://example.com/data1.parquet",
        name="table1",
        row_count=100,
        column_count=3,
        schema_json=json.dumps([{"name": "id", "type": "INTEGER"}]),
        status="ready",
    )
    ds2 = make_dataset(
        conversation_id=conv["id"],
        url="https://example.com/data2.parquet",
        name="table2",
        row_count=200,
        column_count=5,
        schema_json=json.dumps([{"name": "id", "type": "INTEGER"}]),
        status="ready",
    )

    await insert_dataset(fresh_db, ds1)
    await insert_dataset(fresh_db, ds2)

    return {
        "conversation": conv,
        "message": msg1,
        "datasets": [ds1, ds2],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_creates_new_conversation_with_correct_messages(
    authed_client, fresh_db, conversation_with_messages
):
    """Fork creates a new conversation with messages up to and including the specified message."""
    conv = conversation_with_messages["conversation"]
    messages = conversation_with_messages["messages"]

    # Fork at the second message (assistant)
    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": messages[1]["id"]},
    )

    body = assert_success_response(response, status_code=201)
    assert "id" in body
    assert body["id"] != conv["id"]
    assert body["title"] == "Fork of Original conversation"

    fork_id = body["id"]

    # Verify new conversation was created
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (fork_id,)
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["title"] == "Fork of Original conversation"

    # Verify messages were copied (should have first 2 messages, not the 3rd)
    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (fork_id,),
    )
    forked_messages = await cursor.fetchall()
    assert len(forked_messages) == 2
    assert forked_messages[0]["content"] == "Hello"
    assert forked_messages[1]["content"] == "Hi there"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_copies_datasets(authed_client, fresh_db, conversation_with_datasets):
    """Fork copies all datasets from the source conversation."""
    conv = conversation_with_datasets["conversation"]
    msg = conversation_with_datasets["message"]

    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": msg["id"]},
    )

    body = assert_success_response(response, status_code=201)
    fork_id = body["id"]

    # Verify datasets were copied
    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE conversation_id = ?", (fork_id,)
    )
    forked_datasets = await cursor.fetchall()
    assert len(forked_datasets) == 2
    assert {ds["name"] for ds in forked_datasets} == {"table1", "table2"}
    assert {ds["url"] for ds in forked_datasets} == {
        "https://example.com/data1.parquet",
        "https://example.com/data2.parquet",
    }


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_with_invalid_message_id_returns_404(
    authed_client, fresh_db, conversation_with_messages
):
    """Fork with a message_id that doesn't exist in the conversation returns 404."""
    conv = conversation_with_messages["conversation"]

    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": str(uuid4())},
    )

    assert_error_response(response, 404, "Message not found")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_title_with_empty_title(authed_client, fresh_db, test_user):
    """Fork of a conversation with empty title gets 'Forked conversation' as title."""
    conv = make_conversation(user_id=test_user["id"], title="")
    await insert_conversation(fresh_db, conv)

    msg = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Test",
        created_at="2024-01-01T10:00:00",
    )
    await insert_message(fresh_db, msg)

    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": msg["id"]},
    )

    body = assert_success_response(response, status_code=201)
    assert body["title"] == "Forked conversation"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_with_message_from_other_conversation_returns_404(
    authed_client, fresh_db, test_user, conversation_with_messages
):
    """Fork with a message_id from a different conversation returns 404."""
    conv = conversation_with_messages["conversation"]

    # Create another conversation with a message
    other_conv = make_conversation(user_id=test_user["id"], title="Other")
    await insert_conversation(fresh_db, other_conv)

    other_msg = make_message(
        conversation_id=other_conv["id"],
        role="user",
        content="Other message",
        created_at="2024-01-01T10:00:00",
    )
    await insert_message(fresh_db, other_msg)

    # Try to fork using message from other conversation
    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": other_msg["id"]},
    )

    assert_error_response(response, 404, "Message not found")
