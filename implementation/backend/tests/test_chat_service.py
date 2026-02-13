"""Tests for app.services.chat_service -- message orchestration.

Tests: spec/backend/test.md#CHAT-SERVICE
Verifies: spec/backend/plan.md#chat-service-orchestration
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest
import pytest_asyncio

from app.database import init_db

from .factories import make_conversation, make_message, make_user


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


async def _insert_conversation(db: aiosqlite.Connection, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def _insert_message(db: aiosqlite.Connection, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, token_count, created_at, reasoning) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg["sql_query"],
            msg["token_count"],
            msg["created_at"],
            msg.get("reasoning"),
        ),
    )
    await db.commit()


async def _get_messages(db: aiosqlite.Connection, conversation_id: str) -> list[dict]:
    cursor = await db.execute(
        "SELECT id, conversation_id, role, content, sql_query, token_count, created_at, reasoning "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


def _make_rate_limit_status(
    allowed: bool = True,
    warning: bool = False,
    usage_percent: float = 10.0,
    remaining_tokens: int = 4_500_000,
    resets_in_seconds: int | None = None,
) -> MagicMock:
    """Create a mock RateLimitStatus object."""
    status = MagicMock()
    status.allowed = allowed
    status.warning = warning
    status.usage_tokens = int(5_000_000 * usage_percent / 100)
    status.limit_tokens = 5_000_000
    status.usage_percent = usage_percent
    status.remaining_tokens = remaining_tokens
    status.resets_in_seconds = resets_in_seconds
    return status


def _make_stream_result(
    assistant_message: str = "Hello! I can help with that.",
    input_tokens: int = 100,
    output_tokens: int = 50,
    tool_calls_made: int = 0,
    reasoning: str | None = None,
    sql_executions: list | None = None,
    tool_call_trace: list | None = None,
) -> MagicMock:
    """Create a mock StreamResult."""
    result = MagicMock()
    result.assistant_message = assistant_message
    result.input_tokens = input_tokens
    result.output_tokens = output_tokens
    result.tool_calls_made = tool_calls_made
    result.reasoning = reasoning
    result.sql_executions = sql_executions if sql_executions is not None else []
    result.tool_call_trace = tool_call_trace
    return result


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database initialised via ``init_db``."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await init_db(conn)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def user_and_conv(fresh_db):
    """Create a user and conversation in fresh_db, return (user, conv)."""
    user = make_user()
    await _insert_user(fresh_db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(fresh_db, conv)
    return user, conv


@pytest.fixture
def ws_send():
    """Async callable mock for WebSocket message dispatch."""
    return AsyncMock()


@pytest.fixture
def mock_pool():
    """Mock worker pool."""
    return AsyncMock()


def _clear_active_conversations():
    """Clear the module-level active conversations dict between tests."""
    from app.services import chat_service

    chat_service._active_conversations.clear()


# ---------------------------------------------------------------------------
# CHAT-1: Happy path -- full message flow
# ---------------------------------------------------------------------------


class TestProcessMessageHappyPath:
    """Full message send flow: user msg saved, LLM called, assistant msg
    saved, usage recorded, chat_complete sent via WS."""

    @pytest.mark.asyncio
    async def test_full_flow(self, fresh_db, user_and_conv, ws_send, mock_pool):
        user, conv = user_and_conv
        stream_result = _make_stream_result()
        rate_status_ok = _make_rate_limit_status(allowed=True, warning=False)
        rate_status_after = _make_rate_limit_status(allowed=True, warning=False)

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(side_effect=[rate_status_ok, rate_status_after])
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(return_value=stream_result)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            result = await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="Show me the data",
                ws_send=ws_send,
                pool=mock_pool,
            )

        # User message persisted
        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == "Show me the data"

        # Assistant message persisted
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert len(asst_msgs) == 1
        assert asst_msgs[0]["content"] == stream_result.assistant_message

        # LLM was called
        mock_llm.stream_chat.assert_awaited_once()

        # Usage recorded
        mock_rl.record_usage.assert_awaited_once()

        # WS events: query_status("generating") + chat_complete
        # ws_send is now called with a single dict arg containing a "type" field
        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "qs" in event_types   # query_status compressed
        assert "cc" in event_types   # chat_complete compressed

        # Result is the assistant message dict
        assert result["role"] == "assistant"
        assert result["content"] == stream_result.assistant_message

    @pytest.mark.asyncio
    async def test_conversation_inactive_after_completion(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """After process_message completes, conversation should not be in active set."""
        user, conv = user_and_conv
        stream_result = _make_stream_result()
        rate_status = _make_rate_limit_status()

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(return_value=stream_result)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services import chat_service
            from app.services.chat_service import process_message

            _clear_active_conversations()
            await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="Test",
                ws_send=ws_send,
                pool=mock_pool,
            )

            assert conv["id"] not in chat_service._active_conversations


# ---------------------------------------------------------------------------
# CHAT-2: Concurrency guard
# ---------------------------------------------------------------------------


class TestConcurrencyGuard:
    """Second call for the same conversation should raise ConflictError."""

    @pytest.mark.asyncio
    async def test_concurrent_generation_raises_conflict(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        user, conv = user_and_conv
        # Make LLM call hang so we can attempt a second call
        llm_hang = asyncio.Event()

        async def slow_stream(*args, **kwargs):
            await llm_hang.wait()
            return _make_stream_result()

        rate_status = _make_rate_limit_status()

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(side_effect=slow_stream)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.exceptions import ConflictError
            from app.services.chat_service import process_message

            _clear_active_conversations()

            # Start first call (will hang at LLM)
            task1 = asyncio.create_task(
                process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="First",
                    ws_send=ws_send,
                    pool=mock_pool,
                )
            )
            # Give task1 time to enter the active set
            await asyncio.sleep(0.02)

            # Second call should raise ConflictError
            with pytest.raises(ConflictError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Second",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

            # Unblock and cleanup first task
            llm_hang.set()
            await task1


# ---------------------------------------------------------------------------
# CHAT-3: Stop/cancel generation
# ---------------------------------------------------------------------------


class TestStopGeneration:
    """stop_generation sets cancel event, causing LLM streaming to stop."""

    @pytest.mark.asyncio
    async def test_stop_sets_cancel_event(self, fresh_db, user_and_conv, ws_send, mock_pool):
        user, conv = user_and_conv
        cancel_was_set = False

        async def capture_cancel(*args, cancel_event=None, **kwargs):
            nonlocal cancel_was_set
            # Wait briefly for stop_generation to be called
            await asyncio.sleep(0.02)
            if cancel_event is not None:
                cancel_was_set = cancel_event.is_set()
            return _make_stream_result(assistant_message="partial")

        rate_status = _make_rate_limit_status()

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(side_effect=capture_cancel)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message, stop_generation

            _clear_active_conversations()

            # Start processing
            task = asyncio.create_task(
                process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Tell me about data",
                    ws_send=ws_send,
                    pool=mock_pool,
                )
            )

            # Give it time to start and register the cancel event
            await asyncio.sleep(0.02)

            # Stop generation
            stop_generation(conv["id"])

            result = await task
            assert cancel_was_set is True

    @pytest.mark.asyncio
    async def test_stop_nonexistent_conversation_is_noop(self):
        """Calling stop_generation for a non-active conversation should not raise."""
        from app.services.chat_service import stop_generation

        # Should not raise
        stop_generation("nonexistent-conv-id")


# ---------------------------------------------------------------------------
# CHAT-4: Rate limit warning
# ---------------------------------------------------------------------------


class TestRateLimitWarning:
    """When near the rate limit, a warning is sent via WS."""

    @pytest.mark.asyncio
    async def test_warning_sent_when_near_limit_after_usage(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        user, conv = user_and_conv
        stream_result = _make_stream_result()
        rate_status_ok = _make_rate_limit_status(allowed=True, warning=False)
        # After usage, now near limit
        rate_status_after = _make_rate_limit_status(
            allowed=True,
            warning=True,
            usage_percent=85.0,
            remaining_tokens=750_000,
        )

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(side_effect=[rate_status_ok, rate_status_after])
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(return_value=stream_result)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="Analyze this",
                ws_send=ws_send,
                pool=mock_pool,
            )

        # Check that rate_limit_warning was sent (compressed type: rlw)
        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "rlw" in event_types

    @pytest.mark.asyncio
    async def test_pre_check_warning_sent(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """If the pre-check returns warning=True, a warning should be sent before LLM call."""
        user, conv = user_and_conv
        stream_result = _make_stream_result()
        rate_status_warning = _make_rate_limit_status(
            allowed=True,
            warning=True,
            usage_percent=82.0,
            remaining_tokens=900_000,
        )
        rate_status_after = _make_rate_limit_status(
            allowed=True,
            warning=True,
            usage_percent=85.0,
            remaining_tokens=750_000,
        )

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(side_effect=[rate_status_warning, rate_status_after])
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(return_value=stream_result)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="Analyze this",
                ws_send=ws_send,
                pool=mock_pool,
            )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "rlw" in event_types  # rate_limit_warning compressed


# ---------------------------------------------------------------------------
# CHAT-5: Rate limit exceeded
# ---------------------------------------------------------------------------


class TestRateLimitExceeded:
    """When the user is over the rate limit, RateLimitError is raised."""

    @pytest.mark.asyncio
    async def test_exceeded_raises_rate_limit_error(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        user, conv = user_and_conv
        rate_status_exceeded = _make_rate_limit_status(
            allowed=False,
            warning=True,
            usage_percent=105.0,
            remaining_tokens=0,
            resets_in_seconds=3600,
        )

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status_exceeded)
            mock_llm.stream_chat = AsyncMock()
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.exceptions import RateLimitError
            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(RateLimitError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Query data",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

            # LLM should NOT have been called
            mock_llm.stream_chat.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_exceeded_sends_ws_event(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """rate_limit_exceeded WS event should be sent before raising."""
        user, conv = user_and_conv
        rate_status_exceeded = _make_rate_limit_status(
            allowed=False,
            warning=True,
            usage_percent=105.0,
            remaining_tokens=0,
            resets_in_seconds=3600,
        )

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status_exceeded)
            mock_llm.stream_chat = AsyncMock()
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.exceptions import RateLimitError
            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(RateLimitError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Query data",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "rle" in event_types  # rate_limit_exceeded compressed

    @pytest.mark.asyncio
    async def test_exceeded_clears_active_set(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Conversation should be removed from active set even on rate limit error."""
        user, conv = user_and_conv
        rate_status_exceeded = _make_rate_limit_status(
            allowed=False, resets_in_seconds=3600,
        )

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status_exceeded)
            mock_llm.stream_chat = AsyncMock()
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.exceptions import RateLimitError
            from app.services import chat_service
            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(RateLimitError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Query data",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

            assert conv["id"] not in chat_service._active_conversations


# ---------------------------------------------------------------------------
# CHAT-6: Error handling -- LLM error sends chat_error via WS
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """LLM errors are caught and sent as chat_error via WS."""

    @pytest.mark.asyncio
    async def test_llm_error_sends_chat_error(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        user, conv = user_and_conv
        rate_status = _make_rate_limit_status()

        from app.services.llm_service import GeminiRateLimitError

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(side_effect=RuntimeError("Gemini API failure"))
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_llm.GeminiRateLimitError = GeminiRateLimitError
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(RuntimeError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Query data",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "ce" in event_types  # chat_error compressed

    @pytest.mark.asyncio
    async def test_llm_error_clears_active_set(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Conversation should be removed from active set on error."""
        user, conv = user_and_conv
        rate_status = _make_rate_limit_status()

        from app.services.llm_service import GeminiRateLimitError

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(side_effect=RuntimeError("fail"))
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_llm.GeminiRateLimitError = GeminiRateLimitError
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services import chat_service
            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(RuntimeError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Query data",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

            assert conv["id"] not in chat_service._active_conversations


# ---------------------------------------------------------------------------
# CHAT-7: Context building -- messages fetched and pruned correctly
# ---------------------------------------------------------------------------


class TestContextBuilding:
    """Messages are fetched from DB and passed through prune_context."""

    @pytest.mark.asyncio
    async def test_existing_messages_included_in_context(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        user, conv = user_and_conv

        # Pre-insert some history
        for i in range(3):
            msg = make_message(
                conversation_id=conv["id"],
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
            await _insert_message(fresh_db, msg)

        stream_result = _make_stream_result()
        rate_status = _make_rate_limit_status()
        captured_messages = []

        async def capture_stream_chat(messages, datasets, ws_send_arg, **kwargs):
            captured_messages.extend(messages)
            return stream_result

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(side_effect=capture_stream_chat)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="New message",
                ws_send=ws_send,
                pool=mock_pool,
            )

        # Context should include the 3 old messages + the new user message
        assert len(captured_messages) >= 4
        # The new user message should be the last one
        assert captured_messages[-1]["content"] == "New message"
        assert captured_messages[-1]["role"] == "user"

    @pytest.mark.asyncio
    async def test_prune_context_is_called(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """prune_context should be applied to the message context."""
        user, conv = user_and_conv
        stream_result = _make_stream_result()
        rate_status = _make_rate_limit_status()

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(return_value=stream_result)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="Test",
                ws_send=ws_send,
                pool=mock_pool,
            )

            mock_llm.prune_context.assert_called_once()

    @pytest.mark.asyncio
    async def test_datasets_fetched_for_conversation(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Datasets should be fetched and passed to stream_chat."""
        user, conv = user_and_conv
        stream_result = _make_stream_result()
        rate_status = _make_rate_limit_status()
        fake_datasets = [{"name": "table1", "schema_json": "[]", "row_count": 10}]

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(return_value=stream_result)
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_ds.get_datasets = AsyncMock(return_value=fake_datasets)

            from app.services.chat_service import process_message

            _clear_active_conversations()
            await process_message(
                db=fresh_db,
                conversation_id=conv["id"],
                user_id=user["id"],
                content="Show me data",
                ws_send=ws_send,
                pool=mock_pool,
            )

            mock_ds.get_datasets.assert_awaited_once_with(fresh_db, conv["id"])
            # stream_chat should receive the datasets
            call_args = mock_llm.stream_chat.call_args
            # Check positional or keyword arg
            if len(call_args.args) >= 2:
                assert call_args.args[1] == fake_datasets
            else:
                assert call_args.kwargs.get("datasets") == fake_datasets
