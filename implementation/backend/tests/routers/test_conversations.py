"""Integration tests for the conversations router.

Tests cover CRUD endpoints, fork, bulk operations, pin/unpin, and clear-all.
Does NOT test send_message (requires worker pool + LLM mocking).
"""

from __future__ import annotations

import os

# Set required env vars before any app module imports
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")

from uuid import uuid4

import pytest

from tests.factories import make_conversation, make_dataset, make_message


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------


async def _insert_conversation(db, conv):
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def _insert_message(db, msg):
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg.get("sql_query"),
            msg.get("token_count", 0),
            msg["created_at"],
        ),
    )
    await db.commit()


async def _insert_dataset(db, ds):
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            ds["id"],
            ds["conversation_id"],
            ds["url"],
            ds["name"],
            ds["row_count"],
            ds["column_count"],
            ds["schema_json"],
            ds.get("status", "ready"),
            ds["loaded_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# POST /conversations -- Create conversation
# ---------------------------------------------------------------------------


class TestCreateConversation:
    async def test_create_returns_201(self, authed_client):
        resp = await authed_client.post("/conversations")
        assert resp.status_code == 201

    async def test_create_returns_id_and_title(self, authed_client):
        resp = await authed_client.post("/conversations")
        data = resp.json()
        assert "id" in data
        assert "title" in data
        assert isinstance(data["id"], str)
        assert len(data["id"]) > 0

    async def test_create_returns_empty_title(self, authed_client):
        resp = await authed_client.post("/conversations")
        data = resp.json()
        assert data["title"] == ""

    async def test_create_returns_created_at(self, authed_client):
        resp = await authed_client.post("/conversations")
        data = resp.json()
        assert "created_at" in data


# ---------------------------------------------------------------------------
# GET /conversations -- List conversations
# ---------------------------------------------------------------------------


class TestListConversations:
    async def test_list_empty(self, authed_client):
        resp = await authed_client.get("/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["conversations"] == []

    async def test_list_returns_conversations(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"], title="My Chat")
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.get("/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["conversations"]) == 1
        assert data["conversations"][0]["id"] == conv["id"]
        assert data["conversations"][0]["title"] == "My Chat"

    async def test_list_includes_counts(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        msg = make_message(conversation_id=conv["id"], role="user", content="Hi")
        await _insert_message(fresh_db, msg)

        ds = make_dataset(conversation_id=conv["id"], status="ready")
        await _insert_dataset(fresh_db, ds)

        resp = await authed_client.get("/conversations")
        data = resp.json()
        summary = data["conversations"][0]
        assert summary["dataset_count"] == 1
        assert summary["message_count"] == 1

    async def test_list_sorted_by_updated_at_desc(self, authed_client, fresh_db, test_user):
        conv_old = make_conversation(
            user_id=test_user["id"], title="Old", updated_at="2024-01-01T00:00:00"
        )
        conv_new = make_conversation(
            user_id=test_user["id"], title="New", updated_at="2024-06-01T00:00:00"
        )
        await _insert_conversation(fresh_db, conv_old)
        await _insert_conversation(fresh_db, conv_new)

        resp = await authed_client.get("/conversations")
        titles = [c["title"] for c in resp.json()["conversations"]]
        assert titles == ["New", "Old"]


# ---------------------------------------------------------------------------
# GET /conversations/{id} -- Get conversation detail
# ---------------------------------------------------------------------------


class TestGetConversationDetail:
    async def test_get_returns_conversation(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"], title="Detail Test")
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.get(f"/conversations/{conv['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == conv["id"]
        assert data["title"] == "Detail Test"
        assert "messages" in data
        assert "datasets" in data
        assert isinstance(data["messages"], list)
        assert isinstance(data["datasets"], list)

    async def test_get_includes_messages(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        msg = make_message(conversation_id=conv["id"], role="user", content="Test msg")
        await _insert_message(fresh_db, msg)

        resp = await authed_client.get(f"/conversations/{conv['id']}")
        data = resp.json()
        assert len(data["messages"]) == 1
        assert data["messages"][0]["content"] == "Test msg"
        assert data["messages"][0]["role"] == "user"

    async def test_get_includes_datasets(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        ds = make_dataset(conversation_id=conv["id"], name="sales", status="ready")
        await _insert_dataset(fresh_db, ds)

        resp = await authed_client.get(f"/conversations/{conv['id']}")
        data = resp.json()
        assert len(data["datasets"]) == 1
        assert data["datasets"][0]["name"] == "sales"

    async def test_get_nonexistent_returns_404(self, authed_client):
        resp = await authed_client.get(f"/conversations/{uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /conversations/{id} -- Rename conversation
# ---------------------------------------------------------------------------


class TestRenameConversation:
    async def test_rename_updates_title(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"], title="Old Title")
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.patch(
            f"/conversations/{conv['id']}", json={"title": "New Title"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "New Title"
        assert data["id"] == conv["id"]

    async def test_rename_nonexistent_returns_404(self, authed_client):
        resp = await authed_client.patch(
            f"/conversations/{uuid4()}", json={"title": "Nope"}
        )
        assert resp.status_code == 404

    async def test_rename_empty_title_returns_422(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.patch(
            f"/conversations/{conv['id']}", json={"title": ""}
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /conversations/{id} -- Delete conversation
# ---------------------------------------------------------------------------


class TestDeleteConversation:
    async def test_delete_returns_200(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.delete(f"/conversations/{conv['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    async def test_delete_removes_conversation(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        await authed_client.delete(f"/conversations/{conv['id']}")

        # Verify it no longer exists
        resp = await authed_client.get(f"/conversations/{conv['id']}")
        assert resp.status_code == 404

    async def test_delete_nonexistent_returns_404(self, authed_client):
        resp = await authed_client.delete(f"/conversations/{uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /conversations/{id}/fork -- Fork conversation
# ---------------------------------------------------------------------------


class TestForkConversation:
    async def test_fork_creates_new_conversation(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"], title="Original")
        await _insert_conversation(fresh_db, conv)

        msg = make_message(conversation_id=conv["id"], role="user", content="Q1")
        await _insert_message(fresh_db, msg)

        resp = await authed_client.post(
            f"/conversations/{conv['id']}/fork", json={"message_id": msg["id"]}
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["id"] != conv["id"]
        assert "title" in data

    async def test_fork_copies_messages_up_to_specified(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"], title="Original")
        await _insert_conversation(fresh_db, conv)

        msg1 = make_message(
            conversation_id=conv["id"], role="user", content="Q1",
            created_at="2024-01-01T00:00:01",
        )
        msg2 = make_message(
            conversation_id=conv["id"], role="assistant", content="A1",
            created_at="2024-01-01T00:00:02",
        )
        msg3 = make_message(
            conversation_id=conv["id"], role="user", content="Q2",
            created_at="2024-01-01T00:00:03",
        )
        await _insert_message(fresh_db, msg1)
        await _insert_message(fresh_db, msg2)
        await _insert_message(fresh_db, msg3)

        resp = await authed_client.post(
            f"/conversations/{conv['id']}/fork", json={"message_id": msg2["id"]}
        )
        fork_id = resp.json()["id"]

        detail = await authed_client.get(f"/conversations/{fork_id}")
        assert detail.status_code == 200
        messages = detail.json()["messages"]
        # Should contain msg1 and msg2 but NOT msg3
        assert len(messages) == 2

    async def test_fork_copies_datasets(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        msg = make_message(conversation_id=conv["id"])
        await _insert_message(fresh_db, msg)

        ds = make_dataset(conversation_id=conv["id"], name="test_ds", status="ready")
        await _insert_dataset(fresh_db, ds)

        resp = await authed_client.post(
            f"/conversations/{conv['id']}/fork", json={"message_id": msg["id"]}
        )
        fork_id = resp.json()["id"]

        detail = await authed_client.get(f"/conversations/{fork_id}")
        assert len(detail.json()["datasets"]) == 1
        assert detail.json()["datasets"][0]["name"] == "test_ds"

    async def test_fork_nonexistent_message_returns_404(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.post(
            f"/conversations/{conv['id']}/fork", json={"message_id": str(uuid4())}
        )
        assert resp.status_code == 404

    async def test_fork_nonexistent_conversation_returns_404(self, authed_client):
        resp = await authed_client.post(
            f"/conversations/{uuid4()}/fork", json={"message_id": str(uuid4())}
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /conversations -- Clear all conversations
# ---------------------------------------------------------------------------


class TestClearAllConversations:
    async def test_clear_all_empty(self, authed_client):
        resp = await authed_client.delete("/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["deleted_count"] == 0

    async def test_clear_all_deletes_all(self, authed_client, fresh_db, test_user):
        for i in range(3):
            conv = make_conversation(user_id=test_user["id"], title=f"Conv {i}")
            await _insert_conversation(fresh_db, conv)

        resp = await authed_client.delete("/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted_count"] == 3

        # Verify none remain
        list_resp = await authed_client.get("/conversations")
        assert list_resp.json()["conversations"] == []


# ---------------------------------------------------------------------------
# POST /conversations/bulk-delete -- Bulk delete
# ---------------------------------------------------------------------------


class TestBulkDeleteConversations:
    async def test_bulk_delete_multiple(self, authed_client, fresh_db, test_user):
        ids = []
        for i in range(3):
            conv = make_conversation(user_id=test_user["id"], title=f"Conv {i}")
            await _insert_conversation(fresh_db, conv)
            ids.append(conv["id"])

        resp = await authed_client.post(
            "/conversations/bulk-delete", json={"ids": ids[:2]}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] == 2

        # Third conversation should still exist
        list_resp = await authed_client.get("/conversations")
        remaining = list_resp.json()["conversations"]
        assert len(remaining) == 1
        assert remaining[0]["id"] == ids[2]

    async def test_bulk_delete_nonexistent_ids(self, authed_client):
        resp = await authed_client.post(
            "/conversations/bulk-delete", json={"ids": [str(uuid4()), str(uuid4())]}
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 0

    async def test_bulk_delete_empty_ids_returns_400(self, authed_client):
        resp = await authed_client.post(
            "/conversations/bulk-delete", json={"ids": []}
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /conversations/{id}/pin -- Pin/unpin
# ---------------------------------------------------------------------------


class TestPinConversation:
    async def test_pin_conversation(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.patch(
            f"/conversations/{conv['id']}/pin", json={"is_pinned": True}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_pinned"] is True
        assert data["id"] == conv["id"]

    async def test_unpin_conversation(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        # Pin it first
        await authed_client.patch(
            f"/conversations/{conv['id']}/pin", json={"is_pinned": True}
        )
        # Unpin it
        resp = await authed_client.patch(
            f"/conversations/{conv['id']}/pin", json={"is_pinned": False}
        )
        assert resp.status_code == 200
        assert resp.json()["is_pinned"] is False

    async def test_pin_nonexistent_returns_404(self, authed_client):
        resp = await authed_client.patch(
            f"/conversations/{uuid4()}/pin", json={"is_pinned": True}
        )
        assert resp.status_code == 404

    async def test_pinned_conversations_appear_first(self, authed_client, fresh_db, test_user):
        conv_unpinned = make_conversation(
            user_id=test_user["id"], title="Unpinned", updated_at="2024-06-01T00:00:00"
        )
        conv_pinned = make_conversation(
            user_id=test_user["id"], title="Pinned", updated_at="2024-01-01T00:00:00"
        )
        await _insert_conversation(fresh_db, conv_unpinned)
        await _insert_conversation(fresh_db, conv_pinned)

        # Pin the older conversation
        await authed_client.patch(
            f"/conversations/{conv_pinned['id']}/pin", json={"is_pinned": True}
        )

        resp = await authed_client.get("/conversations")
        titles = [c["title"] for c in resp.json()["conversations"]]
        # Pinned should come first despite being older
        assert titles[0] == "Pinned"


# ---------------------------------------------------------------------------
# DELETE /conversations/{id}/messages/{message_id} -- Delete message
# ---------------------------------------------------------------------------


class TestDeleteMessage:
    async def test_delete_message_success(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        msg = make_message(conversation_id=conv["id"], role="user", content="delete me")
        await _insert_message(fresh_db, msg)

        resp = await authed_client.delete(
            f"/conversations/{conv['id']}/messages/{msg['id']}"
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_delete_message_not_found(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.delete(
            f"/conversations/{conv['id']}/messages/{uuid4()}"
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /conversations/{id}/token-usage -- Token usage
# ---------------------------------------------------------------------------


class TestTokenUsage:
    async def test_token_usage_empty(self, authed_client, fresh_db, test_user):
        conv = make_conversation(user_id=test_user["id"])
        await _insert_conversation(fresh_db, conv)

        resp = await authed_client.get(f"/conversations/{conv['id']}/token-usage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_input_tokens"] == 0
        assert data["total_output_tokens"] == 0
        assert data["total_tokens"] == 0
        assert data["request_count"] == 0
