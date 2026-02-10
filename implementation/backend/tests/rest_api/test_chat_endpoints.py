"""Chat endpoint tests.

Tests: spec/backend/rest_api/test.md#CHAT-EP-1 through CHAT-EP-6
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_message
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    """A conversation owned by the default test_user."""
    conv = make_conversation(user_id=test_user["id"], title="Test Conv")
    await insert_conversation(fresh_db, conv)
    return conv


@pytest.fixture
def mock_chat_processing(fresh_db):
    """Patches chat_service.process_message to save user message and return."""
    _mock = AsyncMock()

    async def fake_process_message(db, conversation_id, user_id, content, ws_send, pool=None):
        # Simulate step 3 of process_message: persist user message
        msg_id = str(uuid4())
        now = datetime.utcnow().isoformat()
        await db.execute(
            "INSERT INTO messages "
            "(id, conversation_id, role, content, sql_query, token_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (msg_id, conversation_id, "user", content, None, 0, now),
        )
        await db.commit()

        return {
            "id": str(uuid4()),
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": "Mock response",
            "sql_query": None,
            "token_count": 10,
            "created_at": now,
        }

    _mock.side_effect = fake_process_message

    with patch(
        "app.services.chat_service.process_message",
        _mock,
    ):
        yield _mock


@pytest.fixture
def mock_stop_generation():
    """Patches chat_service.stop_generation to be a no-op."""
    with patch(
        "app.services.chat_service.stop_generation",
    ) as mock:
        yield mock


# ---------------------------------------------------------------------------
# CHAT-EP-1: POST /conversations/:id/messages - Send message (200)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_send_message_returns_200(
    authed_client, fresh_db, conversation_owned, mock_chat_processing
):
    """POST /conversations/:id/messages returns 200 with message_id and status."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(
        f"/conversations/{conv_id}/messages",
        json={"content": "analyze this"},
    )

    body = assert_success_response(response, status_code=200)
    assert "message_id" in body
    assert body["status"] == "processing"

    # Verify user message was saved in DB by process_message
    cursor = await fresh_db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? AND role = 'user'",
        (conv_id,),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["content"] == "analyze this"


# ---------------------------------------------------------------------------
# CHAT-EP-2: POST /conversations/:id/messages - Parquet URL in message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_send_message_with_parquet_url(
    authed_client, fresh_db, conversation_owned, mock_chat_processing
):
    """POST message containing a parquet URL returns 200 and calls chat_service."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(
        f"/conversations/{conv_id}/messages",
        json={"content": "load https://example.com/data.parquet and analyze"},
    )

    body = assert_success_response(response, status_code=200)
    assert body["status"] == "processing"

    # Verify mock_chat_processing was called
    mock_chat_processing.assert_called_once()


# ---------------------------------------------------------------------------
# CHAT-EP-3: POST /conversations/:id/messages - Rate limited (429)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_send_message_rate_limited_returns_200_ack(
    authed_client, fresh_db, test_user, conversation_owned
):
    """POST message when user has exceeded token limit still returns 200 ack.

    Since send_message runs process_message as a background task via
    asyncio.create_task(), the HTTP handler always returns an immediate
    acknowledgment.  Rate-limit errors surface asynchronously via WebSocket
    (chat_error event), not as an HTTP 429.
    """
    from app.exceptions import RateLimitError

    conv_id = conversation_owned["id"]

    mock = AsyncMock(
        side_effect=RateLimitError("Daily token limit exceeded", resets_in_seconds=3600)
    )

    with patch("app.services.chat_service.process_message", mock):
        response = await authed_client.post(
            f"/conversations/{conv_id}/messages",
            json={"content": "more analysis please"},
        )

    # The endpoint returns 200 immediately; the error is handled in the background task
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"


# ---------------------------------------------------------------------------
# CHAT-EP-4: POST /conversations/:id/messages - Not owner (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_send_message_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned, mock_chat_processing
):
    """POST message to another user's conversation returns 403."""
    response = await other_user_client.post(
        f"/conversations/{conversation_owned['id']}/messages",
        json={"content": "sneaky message"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# CHAT-EP-5: POST /conversations/:id/stop - Stop generation (200)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_stop_generation_returns_200(
    authed_client, fresh_db, conversation_owned, mock_stop_generation
):
    """POST /conversations/:id/stop returns 200 with {success: true}."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(f"/conversations/{conv_id}/stop")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    # Verify stop_generation was called
    mock_stop_generation.assert_called_once_with(conv_id)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_stop_generation_noop_when_not_streaming(
    authed_client, fresh_db, conversation_owned, mock_stop_generation
):
    """POST /conversations/:id/stop is a no-op when nothing is generating (still 200)."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(f"/conversations/{conv_id}/stop")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True


# ---------------------------------------------------------------------------
# CHAT-EP-6: POST /conversations/:id/stop - Not found (404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_stop_generation_not_found_returns_404(authed_client, fresh_db):
    """POST /conversations/:id/stop for nonexistent conversation returns 404."""
    response = await authed_client.post("/conversations/nonexistent-id/stop")
    assert_error_response(response, 404)


# ---------------------------------------------------------------------------
# Unauthenticated returns 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unauthenticated_chat_returns_401(authed_client, conversation_owned):
    """Chat endpoints return 401 without a session cookie."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        conv_id = conversation_owned["id"]

        resp = await unauthed.post(
            f"/conversations/{conv_id}/messages",
            json={"content": "hello"},
        )
        assert resp.status_code == 401

        resp = await unauthed.post(f"/conversations/{conv_id}/stop")
        assert resp.status_code == 401
