"""Conversation endpoint tests.

Tests: spec/backend/rest_api/test.md#CONV-EP-1 through CONV-EP-11
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_dataset, make_message
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


async def insert_message(db, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg["sql_query"],
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
# CONV-EP-1: POST /conversations - Create (201)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_conversation_returns_201(authed_client, fresh_db, test_user):
    """POST /conversations returns 201 with id, title, created_at."""
    response = await authed_client.post("/conversations")

    body = assert_success_response(response, status_code=201)
    assert "id" in body
    assert "title" in body
    assert "created_at" in body

    # Verify row exists in DB
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (body["id"],)
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["user_id"] == test_user["id"]


# ---------------------------------------------------------------------------
# CONV-EP-2: GET /conversations - List sorted by updated_at desc
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_conversations_sorted_by_updated_at(authed_client, fresh_db, test_user):
    """GET /conversations returns sorted list with dataset_count."""
    now = datetime.utcnow()

    # Seed 3 conversations with different updated_at times
    conv_old = make_conversation(
        user_id=test_user["id"],
        title="Old Conv",
        created_at=(now - timedelta(hours=3)).isoformat(),
        updated_at=(now - timedelta(hours=3)).isoformat(),
    )
    conv_mid = make_conversation(
        user_id=test_user["id"],
        title="Mid Conv",
        created_at=(now - timedelta(hours=2)).isoformat(),
        updated_at=(now - timedelta(hours=2)).isoformat(),
    )
    conv_new = make_conversation(
        user_id=test_user["id"],
        title="New Conv",
        created_at=(now - timedelta(hours=1)).isoformat(),
        updated_at=(now - timedelta(hours=1)).isoformat(),
    )

    await insert_conversation(fresh_db, conv_old)
    await insert_conversation(fresh_db, conv_mid)
    await insert_conversation(fresh_db, conv_new)

    # Add a dataset to conv_mid to test dataset_count
    ds = make_dataset(conversation_id=conv_mid["id"])
    await insert_dataset(fresh_db, ds)

    response = await authed_client.get("/conversations")

    body = assert_success_response(response, status_code=200)
    assert "conversations" in body
    conversations = body["conversations"]
    assert len(conversations) == 3

    # Should be sorted by updated_at desc (newest first)
    assert conversations[0]["id"] == conv_new["id"]
    assert conversations[1]["id"] == conv_mid["id"]
    assert conversations[2]["id"] == conv_old["id"]

    # Check dataset_count
    for conv in conversations:
        assert "dataset_count" in conv
    # conv_mid should have 1 dataset
    assert conversations[1]["dataset_count"] == 1
    # Others should have 0
    assert conversations[0]["dataset_count"] == 0
    assert conversations[2]["dataset_count"] == 0


# ---------------------------------------------------------------------------
# CONV-EP-3: GET /conversations/:id - Detail with messages and datasets
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_conversation_detail(authed_client, fresh_db, conversation_owned):
    """GET /conversations/:id returns 200 with messages and datasets arrays."""
    conv_id = conversation_owned["id"]

    # Add a message
    msg = make_message(conversation_id=conv_id, role="user", content="Hello")
    await insert_message(fresh_db, msg)

    # Add a dataset
    ds = make_dataset(
        conversation_id=conv_id,
        url="https://example.com/data.parquet",
        name="table1",
        row_count=100,
        column_count=3,
        status="ready",
    )
    await insert_dataset(fresh_db, ds)

    response = await authed_client.get(f"/conversations/{conv_id}")

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert body["title"] == conversation_owned["title"]
    assert "created_at" in body
    assert "updated_at" in body

    # Messages
    assert "messages" in body
    assert len(body["messages"]) == 1
    assert body["messages"][0]["id"] == msg["id"]
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][0]["content"] == "Hello"

    # Datasets
    assert "datasets" in body
    assert len(body["datasets"]) == 1
    assert body["datasets"][0]["id"] == ds["id"]
    assert body["datasets"][0]["name"] == "table1"
    assert body["datasets"][0]["url"] == "https://example.com/data.parquet"


# ---------------------------------------------------------------------------
# CONV-EP-4: GET /conversations/:id - Not owner (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_conversation_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned
):
    """GET /conversations/:id for another user's conversation returns 403."""
    response = await other_user_client.get(
        f"/conversations/{conversation_owned['id']}"
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# CONV-EP-5: GET /conversations/:id - Not found (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_conversation_not_found_returns_404(authed_client, fresh_db):
    """GET /conversations/:id for nonexistent ID returns 404."""
    response = await authed_client.get("/conversations/nonexistent-id")
    assert_error_response(response, 404)


# ---------------------------------------------------------------------------
# CONV-EP-6: DELETE /conversations/:id - Success with cascade
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_conversation_success(authed_client, fresh_db, conversation_owned):
    """DELETE /conversations/:id returns 200 with {success: true} and cascades."""
    conv_id = conversation_owned["id"]

    # Add a message and dataset to test cascade
    msg = make_message(conversation_id=conv_id)
    await insert_message(fresh_db, msg)
    ds = make_dataset(conversation_id=conv_id)
    await insert_dataset(fresh_db, ds)

    response = await authed_client.delete(f"/conversations/{conv_id}")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    # Verify conversation is gone
    cursor = await fresh_db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_id,)
    )
    assert await cursor.fetchone() is None

    # Verify cascade: messages gone
    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ?", (conv_id,)
    )
    assert await cursor.fetchone() is None

    # Verify cascade: datasets gone
    cursor = await fresh_db.execute(
        "SELECT * FROM datasets WHERE conversation_id = ?", (conv_id,)
    )
    assert await cursor.fetchone() is None


