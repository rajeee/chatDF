"""Tests for conversation import endpoint.

Covers:
- POST /conversations/import -> successful import with messages and datasets
- POST /conversations/import -> import with empty messages array
- POST /conversations/import -> validation errors (missing fields, bad types)
- POST /conversations/import -> message limit validation
- POST /conversations/import -> requires authentication
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


class TestImportConversation:
    """POST /conversations/import tests."""

    @pytest.mark.asyncio
    async def test_import_with_messages_and_datasets(self, authed_client, fresh_db):
        """Import a full conversation with messages and datasets."""
        payload = {
            "title": "My exported conversation",
            "messages": [
                {
                    "role": "user",
                    "content": "Hello, can you help me?",
                    "timestamp": "2025-01-01T10:00:00",
                },
                {
                    "role": "assistant",
                    "content": "Sure! What do you need?",
                    "timestamp": "2025-01-01T10:00:05",
                    "sql_query": "SELECT * FROM data",
                    "reasoning": "User asked for help",
                },
            ],
            "datasets": [
                {
                    "url": "https://example.com/data.csv",
                    "name": "data",
                    "row_count": 100,
                    "column_count": 5,
                    "schema_json": '[{"name": "id", "type": "INTEGER"}]',
                },
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["title"] == "My exported conversation"

        # Verify messages were created in the database
        conv_id = data["id"]
        cursor = await fresh_db.execute(
            "SELECT role, content, sql_query, reasoning FROM messages WHERE conversation_id = ? ORDER BY created_at",
            (conv_id,),
        )
        rows = await cursor.fetchall()
        assert len(rows) == 2
        assert rows[0]["role"] == "user"
        assert rows[0]["content"] == "Hello, can you help me?"
        assert rows[1]["role"] == "assistant"
        assert rows[1]["content"] == "Sure! What do you need?"
        assert rows[1]["sql_query"] == "SELECT * FROM data"
        assert rows[1]["reasoning"] == "User asked for help"

        # Verify datasets were created
        cursor = await fresh_db.execute(
            "SELECT url, name, status, row_count FROM datasets WHERE conversation_id = ?",
            (conv_id,),
        )
        ds_rows = await cursor.fetchall()
        assert len(ds_rows) == 1
        assert ds_rows[0]["url"] == "https://example.com/data.csv"
        assert ds_rows[0]["name"] == "data"
        assert ds_rows[0]["status"] == "ready"
        assert ds_rows[0]["row_count"] == 100

    @pytest.mark.asyncio
    async def test_import_with_empty_messages(self, authed_client, fresh_db):
        """Import a conversation with no messages."""
        payload = {
            "title": "Empty conversation",
            "messages": [],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Empty conversation"

        # Verify conversation exists but has no messages
        cursor = await fresh_db.execute(
            "SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ?",
            (data["id"],),
        )
        row = await cursor.fetchone()
        assert row["cnt"] == 0

    @pytest.mark.asyncio
    async def test_import_without_title_defaults_to_empty(self, authed_client):
        """Import without a title field defaults to empty string."""
        payload = {
            "messages": [
                {"role": "user", "content": "Hello"},
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 201
        assert response.json()["title"] == ""

    @pytest.mark.asyncio
    async def test_import_title_truncated_to_100_chars(self, authed_client):
        """Titles longer than 100 characters are truncated."""
        payload = {
            "title": "A" * 200,
            "messages": [],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 201
        assert response.json()["title"] == "A" * 100

    @pytest.mark.asyncio
    async def test_import_validation_messages_not_array(self, authed_client):
        """Messages must be an array."""
        payload = {
            "title": "Test",
            "messages": "not an array",
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "messages must be an array" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_message_missing_role(self, authed_client):
        """Each message must have a valid role."""
        payload = {
            "title": "Test",
            "messages": [
                {"content": "No role here"},
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "role" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_message_invalid_role(self, authed_client):
        """Message role must be 'user' or 'assistant'."""
        payload = {
            "title": "Test",
            "messages": [
                {"role": "system", "content": "Invalid role"},
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "role" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_message_missing_content(self, authed_client):
        """Each message must have content."""
        payload = {
            "title": "Test",
            "messages": [
                {"role": "user"},
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "content" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_message_limit(self, authed_client):
        """Messages array cannot exceed 1000 items."""
        payload = {
            "title": "Test",
            "messages": [
                {"role": "user", "content": f"Message {i}"}
                for i in range(1001)
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "1000" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_datasets_not_array(self, authed_client):
        """Datasets must be an array."""
        payload = {
            "title": "Test",
            "messages": [],
            "datasets": "not an array",
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "datasets must be an array" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_dataset_missing_url(self, authed_client):
        """Each dataset must have a url."""
        payload = {
            "title": "Test",
            "messages": [],
            "datasets": [
                {"name": "no_url"},
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "url" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_validation_dataset_limit(self, authed_client):
        """Datasets array cannot exceed 50 items."""
        payload = {
            "title": "Test",
            "messages": [],
            "datasets": [
                {"url": f"https://example.com/data{i}.csv"}
                for i in range(51)
            ],
        }

        response = await authed_client.post("/conversations/import", json=payload)
        assert response.status_code == 400
        assert "50" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_import_requires_auth(self, client):
        """Import requires authentication."""
        payload = {
            "title": "Test",
            "messages": [],
        }

        response = await client.post("/conversations/import", json=payload)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_import_conversation_appears_in_list(self, authed_client):
        """Imported conversation appears in the conversation list."""
        payload = {
            "title": "Imported Chat",
            "messages": [
                {"role": "user", "content": "Test message"},
            ],
        }

        import_response = await authed_client.post("/conversations/import", json=payload)
        assert import_response.status_code == 201
        conv_id = import_response.json()["id"]

        # Verify it appears in the conversation list
        list_response = await authed_client.get("/conversations")
        assert list_response.status_code == 200
        conversations = list_response.json()["conversations"]
        ids = [c["id"] for c in conversations]
        assert conv_id in ids
