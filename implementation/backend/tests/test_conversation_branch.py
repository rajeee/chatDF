"""Tests for conversation fork endpoint.

Covers:
- POST /conversations/{id}/fork -> fork from a middle message copies only messages up to that point
- POST /conversations/{id}/fork -> forking copies datasets
- POST /conversations/{id}/fork -> forking with invalid message ID returns 404
- POST /conversations/{id}/fork -> the new conversation has correct title
- POST /conversations/{id}/fork -> requires authentication
"""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from uuid import uuid4  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_session, make_user  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _insert_user(db: aiosqlite.Connection, user: dict) -> None:
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            user["google_id"],
            user["email"],
            user["name"],
            user["avatar_url"],
            user["created_at"],
            user["last_login_at"],
        ),
    )
    await db.commit()


async def _insert_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            session["id"],
            session["user_id"],
            session["created_at"],
            session["expires_at"],
        ),
    )
    await db.commit()


async def _create_conversation(
    db: aiosqlite.Connection, user_id: str, title: str = "Test Conversation"
) -> str:
    """Insert a conversation and return its id."""
    conv_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, user_id, title, now, now),
    )
    await db.commit()
    return conv_id


async def _create_message(
    db: aiosqlite.Connection,
    conversation_id: str,
    role: str,
    content: str,
    created_at: str | None = None,
) -> str:
    """Insert a message and return its id."""
    msg_id = str(uuid4())
    if created_at is None:
        created_at = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (msg_id, conversation_id, role, content, 0, created_at),
    )
    await db.commit()
    return msg_id


async def _create_dataset(
    db: aiosqlite.Connection,
    conversation_id: str,
    url: str = "https://example.com/data.csv",
    name: str = "data",
) -> str:
    """Insert a dataset and return its id."""
    ds_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, loaded_at, column_descriptions) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ds_id, conversation_id, url, name, 100, 5, '[{"name": "id", "type": "INTEGER"}]', "ready", now, "{}"),
    )
    await db.commit()
    return ds_id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database with the full ChatDF schema."""
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA_SQL)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def test_user(fresh_db):
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_session(fresh_db, test_user):
    session = make_session(user_id=test_user["id"])
    await _insert_session(fresh_db, session)
    return session


@pytest_asyncio.fixture
async def authed_client(fresh_db, test_session):
    """Authenticated httpx client with session cookie."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as c:
        yield c