# ---------------------------------------------------------------------------
# CONV-EP-7: DELETE /conversations/:id - Not owner (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_conversation_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned
):
    """DELETE /conversations/:id for another user's conversation returns 403."""
    response = await other_user_client.delete(
        f"/conversations/{conversation_owned['id']}"
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# CONV-EP-8: DELETE /conversations/:id - Not found (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_conversation_not_found_returns_404(authed_client, fresh_db):
    """DELETE /conversations/:id for nonexistent ID returns 404."""
    response = await authed_client.delete("/conversations/nonexistent-id")
    assert_error_response(response, 404)


# ---------------------------------------------------------------------------
# CONV-EP-9: PATCH /conversations/:id - Rename
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation(authed_client, fresh_db, conversation_owned):
    """PATCH /conversations/:id with title returns 200 with updated title."""
    conv_id = conversation_owned["id"]

    response = await authed_client.patch(
        f"/conversations/{conv_id}",
        json={"title": "New Name"},
    )

    body = assert_success_response(response, status_code=200)
    assert body["id"] == conv_id
    assert body["title"] == "New Name"
    assert "updated_at" in body

    # Verify DB was updated
    cursor = await fresh_db.execute(
        "SELECT title FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["title"] == "New Name"


# ---------------------------------------------------------------------------
# CONV-EP-10: PATCH /conversations/:id - Not owner (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rename_conversation_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned
):
    """PATCH /conversations/:id for another user's conversation returns 403."""
    response = await other_user_client.patch(
        f"/conversations/{conversation_owned['id']}",
        json={"title": "Hijacked"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# CONV-EP-11: DELETE /conversations - Clear all (only user's conversations)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_clear_all_conversations(authed_client, other_user_client, fresh_db, test_user):
    """DELETE /conversations deletes only current user's conversations."""
    from tests.factories import make_user

    # Seed 3 conversations for test_user
    for i in range(3):
        conv = make_conversation(user_id=test_user["id"], title=f"User1 Conv {i}")
        await insert_conversation(fresh_db, conv)

    # Seed 1 conversation for other_user (the other_user_client fixture creates the user)
    # We need to get the other user's ID. The other_user fixture creates "other-user".
    other_conv = make_conversation(user_id="other-user", title="Other Conv")
    await insert_conversation(fresh_db, other_conv)

    response = await authed_client.delete("/conversations")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True
    assert body["deleted_count"] == 3

    # Verify test_user has 0 conversations
    cursor = await fresh_db.execute(
        "SELECT COUNT(*) as cnt FROM conversations WHERE user_id = ?",
        (test_user["id"],),
    )
    row = await cursor.fetchone()
    assert row["cnt"] == 0

    # Verify other_user's conversation remains
    cursor = await fresh_db.execute(
        "SELECT COUNT(*) as cnt FROM conversations WHERE user_id = ?",
        ("other-user",),
    )
    row = await cursor.fetchone()
    assert row["cnt"] == 1


# ---------------------------------------------------------------------------
# Unauthenticated returns 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unauthenticated_returns_401(authed_client):
    """All conversation endpoints return 401 without a session cookie."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        resp = await unauthed.post("/conversations")
        assert resp.status_code == 401

        resp = await unauthed.get("/conversations")
        assert resp.status_code == 401

        resp = await unauthed.get("/conversations/some-id")
        assert resp.status_code == 401

        resp = await unauthed.patch(
            "/conversations/some-id", json={"title": "foo"}
        )
        assert resp.status_code == 401

        resp = await unauthed.delete("/conversations/some-id")
        assert resp.status_code == 401

        resp = await unauthed.delete("/conversations")
        assert resp.status_code == 401
