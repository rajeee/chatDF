"""Comprehensive CRUD tests for the conversations router.

Covers all conversation endpoints:
- POST /conversations (create)
- GET /conversations (list)
- GET /conversations/{id} (detail)
- PATCH /conversations/{id} (rename)
- PATCH /conversations/{id}/pin
- DELETE /conversations/{id}
- DELETE /conversations (clear all)
- POST /conversations/bulk-delete
- POST /conversations/bulk-pin
- GET /conversations/search
- POST /conversations/{id}/fork
- POST /conversations/{id}/share
- DELETE /conversations/{id}/share
- GET /conversations/{id}/token-usage
- DELETE /conversations/{id}/messages/{msg_id}
- POST /conversations/{id}/stop
- POST /conversations/import
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import (
    make_conversation,
    make_dataset,
    make_message,
    make_token_usage,
)
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, is_pinned, share_token, shared_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv.get("is_pinned", 0),
            conv.get("share_token"),
            conv.get("shared_at"),
            conv["created_at"],
            conv["updated_at"],
        ),
    )
    await db.commit()


async def insert_message(db, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, reasoning, token_count, created_at, input_tokens, output_tokens) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg.get("sql_query"),
            msg.get("reasoning"),
            msg.get("token_count", 0),
            msg["created_at"],
            msg.get("input_tokens", 0),
            msg.get("output_tokens", 0),
        ),
    )
    await db.commit()


async def insert_dataset(db, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at, file_size_bytes, column_descriptions) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            ds["id"],
            ds["conversation_id"],
            ds["url"],
            ds["name"],
            ds["row_count"],
            ds["column_count"],
            ds["schema_json"],
            ds["status"],
            ds.get("error_message"),
            ds["loaded_at"],
            ds.get("file_size_bytes"),
            ds.get("column_descriptions", "{}"),
        ),
    )
    await db.commit()


async def insert_token_usage(db, usage: dict) -> None:
    await db.execute(
        "INSERT INTO token_usage (id, user_id, conversation_id, model_name, "
        "input_tokens, output_tokens, cost, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            usage["id"],
            usage["user_id"],
            usage["conversation_id"],
            usage["model_name"],
            usage["input_tokens"],
            usage["output_tokens"],
            usage["cost"],
            usage["timestamp"],
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


# ===========================================================================
# POST /conversations (create)
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_conversation_returns_201(authed_client, fresh_db, test_user):
    """POST /conversations returns 201 with id, title, created_at."""
    response = await authed_client.post("/conversations")

    body = assert_success_response(response, status_code=201)
    assert "id" in body
    assert "title" in body
    assert body["title"] == ""
    assert "created_at" in body

    # Verify row exists in DB
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (body["id"],)
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["user_id"] == test_user["id"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_conversation_status_code(authed_client):
    """POST /conversations returns exactly status 201."""
    response = await authed_client.post("/conversations")
    assert response.status_code == 201


# ===========================================================================
# GET /conversations (list)
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_conversations_empty(authed_client):
    """GET /conversations with no data returns empty list."""
    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    assert body["conversations"] == []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_conversations_sorted_by_updated_at_desc(authed_client, fresh_db, test_user):
    """GET /conversations returns conversations sorted by updated_at descending."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    conv_old = make_conversation(
        user_id=test_user["id"],
        title="Old",
        updated_at=(now - timedelta(hours=3)).isoformat(),
    )
    conv_new = make_conversation(
        user_id=test_user["id"],
        title="New",
        updated_at=(now - timedelta(hours=1)).isoformat(),
    )
    await insert_conversation(fresh_db, conv_old)
    await insert_conversation(fresh_db, conv_new)

    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    conversations = body["conversations"]
    assert len(conversations) == 2
    assert conversations[0]["id"] == conv_new["id"]
    assert conversations[1]["id"] == conv_old["id"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_conversations_pinned_first(authed_client, fresh_db, test_user):
    """GET /conversations returns pinned conversations before unpinned ones."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Older pinned conversation
    conv_pinned = make_conversation(
        user_id=test_user["id"],
        title="Pinned Old",
        updated_at=(now - timedelta(hours=5)).isoformat(),
    )
    conv_pinned["is_pinned"] = 1

    # Newer unpinned conversation
    conv_recent = make_conversation(
        user_id=test_user["id"],
        title="Unpinned Recent",
        updated_at=(now - timedelta(hours=1)).isoformat(),
    )

    await insert_conversation(fresh_db, conv_pinned)
    await insert_conversation(fresh_db, conv_recent)

    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    conversations = body["conversations"]
    assert len(conversations) == 2
    # Pinned comes first despite being older
    assert conversations[0]["id"] == conv_pinned["id"]
    assert conversations[0]["is_pinned"] is True
    assert conversations[1]["id"] == conv_recent["id"]
    assert conversations[1]["is_pinned"] is False


# ===========================================================================
# GET /conversations/{id} (detail)
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_conversation_detail_with_messages_and_datasets(
    authed_client, fresh_db, conversation_owned
):
    """GET /conversations/{id} returns conversation with messages and datasets."""
    conv_id = conversation_owned["id"]

    msg = make_message(conversation_id=conv_id, role="user", content="Hello there")
    await insert_message(fresh_db, msg)

    ds = make_dataset(
        conversation_id=conv_id,
        url="https://example.com/data.parquet",
        name="table1",
        row_count=100,
        column_count=5,
        status="ready",
    )
    await insert_dataset(fresh_db, ds)

    response = await authed_client.get(f"/conversations/{conv_id}")

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert "messages" in body
    assert "datasets" in body
    assert len(body["messages"]) == 1
    assert body["messages"][0]["content"] == "Hello there"
    assert len(body["datasets"]) == 1
    assert body["datasets"][0]["name"] == "table1"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_conversation_not_found(authed_client):
    """GET /conversations/{id} for non-existent conversation returns 404."""
    response = await authed_client.get(f"/conversations/{uuid4()}")
    assert response.status_code == 404


# ===========================================================================
# PATCH /conversations/{id} (rename)
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation(authed_client, fresh_db, conversation_owned):
    """PATCH /conversations/{id} with title returns new title."""
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": "Renamed Title"},
    )

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert body["title"] == "Renamed Title"

    # Verify DB
    cursor = await fresh_db.execute(
        "SELECT title FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["title"] == "Renamed Title"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_updates_updated_at(authed_client, fresh_db, conversation_owned):
    """PATCH /conversations/{id} updates the updated_at timestamp."""
    conv_id = conversation_owned["id"]
    original_updated_at = conversation_owned["updated_at"]

    # Small delay to ensure different timestamp
    await asyncio.sleep(0.01)

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": "New Name"},
    )

    body = assert_success_response(response, status_code=200)
    assert body["updated_at"] != original_updated_at


# ===========================================================================
# PATCH /conversations/{id}/pin
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pin_conversation(authed_client, fresh_db, conversation_owned):
    """PATCH /conversations/{id}/pin with is_pinned=true pins a conversation."""
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}/pin",
        json={"is_pinned": True},
    )

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert body["is_pinned"] is True

    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unpin_conversation(authed_client, fresh_db, test_user):
    """PATCH /conversations/{id}/pin with is_pinned=false unpins a conversation."""
    conv = make_conversation(user_id=test_user["id"], title="Pinned")
    conv["is_pinned"] = 1
    await insert_conversation(fresh_db, conv)

    response = await authed_client.patch(
        f"/conversations/{conv['id']}/pin",
        json={"is_pinned": False},
    )

    body = assert_success_response(response, status_code=200)
    assert body["is_pinned"] is False

    cursor = await fresh_db.execute(
        "SELECT is_pinned FROM conversations WHERE id = ?", (conv["id"],)
    )
    row = await cursor.fetchone()
    assert row["is_pinned"] == 0


# ===========================================================================
# DELETE /conversations/{id}
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_conversation_success(authed_client, fresh_db, conversation_owned):
    """DELETE /conversations/{id} returns {success: true}."""
    conv_id = conversation_owned["id"]

    response = await authed_client.delete(f"/conversations/{conv_id}")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_id,)
    )
    assert await cursor.fetchone() is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_conversation_cascade_deletes(authed_client, fresh_db, conversation_owned):
    """DELETE /conversations/{id} cascades to messages and datasets."""
    conv_id = conversation_owned["id"]

    msg = make_message(conversation_id=conv_id, role="user", content="Test")
    await insert_message(fresh_db, msg)

    ds = make_dataset(conversation_id=conv_id, status="ready")
    await insert_dataset(fresh_db, ds)

    await authed_client.delete(f"/conversations/{conv_id}")

    # Messages deleted
    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ?", (conv_id,)
    )
    assert await cursor.fetchone() is None

    # Datasets deleted
    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE conversation_id = ?", (conv_id,)
    )
    assert await cursor.fetchone() is None


# ===========================================================================
# DELETE /conversations (clear all)
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_clear_all_conversations(authed_client, fresh_db, test_user):
    """DELETE /conversations deletes all user's conversations, returns count."""
    for i in range(3):
        conv = make_conversation(user_id=test_user["id"], title=f"Conv {i}")
        await insert_conversation(fresh_db, conv)

    response = await authed_client.delete("/conversations")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True
    assert body["deleted_count"] == 3

    cursor = await fresh_db.execute(
        "SELECT COUNT(*) AS cnt FROM conversations WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row["cnt"] == 0


# ===========================================================================
# POST /conversations/bulk-delete
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_conversations(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-delete deletes specified conversations."""
    conv1 = make_conversation(user_id=test_user["id"], title="Conv 1")
    conv2 = make_conversation(user_id=test_user["id"], title="Conv 2")
    conv3 = make_conversation(user_id=test_user["id"], title="Conv 3")
    await insert_conversation(fresh_db, conv1)
    await insert_conversation(fresh_db, conv2)
    await insert_conversation(fresh_db, conv3)

    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": [conv1["id"], conv2["id"]]},
    )

    body = assert_success_response(response, status_code=200)
    assert body["deleted"] == 2

    # conv3 should still exist
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv3["id"],)
    )
    assert await cursor.fetchone() is not None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_returns_correct_count(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-delete returns correct deleted count."""
    conv1 = make_conversation(user_id=test_user["id"], title="Existing")
    await insert_conversation(fresh_db, conv1)

    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": [conv1["id"], "nonexistent-id"]},
    )

    body = assert_success_response(response, status_code=200)
    assert body["deleted"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_delete_rejects_empty_ids(authed_client):
    """POST /conversations/bulk-delete with empty ids returns 400."""
    response = await authed_client.post(
        "/conversations/bulk-delete",
        json={"ids": []},
    )
    assert response.status_code == 400


# ===========================================================================
# POST /conversations/bulk-pin
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_pin_conversations(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-pin pins multiple conversations."""
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

    for conv_id in [conv1["id"], conv2["id"]]:
        cursor = await fresh_db.execute(
            "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
        )
        row = await cursor.fetchone()
        assert row["is_pinned"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_unpin_conversations(authed_client, fresh_db, test_user):
    """POST /conversations/bulk-pin with is_pinned=false unpins conversations."""
    conv1 = make_conversation(user_id=test_user["id"], title="Pinned 1")
    conv1["is_pinned"] = 1
    conv2 = make_conversation(user_id=test_user["id"], title="Pinned 2")
    conv2["is_pinned"] = 1
    await insert_conversation(fresh_db, conv1)
    await insert_conversation(fresh_db, conv2)

    response = await authed_client.post(
        "/conversations/bulk-pin",
        json={"ids": [conv1["id"], conv2["id"]], "is_pinned": False},
    )

    body = assert_success_response(response, status_code=200)
    assert body["updated"] == 2

    for conv_id in [conv1["id"], conv2["id"]]:
        cursor = await fresh_db.execute(
            "SELECT is_pinned FROM conversations WHERE id = ?", (conv_id,)
        )
        row = await cursor.fetchone()
        assert row["is_pinned"] == 0


# ===========================================================================
# GET /conversations/search
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_finds_matching_messages(authed_client, fresh_db, test_user):
    """GET /conversations/search returns messages matching query."""
    conv = make_conversation(user_id=test_user["id"], title="Search Conv")
    await insert_conversation(fresh_db, conv)

    msg1 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="What is the average salary?",
    )
    msg2 = make_message(
        conversation_id=conv["id"],
        role="assistant",
        content="The total revenue is $1M.",
    )
    await insert_message(fresh_db, msg1)
    await insert_message(fresh_db, msg2)

    response = await authed_client.get("/conversations/search?q=salary")

    body = assert_success_response(response, status_code=200)
    assert body["total"] == 1
    assert "salary" in body["results"][0]["snippet"].lower()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_returns_snippets_with_context(authed_client, fresh_db, test_user):
    """GET /conversations/search returns snippets containing context around the match."""
    conv = make_conversation(user_id=test_user["id"], title="Snippet Conv")
    await insert_conversation(fresh_db, conv)

    msg = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Please calculate the average salary for all employees in the engineering department.",
    )
    await insert_message(fresh_db, msg)

    response = await authed_client.get("/conversations/search?q=average")

    body = assert_success_response(response, status_code=200)
    assert body["total"] >= 1
    snippet = body["results"][0]["snippet"]
    assert "average" in snippet.lower()
    # Snippet should include surrounding context
    assert "salary" in snippet.lower()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_returns_400_for_empty_query(authed_client):
    """GET /conversations/search?q= returns 400 for empty query."""
    response = await authed_client.get("/conversations/search?q=")
    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_respects_limit(authed_client, fresh_db, test_user):
    """GET /conversations/search respects the limit parameter."""
    conv = make_conversation(user_id=test_user["id"], title="Many Msgs")
    await insert_conversation(fresh_db, conv)

    for i in range(15):
        msg = make_message(
            conversation_id=conv["id"],
            content=f"Message {i} containing keyword",
        )
        await insert_message(fresh_db, msg)

    response = await authed_client.get("/conversations/search?q=keyword&limit=5")

    body = assert_success_response(response, status_code=200)
    assert body["total"] <= 5


# ===========================================================================
# POST /conversations/{id}/fork
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_conversation_with_messages(authed_client, fresh_db, test_user):
    """POST /conversations/{id}/fork copies messages up to specified message."""
    conv = make_conversation(user_id=test_user["id"], title="Original")
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

    # Fork at msg2 -- should include msg1 and msg2, not msg3
    response = await authed_client.post(
        f"/conversations/{conv['id']}/fork",
        json={"message_id": msg2["id"]},
    )

    body = assert_success_response(response, status_code=201)
    fork_id = body["id"]
    assert fork_id != conv["id"]
    assert body["title"] == "Fork of Original"

    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (fork_id,),
    )
    forked_msgs = await cursor.fetchall()
    assert len(forked_msgs) == 2
    assert forked_msgs[0]["content"] == "Hello"
    assert forked_msgs[1]["content"] == "Hi there"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_copies_datasets(authed_client, fresh_db, test_user):
    """POST /conversations/{id}/fork copies all datasets to new conversation."""
    conv = make_conversation(user_id=test_user["id"], title="Data Conv")
    await insert_conversation(fresh_db, conv)

    msg = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Load data",
        created_at="2024-01-01T10:00:00",
    )
    await insert_message(fresh_db, msg)

    ds1 = make_dataset(
        conversation_id=conv["id"],
        url="https://example.com/d1.parquet",
        name="table1",
        status="ready",
    )
    ds2 = make_dataset(
        conversation_id=conv["id"],
        url="https://example.com/d2.parquet",
        name="table2",
        status="ready",
    )
    await insert_dataset(fresh_db, ds1)
    await insert_dataset(fresh_db, ds2)

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
    assert len(forked_datasets) == 2
    assert {ds["name"] for ds in forked_datasets} == {"table1", "table2"}


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fork_returns_404_for_invalid_message_id(
    authed_client, fresh_db, conversation_owned
):
    """POST /conversations/{id}/fork with non-existent message_id returns 404."""
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/fork",
        json={"message_id": str(uuid4())},
    )
    assert response.status_code == 404


# ===========================================================================
# POST /conversations/{id}/share
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_generates_token_and_url(authed_client, fresh_db, conversation_owned):
    """POST /conversations/{id}/share generates share_token and share_url."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(f"/conversations/{conv_id}/share")

    body = assert_success_response(response, status_code=201)
    assert "share_token" in body
    assert "share_url" in body
    assert len(body["share_token"]) > 0
    assert body["share_token"] in body["share_url"]

    cursor = await fresh_db.execute(
        "SELECT share_token, shared_at FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["share_token"] == body["share_token"]
    assert row["shared_at"] is not None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_resharing_returns_same_token(authed_client, fresh_db, test_user):
    """POST /conversations/{id}/share returns same token if already shared."""
    existing_token = "already-shared-token"
    conv = make_conversation(
        user_id=test_user["id"],
        title="Already Shared",
        share_token=existing_token,
        shared_at="2025-06-01T00:00:00",
    )
    await insert_conversation(fresh_db, conv)

    response = await authed_client.post(f"/conversations/{conv['id']}/share")

    body = assert_success_response(response, status_code=201)
    assert body["share_token"] == existing_token


# ===========================================================================
# DELETE /conversations/{id}/share
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unshare_revokes_token(authed_client, fresh_db, test_user):
    """DELETE /conversations/{id}/share sets share_token and shared_at to NULL."""
    conv = make_conversation(
        user_id=test_user["id"],
        title="Shared",
        share_token="token-to-revoke",
        shared_at="2025-06-01T00:00:00",
    )
    await insert_conversation(fresh_db, conv)

    response = await authed_client.delete(f"/conversations/{conv['id']}/share")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    cursor = await fresh_db.execute(
        "SELECT share_token, shared_at FROM conversations WHERE id = ?", (conv["id"],)
    )
    row = await cursor.fetchone()
    assert row["share_token"] is None
    assert row["shared_at"] is None


# ===========================================================================
# GET /conversations/{id}/token-usage
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_usage_returns_aggregated_data(authed_client, fresh_db, test_user):
    """GET /conversations/{id}/token-usage returns aggregated token usage."""
    conv = make_conversation(user_id=test_user["id"], title="Usage Conv")
    await insert_conversation(fresh_db, conv)

    usage1 = make_token_usage(
        user_id=test_user["id"],
        conversation_id=conv["id"],
        input_tokens=1000,
        output_tokens=500,
        cost=0.001,
    )
    usage2 = make_token_usage(
        user_id=test_user["id"],
        conversation_id=conv["id"],
        input_tokens=2000,
        output_tokens=800,
        cost=0.002,
    )
    await insert_token_usage(fresh_db, usage1)
    await insert_token_usage(fresh_db, usage2)

    response = await authed_client.get(f"/conversations/{conv['id']}/token-usage")

    body = assert_success_response(response, status_code=200)
    assert body["total_input_tokens"] == 3000
    assert body["total_output_tokens"] == 1300
    assert body["total_tokens"] == 4300
    assert body["total_cost"] == pytest.approx(0.003)
    assert body["request_count"] == 2


# ===========================================================================
# DELETE /conversations/{id}/messages/{msg_id}
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_single_message(authed_client, fresh_db, conversation_owned):
    """DELETE /conversations/{id}/messages/{msg_id} deletes the message."""
    conv_id = conversation_owned["id"]

    msg = make_message(conversation_id=conv_id, role="user", content="Delete me")
    await insert_message(fresh_db, msg)

    response = await authed_client.delete(
        f"/conversations/{conv_id}/messages/{msg['id']}"
    )

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE id = ?", (msg["id"],)
    )
    assert await cursor.fetchone() is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_message_returns_404_for_nonexistent(
    authed_client, fresh_db, conversation_owned
):
    """DELETE /conversations/{id}/messages/{msg_id} returns 404 for non-existent message."""
    conv_id = conversation_owned["id"]
    fake_msg_id = str(uuid4())

    response = await authed_client.delete(
        f"/conversations/{conv_id}/messages/{fake_msg_id}"
    )
    assert response.status_code == 404


# ===========================================================================
# POST /conversations/{id}/stop
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_stop_generation_returns_success(authed_client, fresh_db, conversation_owned):
    """POST /conversations/{id}/stop returns {success: true}."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(f"/conversations/{conv_id}/stop")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True


# ===========================================================================
# POST /conversations/import
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_import_conversation_with_messages_and_datasets(
    authed_client, fresh_db, test_user
):
    """POST /conversations/import creates a conversation with messages and datasets."""
    import_data = {
        "title": "Imported Chat",
        "messages": [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ],
        "datasets": [
            {
                "url": "https://example.com/imported.parquet",
                "name": "imported_table",
                "row_count": 50,
                "column_count": 3,
            },
        ],
    }

    response = await authed_client.post("/conversations/import", json=import_data)

    body = assert_success_response(response, status_code=201)
    assert "id" in body
    assert body["title"] == "Imported Chat"

    conv_id = body["id"]

    # Verify messages were created
    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conv_id,),
    )
    messages = await cursor.fetchall()
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "Hello"
    assert messages[1]["role"] == "assistant"

    # Verify datasets were created
    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE conversation_id = ?", (conv_id,)
    )
    datasets = await cursor.fetchall()
    assert len(datasets) == 1
    assert datasets[0]["name"] == "imported_table"
    assert datasets[0]["url"] == "https://example.com/imported.parquet"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_import_validates_message_format(authed_client):
    """POST /conversations/import rejects messages with invalid role."""
    import_data = {
        "title": "Bad Import",
        "messages": [
            {"role": "system", "content": "System message not allowed"},
        ],
    }

    response = await authed_client.post("/conversations/import", json=import_data)
    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.integration
async def test_import_rejects_invalid_data(authed_client):
    """POST /conversations/import rejects non-array messages."""
    import_data = {
        "title": "Bad Import",
        "messages": "not an array",
    }

    response = await authed_client.post("/conversations/import", json=import_data)
    assert response.status_code == 400