@pytest_asyncio.fixture
async def client(fresh_db):
    """Unauthenticated httpx client."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


# =========================================================================
# Tests
# =========================================================================


class TestForkConversation:
    """POST /conversations/{id}/fork tests."""

    @pytest.mark.asyncio
    async def test_fork_from_middle_message(self, authed_client, fresh_db, test_user):
        """Forking from a middle message copies only messages up to that point."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "Original Chat")

        msg1_id = await _create_message(
            fresh_db, conv_id, "user", "First message", "2025-01-01T10:00:00"
        )
        msg2_id = await _create_message(
            fresh_db, conv_id, "assistant", "Second message", "2025-01-01T10:00:05"
        )
        msg3_id = await _create_message(
            fresh_db, conv_id, "user", "Third message", "2025-01-01T10:00:10"
        )
        msg4_id = await _create_message(
            fresh_db, conv_id, "assistant", "Fourth message", "2025-01-01T10:00:15"
        )

        # Fork from message 2 (the first assistant response)
        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg2_id},
        )
        assert response.status_code == 201
        data = response.json()
        fork_id = data["id"]

        # Verify only 2 messages were copied (msg1 and msg2)
        cursor = await fresh_db.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at",
            (fork_id,),
        )
        rows = await cursor.fetchall()
        assert len(rows) == 2
        assert rows[0]["content"] == "First message"
        assert rows[0]["role"] == "user"
        assert rows[1]["content"] == "Second message"
        assert rows[1]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_fork_copies_datasets(self, authed_client, fresh_db, test_user):
        """Forking copies all datasets from the source conversation."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "Data Chat")

        msg_id = await _create_message(
            fresh_db, conv_id, "user", "Analyze my data"
        )

        # Add two datasets
        await _create_dataset(fresh_db, conv_id, "https://example.com/a.csv", "dataset_a")
        await _create_dataset(fresh_db, conv_id, "https://example.com/b.csv", "dataset_b")

        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg_id},
        )
        assert response.status_code == 201
        fork_id = response.json()["id"]

        # Verify datasets were copied
        cursor = await fresh_db.execute(
            "SELECT name, url FROM datasets WHERE conversation_id = ? ORDER BY name",
            (fork_id,),
        )
        rows = await cursor.fetchall()
        assert len(rows) == 2
        assert rows[0]["name"] == "dataset_a"
        assert rows[0]["url"] == "https://example.com/a.csv"
        assert rows[1]["name"] == "dataset_b"
        assert rows[1]["url"] == "https://example.com/b.csv"

    @pytest.mark.asyncio
    async def test_fork_invalid_message_id(self, authed_client, fresh_db, test_user):
        """Forking with an invalid message ID returns 404."""
        conv_id = await _create_conversation(fresh_db, test_user["id"])
        await _create_message(fresh_db, conv_id, "user", "Hello")

        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": "nonexistent-msg-id"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_fork_correct_title(self, authed_client, fresh_db, test_user):
        """The new conversation has the correct 'Fork of ...' title."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "My Analysis")

        msg_id = await _create_message(fresh_db, conv_id, "user", "Hello")

        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg_id},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Fork of My Analysis"

    @pytest.mark.asyncio
    async def test_fork_empty_title(self, authed_client, fresh_db, test_user):
        """When source conversation has empty title, fork uses default title."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "")

        msg_id = await _create_message(fresh_db, conv_id, "user", "Hello")

        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg_id},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Forked conversation"

    @pytest.mark.asyncio
    async def test_fork_requires_auth(self, client, fresh_db):
        """Fork endpoint requires authentication."""
        response = await client.post(
            "/conversations/fake-id/fork",
            json={"message_id": "some-msg"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_fork_from_last_message(self, authed_client, fresh_db, test_user):
        """Forking from the last message copies all messages."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "Full Copy")

        msg1_id = await _create_message(
            fresh_db, conv_id, "user", "First", "2025-01-01T10:00:00"
        )
        msg2_id = await _create_message(
            fresh_db, conv_id, "assistant", "Second", "2025-01-01T10:00:05"
        )
        msg3_id = await _create_message(
            fresh_db, conv_id, "user", "Third", "2025-01-01T10:00:10"
        )

        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg3_id},
        )
        assert response.status_code == 201
        fork_id = response.json()["id"]

        cursor = await fresh_db.execute(
            "SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ?",
            (fork_id,),
        )
        row = await cursor.fetchone()
        assert row["cnt"] == 3

    @pytest.mark.asyncio
    async def test_fork_from_first_message(self, authed_client, fresh_db, test_user):
        """Forking from the first message copies only that one message."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "Single Fork")

        msg1_id = await _create_message(
            fresh_db, conv_id, "user", "First", "2025-01-01T10:00:00"
        )
        await _create_message(
            fresh_db, conv_id, "assistant", "Second", "2025-01-01T10:00:05"
        )
        await _create_message(
            fresh_db, conv_id, "user", "Third", "2025-01-01T10:00:10"
        )

        response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg1_id},
        )
        assert response.status_code == 201
        fork_id = response.json()["id"]

        cursor = await fresh_db.execute(
            "SELECT content FROM messages WHERE conversation_id = ?",
            (fork_id,),
        )
        rows = await cursor.fetchall()
        assert len(rows) == 1
        assert rows[0]["content"] == "First"

    @pytest.mark.asyncio
    async def test_fork_appears_in_conversation_list(
        self, authed_client, fresh_db, test_user
    ):
        """Forked conversation appears in the conversation list."""
        conv_id = await _create_conversation(fresh_db, test_user["id"], "Source")
        msg_id = await _create_message(fresh_db, conv_id, "user", "Hello")

        fork_response = await authed_client.post(
            f"/conversations/{conv_id}/fork",
            json={"message_id": msg_id},
        )
        assert fork_response.status_code == 201
        fork_id = fork_response.json()["id"]

        list_response = await authed_client.get("/conversations")
        assert list_response.status_code == 200
        conversations = list_response.json()["conversations"]
        ids = [c["id"] for c in conversations]
        assert fork_id in ids
