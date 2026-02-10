"""Tests for previously untested endpoints.

Covers:
- POST /auth/dev-login
- POST /conversations/{id}/messages/{msg_id}/redo
- POST /conversations/{id}/explain-sql
- POST /conversations/{id}/prompt-preview
- POST /health/cache/clear and POST /health/cache/cleanup
- GET/PATCH column-descriptions
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_dataset, make_message, make_referral_key
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
    insert_referral_key,
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
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
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


async def insert_dataset_with_descriptions(db, ds: dict, descriptions: str) -> None:
    """Insert a dataset row including the column_descriptions column."""
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, "
        "status, error_message, loaded_at, column_descriptions) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            descriptions,
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def unauthed_client(fresh_db):
    """httpx.AsyncClient without a session cookie."""
    from app.main import app
    from httpx import ASGITransport, AsyncClient

    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    """A conversation owned by the default test_user."""
    conv = make_conversation(user_id=test_user["id"], title="Test Conv")
    await insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def authed_client_with_ws(fresh_db, test_session):
    """Authenticated client with mocked connection_manager and worker_pool on app.state."""
    from app.main import app
    from httpx import ASGITransport, AsyncClient

    app.state.db = fresh_db
    app.state.connection_manager = MagicMock()
    app.state.connection_manager.send_to_user = AsyncMock()
    app.state.worker_pool = MagicMock()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as client:
        yield client


@pytest.fixture
def mock_process_message():
    with patch("app.services.chat_service.process_message", new_callable=AsyncMock) as mock:
        yield mock


# ===========================================================================
# 1. POST /auth/dev-login
# ===========================================================================


class TestDevLogin:
    """POST /auth/dev-login endpoint."""

    @pytest.mark.asyncio
    async def test_new_dev_user_with_valid_referral_key(self, fresh_db, unauthed_client):
        """New dev user with a valid (unused) referral key succeeds and sets session cookie."""
        ref_key = make_referral_key(key="valid-dev-key")
        await insert_referral_key(fresh_db, ref_key)

        response = await unauthed_client.post(
            "/auth/dev-login",
            json={"referral_key": "valid-dev-key"},
        )

        body = assert_success_response(response, 200)
        assert body["success"] is True

        # Should set session_token cookie
        set_cookie = response.headers.get("set-cookie", "")
        assert "session_token" in set_cookie

        # Verify user was created in DB
        cursor = await fresh_db.execute(
            "SELECT * FROM users WHERE google_id = ?", ("dev-user-local",)
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row["email"] == "dev@localhost"

        # Verify referral key was marked as used
        cursor = await fresh_db.execute(
            "SELECT used_by FROM referral_keys WHERE key = ?", ("valid-dev-key",)
        )
        key_row = await cursor.fetchone()
        assert key_row["used_by"] is not None

    @pytest.mark.asyncio
    async def test_existing_dev_user_re_login(self, fresh_db, unauthed_client):
        """Existing dev user re-login skips referral key check and succeeds."""
        from tests.factories import make_user

        # Seed a dev user with google_id="dev-user-local"
        dev_user = make_user(google_id="dev-user-local", email="dev@localhost", name="Dev User")
        await insert_user(fresh_db, dev_user)

        response = await unauthed_client.post(
            "/auth/dev-login",
            json={"referral_key": "any-key-doesnt-matter"},
        )

        body = assert_success_response(response, 200)
        assert body["success"] is True

        # Should set session_token cookie
        set_cookie = response.headers.get("set-cookie", "")
        assert "session_token" in set_cookie

    @pytest.mark.asyncio
    async def test_invalid_referral_key(self, fresh_db, unauthed_client):
        """New dev user with invalid referral key returns 400 error."""
        response = await unauthed_client.post(
            "/auth/dev-login",
            json={"referral_key": "nonexistent-key"},
        )

        assert response.status_code == 400
        body = response.json()
        assert body["error"] == "invalid_referral_key"


# ===========================================================================
# 2. POST /conversations/{id}/messages/{msg_id}/redo
# ===========================================================================


class TestRedoMessage:
    """POST /conversations/{id}/messages/{msg_id}/redo endpoint."""

    @pytest.mark.asyncio
    async def test_successful_redo(
        self, fresh_db, test_user, conversation_owned,
        authed_client_with_ws, mock_process_message,
    ):
        """Redo an assistant message: deletes both messages and re-processes."""
        import asyncio

        conv_id = conversation_owned["id"]

        # Create a user message followed by an assistant message
        user_msg = make_message(
            conversation_id=conv_id,
            role="user",
            content="What is the data?",
            created_at="2024-01-01T00:00:01",
        )
        await insert_message(fresh_db, user_msg)

        assistant_msg = make_message(
            conversation_id=conv_id,
            role="assistant",
            content="Here is your analysis.",
            created_at="2024-01-01T00:00:02",
        )
        await insert_message(fresh_db, assistant_msg)

        response = await authed_client_with_ws.post(
            f"/conversations/{conv_id}/messages/{assistant_msg['id']}/redo",
        )

        body = assert_success_response(response, 200)
        assert body["status"] == "processing"
        assert body["message_id"] == assistant_msg["id"]

        # Give the background task time to run
        await asyncio.sleep(0.2)

        # Verify both old messages were deleted
        cursor = await fresh_db.execute(
            "SELECT id FROM messages WHERE id = ?", (assistant_msg["id"],)
        )
        assert await cursor.fetchone() is None

        cursor = await fresh_db.execute(
            "SELECT id FROM messages WHERE id = ?", (user_msg["id"],)
        )
        assert await cursor.fetchone() is None

        # Verify process_message was called with the original user content
        mock_process_message.assert_called_once()
        call_kwargs = mock_process_message.call_args
        # call_args can be positional or keyword -- check keyword args
        assert call_kwargs.kwargs["content"] == "What is the data?"
        assert call_kwargs.kwargs["conversation_id"] == conv_id

    @pytest.mark.asyncio
    async def test_redo_non_assistant_message(
        self, fresh_db, test_user, conversation_owned, authed_client_with_ws,
    ):
        """Redo of a user message returns 400."""
        conv_id = conversation_owned["id"]

        user_msg = make_message(
            conversation_id=conv_id,
            role="user",
            content="Hello",
        )
        await insert_message(fresh_db, user_msg)

        response = await authed_client_with_ws.post(
            f"/conversations/{conv_id}/messages/{user_msg['id']}/redo",
        )

        assert_error_response(response, 400, "Can only redo assistant messages")

    @pytest.mark.asyncio
    async def test_redo_message_not_found(
        self, fresh_db, test_user, conversation_owned, authed_client_with_ws,
    ):
        """Redo of a nonexistent message returns 404."""
        conv_id = conversation_owned["id"]
        fake_msg_id = str(uuid4())

        response = await authed_client_with_ws.post(
            f"/conversations/{conv_id}/messages/{fake_msg_id}/redo",
        )

        assert_error_response(response, 404, "Message not found")


# ===========================================================================
# 3. POST /conversations/{id}/explain-sql
# ===========================================================================


class TestExplainSql:
    """POST /conversations/{id}/explain-sql endpoint."""

    @pytest.mark.asyncio
    async def test_successful_explain(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """Successful SQL explanation returns 200 with explanation text."""
        conv_id = conversation_owned["id"]

        mock_response = MagicMock()
        mock_response.text = "This query selects all rows from the table."
        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("app.services.llm_service.client", mock_client), \
             patch("app.services.llm_service.MODEL_ID", "test-model"):
            response = await authed_client.post(
                f"/conversations/{conv_id}/explain-sql",
                json={"query": "SELECT * FROM t", "schema_json": "[]"},
            )

        body = assert_success_response(response, 200)
        assert body["explanation"] == "This query selects all rows from the table."

    @pytest.mark.asyncio
    async def test_llm_error_returns_502(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """LLM error returns 502."""
        conv_id = conversation_owned["id"]

        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(
            side_effect=RuntimeError("Gemini unavailable")
        )

        with patch("app.services.llm_service.client", mock_client), \
             patch("app.services.llm_service.MODEL_ID", "test-model"):
            response = await authed_client.post(
                f"/conversations/{conv_id}/explain-sql",
                json={"query": "SELECT 1", "schema_json": "[]"},
            )

        assert_error_response(response, 502, "LLM error")


# ===========================================================================
# 4. POST /conversations/{id}/prompt-preview
# ===========================================================================


class TestPromptPreview:
    """POST /conversations/{id}/prompt-preview endpoint."""

    @pytest.mark.asyncio
    async def test_successful_preview_with_dataset(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """Prompt preview with a dataset returns expected fields."""
        conv_id = conversation_owned["id"]

        # Add a ready dataset to the conversation
        ds = make_dataset(
            conversation_id=conv_id,
            name="sales",
            status="ready",
            row_count=100,
            column_count=3,
            schema_json=json.dumps([
                {"name": "id", "type": "INTEGER"},
                {"name": "amount", "type": "FLOAT"},
                {"name": "date", "type": "TEXT"},
            ]),
        )
        await insert_dataset(fresh_db, ds)

        response = await authed_client.post(
            f"/conversations/{conv_id}/prompt-preview",
            json={"content": "What is the total sales amount?"},
        )

        body = assert_success_response(response, 200)
        assert "system_prompt" in body
        assert "messages" in body
        assert "tools" in body
        assert body["new_message"] == "What is the total sales amount?"
        assert "estimated_tokens" in body
        assert isinstance(body["estimated_tokens"], int)
        assert body["estimated_tokens"] > 0

        # Tools should include execute_sql and load_dataset at minimum
        assert len(body["tools"]) > 0

    @pytest.mark.asyncio
    async def test_preview_with_no_datasets(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """Prompt preview with no datasets still returns a valid prompt."""
        conv_id = conversation_owned["id"]

        response = await authed_client.post(
            f"/conversations/{conv_id}/prompt-preview",
            json={"content": "Hello"},
        )

        body = assert_success_response(response, 200)
        assert "system_prompt" in body
        assert isinstance(body["system_prompt"], str)
        assert body["new_message"] == "Hello"
        assert "tools" in body


# ===========================================================================
# 5. POST /health/cache/clear and POST /health/cache/cleanup
# ===========================================================================


class TestHealthCacheEndpoints:
    """Health cache management endpoints."""

    @pytest.mark.asyncio
    async def test_cache_clear_success(self, fresh_db, unauthed_client):
        """POST /health/cache/clear with a working worker pool returns success."""
        from app.main import app

        mock_cache = MagicMock()
        mock_pool = MagicMock()
        mock_pool.query_cache = mock_cache
        app.state.worker_pool = mock_pool

        response = await unauthed_client.post("/health/cache/clear")

        body = assert_success_response(response, 200)
        assert body["success"] is True
        assert "message" in body

        # Verify cache.clear() was called
        mock_cache.clear.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_cleanup_success(self, fresh_db, unauthed_client):
        """POST /health/cache/cleanup with a working worker pool returns success."""
        from app.main import app

        mock_write_conn = MagicMock()
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        mock_pool = MagicMock()
        mock_pool.db_pool = mock_db_pool

        app.state.worker_pool = mock_pool

        with patch("app.routers.health.persistent_cache") as mock_persistent:
            mock_persistent.cleanup = AsyncMock(return_value=5)

            response = await unauthed_client.post("/health/cache/cleanup")

        body = assert_success_response(response, 200)
        assert body["success"] is True
        assert body["removed"] == 5

    @pytest.mark.asyncio
    async def test_cache_clear_no_worker_pool(self, fresh_db, unauthed_client):
        """POST /health/cache/clear with no worker pool returns 503."""
        from app.main import app

        app.state.worker_pool = None

        response = await unauthed_client.post("/health/cache/clear")

        assert_error_response(response, 503, "Worker pool unavailable")


# ===========================================================================
# 6. GET/PATCH column-descriptions
# ===========================================================================


class TestColumnDescriptions:
    """GET and PATCH column-descriptions endpoints."""

    @pytest.mark.asyncio
    async def test_get_column_descriptions(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """GET returns the descriptions dict for a dataset."""
        conv_id = conversation_owned["id"]

        descriptions = {"id": "Primary key", "amount": "Transaction amount in USD"}
        ds = make_dataset(
            conversation_id=conv_id,
            name="sales",
            status="ready",
        )
        await insert_dataset_with_descriptions(
            fresh_db, ds, json.dumps(descriptions)
        )

        response = await authed_client.get(
            f"/conversations/{conv_id}/datasets/{ds['id']}/column-descriptions",
        )

        body = assert_success_response(response, 200)
        assert body["descriptions"] == descriptions

    @pytest.mark.asyncio
    async def test_update_column_descriptions(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """PATCH updates the descriptions and returns success."""
        conv_id = conversation_owned["id"]

        ds = make_dataset(
            conversation_id=conv_id,
            name="sales",
            status="ready",
        )
        await insert_dataset(fresh_db, ds)

        new_descriptions = {"col_a": "First column", "col_b": "Second column"}
        response = await authed_client.patch(
            f"/conversations/{conv_id}/datasets/{ds['id']}/column-descriptions",
            json={"descriptions": new_descriptions},
        )

        body = assert_success_response(response, 200)
        assert body["success"] is True
        assert body["descriptions"] == new_descriptions

        # Verify DB was updated
        cursor = await fresh_db.execute(
            "SELECT column_descriptions FROM datasets WHERE id = ?", (ds["id"],)
        )
        row = await cursor.fetchone()
        stored = json.loads(row["column_descriptions"])
        assert stored == new_descriptions

    @pytest.mark.asyncio
    async def test_update_column_descriptions_exceeds_limit(
        self, fresh_db, test_user, conversation_owned, authed_client,
    ):
        """PATCH with a description exceeding 500 chars returns 400."""
        conv_id = conversation_owned["id"]

        ds = make_dataset(
            conversation_id=conv_id,
            name="sales",
            status="ready",
        )
        await insert_dataset(fresh_db, ds)

        long_description = "x" * 501
        response = await authed_client.patch(
            f"/conversations/{conv_id}/datasets/{ds['id']}/column-descriptions",
            json={"descriptions": {"col_a": long_description}},
        )

        assert_error_response(response, 400, "exceeds 500 chars")
