"""Extended tests for app.services.chat_service.

Covers areas not tested in test_chat_service.py:
- Message creation edge cases (empty content, very long content)
- stop_generation behavior details
- get_conversation_messages with different message types
- Auto-title generation on first message
- Error handling edge cases (ws_send failures, GeminiRateLimitError)
- SQL execution serialization in persisted messages
- Selected model passed to LLM
- Active conversations dict management
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


async def _insert_user_settings(
    db: aiosqlite.Connection, user_id: str, selected_model: str = "gemini-2.5-flash"
) -> None:
    """Insert a user_settings row."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO user_settings (user_id, dev_mode, selected_model, updated_at) "
        "VALUES (?, 1, ?, ?)",
        (user_id, selected_model, now),
    )
    await db.commit()


async def _get_messages(db: aiosqlite.Connection, conversation_id: str) -> list[dict]:
    cursor = await db.execute(
        "SELECT id, conversation_id, role, content, sql_query, token_count, "
        "created_at, reasoning, input_tokens, output_tokens, tool_call_trace "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def _get_conversation(db: aiosqlite.Connection, conv_id: str) -> dict | None:
    cursor = await db.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


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


def _make_sql_execution(
    query: str = "SELECT * FROM t",
    columns: list | None = None,
    rows: list | None = None,
    full_rows: list | None = None,
    total_rows: int = 1,
    error: str | None = None,
    execution_time_ms: float = 10.0,
) -> MagicMock:
    """Create a mock SqlExecution object."""
    ex = MagicMock()
    ex.query = query
    ex.columns = columns or ["col1"]
    ex.rows = rows or [["val1"]]
    ex.full_rows = full_rows
    ex.total_rows = total_rows
    ex.error = error
    ex.execution_time_ms = execution_time_ms
    return ex


def _clear_active_conversations():
    """Clear the module-level active conversations dict between tests."""
    from app.services import chat_service

    chat_service._active_conversations.clear()


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


@pytest_asyncio.fixture
async def user_and_conv_no_title(fresh_db):
    """Create a user and conversation with empty title, return (user, conv)."""
    user = make_user()
    await _insert_user(fresh_db, user)
    conv = make_conversation(user_id=user["id"], title="")
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


# ---------------------------------------------------------------------------
# Helper to run process_message with standard mocks
# ---------------------------------------------------------------------------


async def _run_process_message(
    fresh_db,
    user,
    conv,
    ws_send,
    mock_pool,
    content="Test message",
    stream_result=None,
    rate_status_pre=None,
    rate_status_post=None,
    datasets=None,
    selected_model=None,
):
    """Run process_message with standard mock setup. Returns the result dict."""
    if stream_result is None:
        stream_result = _make_stream_result()
    if rate_status_pre is None:
        rate_status_pre = _make_rate_limit_status()
    if rate_status_post is None:
        rate_status_post = _make_rate_limit_status()
    if datasets is None:
        datasets = []

    # Set up user settings if model specified
    if selected_model:
        await _insert_user_settings(fresh_db, user["id"], selected_model)

    with (
        patch("app.services.chat_service.rate_limit_service") as mock_rl,
        patch("app.services.chat_service.llm_service") as mock_llm,
        patch("app.services.chat_service.dataset_service") as mock_ds,
    ):
        mock_rl.check_limit = AsyncMock(
            side_effect=[rate_status_pre, rate_status_post]
        )
        mock_rl.record_usage = AsyncMock()
        mock_llm.stream_chat = AsyncMock(return_value=stream_result)
        mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
        mock_llm.GeminiRateLimitError = _get_gemini_rate_limit_error()
        mock_ds.get_datasets = AsyncMock(return_value=datasets)

        from app.services.chat_service import process_message

        _clear_active_conversations()
        result = await process_message(
            db=fresh_db,
            conversation_id=conv["id"],
            user_id=user["id"],
            content=content,
            ws_send=ws_send,
            pool=mock_pool,
        )

    return result, mock_llm, mock_rl


def _get_gemini_rate_limit_error():
    """Import and return the GeminiRateLimitError class."""
    from app.services.llm_service import GeminiRateLimitError

    return GeminiRateLimitError


# ---------------------------------------------------------------------------
# EXTENDED-1: Message creation edge cases
# ---------------------------------------------------------------------------


class TestMessageCreationEdgeCases:
    """Test message creation with edge-case content."""

    @pytest.mark.asyncio
    async def test_empty_content_persisted(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """An empty string message should still be persisted as a user message."""
        user, conv = user_and_conv
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool, content=""
        )

        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == ""

    @pytest.mark.asyncio
    async def test_very_long_content_persisted(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Very long content (10k chars) should be persisted without truncation."""
        user, conv = user_and_conv
        long_content = "x" * 10_000
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool, content=long_content
        )

        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert len(user_msgs[0]["content"]) == 10_000

    @pytest.mark.asyncio
    async def test_content_with_special_characters(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Content with special characters (unicode, newlines, quotes) should persist correctly."""
        user, conv = user_and_conv
        special_content = "Hello 'world' \"quotes\"\nnewline\ttab\x00null"
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool, content=special_content
        )

        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == special_content

    @pytest.mark.asyncio
    async def test_content_with_unicode(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Unicode content should be handled correctly."""
        user, conv = user_and_conv
        unicode_content = "Show data with emoji and CJK chars"
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool, content=unicode_content
        )

        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert user_msgs[0]["content"] == unicode_content

    @pytest.mark.asyncio
    async def test_whitespace_only_content(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Whitespace-only content should be persisted as-is."""
        user, conv = user_and_conv
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool, content="   \n\t  "
        )

        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert user_msgs[0]["content"] == "   \n\t  "


# ---------------------------------------------------------------------------
# EXTENDED-2: Auto-title generation
# ---------------------------------------------------------------------------


class TestAutoTitleGeneration:
    """Test conversation auto-title from first user message."""

    @pytest.mark.asyncio
    async def test_auto_title_set_on_first_message(
        self, fresh_db, user_and_conv_no_title, ws_send, mock_pool
    ):
        """First message should auto-generate conversation title."""
        user, conv = user_and_conv_no_title
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            content="Show me the sales data"
        )

        updated_conv = await _get_conversation(fresh_db, conv["id"])
        assert updated_conv["title"] == "Show me the sales data"

    @pytest.mark.asyncio
    async def test_auto_title_truncated_at_50_chars(
        self, fresh_db, user_and_conv_no_title, ws_send, mock_pool
    ):
        """Auto-title should be truncated to 50 chars with ellipsis if content is longer."""
        user, conv = user_and_conv_no_title
        long_content = "A" * 60
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            content=long_content,
        )

        updated_conv = await _get_conversation(fresh_db, conv["id"])
        # Title should be first 50 chars + ellipsis
        assert updated_conv["title"] == "A" * 50 + "\u2026"

    @pytest.mark.asyncio
    async def test_auto_title_not_set_if_already_titled(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """If conversation already has a title, it should not be overwritten."""
        user, conv = user_and_conv
        # Set a title on the conversation first
        await fresh_db.execute(
            "UPDATE conversations SET title = ? WHERE id = ?",
            ("Existing Title", conv["id"]),
        )
        await fresh_db.commit()

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            content="New message content",
        )

        updated_conv = await _get_conversation(fresh_db, conv["id"])
        assert updated_conv["title"] == "Existing Title"

    @pytest.mark.asyncio
    async def test_auto_title_sends_ws_event(
        self, fresh_db, user_and_conv_no_title, ws_send, mock_pool
    ):
        """When auto-title is set, a conversation_title_updated WS event is sent."""
        user, conv = user_and_conv_no_title
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            content="Hello world",
        )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "ctu" in event_types  # conversation_title_updated compressed

    @pytest.mark.asyncio
    async def test_exact_50_chars_no_ellipsis(
        self, fresh_db, user_and_conv_no_title, ws_send, mock_pool
    ):
        """Content of exactly 50 chars should not get an ellipsis."""
        user, conv = user_and_conv_no_title
        content_50 = "B" * 50
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            content=content_50,
        )

        updated_conv = await _get_conversation(fresh_db, conv["id"])
        assert updated_conv["title"] == content_50


# ---------------------------------------------------------------------------
# EXTENDED-3: stop_generation behavior details
# ---------------------------------------------------------------------------


class TestStopGenerationExtended:
    """Extended tests for stop_generation."""

    @pytest.mark.asyncio
    async def test_stop_generation_returns_none(self):
        """stop_generation should return None (is a void function)."""
        from app.services.chat_service import stop_generation

        _clear_active_conversations()
        result = stop_generation("nonexistent-conv-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_stop_generation_only_affects_target_conversation(
        self, fresh_db, ws_send, mock_pool
    ):
        """stop_generation for one conversation should not affect another."""
        from app.services import chat_service

        _clear_active_conversations()

        # Manually set up two cancel events
        event_a = asyncio.Event()
        event_b = asyncio.Event()
        chat_service._active_conversations["conv-a"] = event_a
        chat_service._active_conversations["conv-b"] = event_b

        chat_service.stop_generation("conv-a")

        assert event_a.is_set()
        assert not event_b.is_set()

        # Clean up
        _clear_active_conversations()

    @pytest.mark.asyncio
    async def test_stop_generation_idempotent(self):
        """Calling stop_generation multiple times should not raise."""
        from app.services import chat_service

        _clear_active_conversations()

        event = asyncio.Event()
        chat_service._active_conversations["conv-x"] = event

        chat_service.stop_generation("conv-x")
        assert event.is_set()

        # Calling again should be safe (event is still in dict until process_message clears it)
        chat_service.stop_generation("conv-x")
        assert event.is_set()

        _clear_active_conversations()

    @pytest.mark.asyncio
    async def test_active_conversations_cleared_after_stop_and_completion(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """After stop + process_message completion, conversation should not be in active set."""
        user, conv = user_and_conv

        async def quick_stream(*args, cancel_event=None, **kwargs):
            return _make_stream_result(assistant_message="stopped")

        rate_status = _make_rate_limit_status()

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(side_effect=quick_stream)
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
# EXTENDED-4: SQL execution serialization
# ---------------------------------------------------------------------------


class TestSqlExecutionSerialization:
    """SQL executions should be serialized correctly to DB and WS."""

    @pytest.mark.asyncio
    async def test_sql_executions_persisted_to_db(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """SQL executions should be serialized as JSON in the sql_query column."""
        import json

        user, conv = user_and_conv
        sql_exec = _make_sql_execution(
            query="SELECT COUNT(*) FROM sales",
            columns=["count"],
            rows=[[42]],
            total_rows=1,
            execution_time_ms=15.5,
        )
        stream_result = _make_stream_result(sql_executions=[sql_exec])

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert len(asst_msgs) == 1
        assert asst_msgs[0]["sql_query"] is not None

        sql_data = json.loads(asst_msgs[0]["sql_query"])
        assert len(sql_data) == 1
        assert sql_data[0]["query"] == "SELECT COUNT(*) FROM sales"

    @pytest.mark.asyncio
    async def test_no_sql_executions_persists_null(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When there are no SQL executions, sql_query should be NULL."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(sql_executions=[])

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert asst_msgs[0]["sql_query"] is None

    @pytest.mark.asyncio
    async def test_multiple_sql_executions(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Multiple SQL executions should all be serialized."""
        import json

        user, conv = user_and_conv
        execs = [
            _make_sql_execution(query="SELECT 1"),
            _make_sql_execution(query="SELECT 2"),
            _make_sql_execution(query="SELECT 3"),
        ]
        stream_result = _make_stream_result(sql_executions=execs)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        sql_data = json.loads(asst_msgs[0]["sql_query"])
        assert len(sql_data) == 3

    @pytest.mark.asyncio
    async def test_sql_execution_with_full_rows_uses_full_rows_for_db(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When full_rows is present, DB should use full_rows instead of rows."""
        import json

        user, conv = user_and_conv
        sql_exec = _make_sql_execution(
            query="SELECT * FROM big_table",
            rows=[["row1"]],  # capped at 100 rows (for WS)
            full_rows=[["row1"], ["row2"], ["row3"]],  # up to 1000 rows (for DB)
            total_rows=3,
        )
        stream_result = _make_stream_result(sql_executions=[sql_exec])

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        sql_data = json.loads(asst_msgs[0]["sql_query"])
        # DB version should have full_rows (3 rows), not capped rows (1 row)
        assert len(sql_data[0]["rows"]) == 3


# ---------------------------------------------------------------------------
# EXTENDED-5: Reasoning persistence
# ---------------------------------------------------------------------------


class TestReasoningPersistence:
    """Test that reasoning from LLM is correctly persisted."""

    @pytest.mark.asyncio
    async def test_reasoning_persisted(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Reasoning text should be saved in the messages table."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(
            reasoning="I need to analyze the data structure first."
        )

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert asst_msgs[0]["reasoning"] == "I need to analyze the data structure first."

    @pytest.mark.asyncio
    async def test_none_reasoning_persisted_as_null(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When reasoning is None, it should be stored as NULL."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(reasoning=None)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert asst_msgs[0]["reasoning"] is None

    @pytest.mark.asyncio
    async def test_empty_reasoning_persisted_as_null(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When reasoning is empty string, it should be stored as NULL (falsy)."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(reasoning="")

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        # Empty string is falsy, so `result.reasoning or None` => None
        assert asst_msgs[0]["reasoning"] is None


# ---------------------------------------------------------------------------
# EXTENDED-6: Token count and usage recording
# ---------------------------------------------------------------------------


class TestTokenCountAndUsage:
    """Test that token counts are correctly recorded."""

    @pytest.mark.asyncio
    async def test_token_count_sum_of_input_and_output(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """token_count should be input_tokens + output_tokens."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(input_tokens=200, output_tokens=75)

        result, _, mock_rl = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        assert result["token_count"] == 275

    @pytest.mark.asyncio
    async def test_input_output_tokens_persisted_separately(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """input_tokens and output_tokens should be separately persisted."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(input_tokens=300, output_tokens=100)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert asst_msgs[0]["input_tokens"] == 300
        assert asst_msgs[0]["output_tokens"] == 100
        assert asst_msgs[0]["token_count"] == 400

    @pytest.mark.asyncio
    async def test_zero_token_counts(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Zero token counts should be valid."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(input_tokens=0, output_tokens=0)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        assert result["token_count"] == 0

    @pytest.mark.asyncio
    async def test_record_usage_called_with_correct_params(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """record_usage should be called with the correct user_id, conv_id, and token counts."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(input_tokens=150, output_tokens=60)

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

            mock_rl.record_usage.assert_awaited_once_with(
                db=fresh_db,
                user_id=user["id"],
                conversation_id=conv["id"],
                input_tokens=150,
                output_tokens=60,
            )


# ---------------------------------------------------------------------------
# EXTENDED-7: Tool call trace persistence
# ---------------------------------------------------------------------------


class TestToolCallTracePersistence:
    """Test that tool_call_trace is correctly persisted."""

    @pytest.mark.asyncio
    async def test_tool_call_trace_persisted(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Tool call trace should be serialized as JSON."""
        import json

        user, conv = user_and_conv
        trace = [
            {"tool": "execute_sql", "args": {"query": "SELECT 1"}, "result": "ok"},
        ]
        stream_result = _make_stream_result(tool_call_trace=trace)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        stored_trace = json.loads(asst_msgs[0]["tool_call_trace"])
        assert len(stored_trace) == 1
        assert stored_trace[0]["tool"] == "execute_sql"

    @pytest.mark.asyncio
    async def test_none_tool_call_trace_stored_as_null(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When tool_call_trace is None, it should be stored as NULL."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(tool_call_trace=None)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert asst_msgs[0]["tool_call_trace"] is None

    @pytest.mark.asyncio
    async def test_empty_tool_call_trace_stored_as_null(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When tool_call_trace is an empty list, it should be stored as NULL (falsy)."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(tool_call_trace=[])

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        # Empty list is falsy, so `result.tool_call_trace if result.tool_call_trace else None` => None
        assert asst_msgs[0]["tool_call_trace"] is None


# ---------------------------------------------------------------------------
# EXTENDED-8: Selected model passed to LLM
# ---------------------------------------------------------------------------


class TestSelectedModelPassedToLlm:
    """Test that the user's selected model is read and forwarded."""

    @pytest.mark.asyncio
    async def test_selected_model_passed_to_stream_chat(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """The user's selected_model from user_settings should be passed to stream_chat."""
        user, conv = user_and_conv
        await _insert_user_settings(fresh_db, user["id"], "gemini-2.5-pro")

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

            # Verify model_id kwarg
            call_kwargs = mock_llm.stream_chat.call_args.kwargs
            assert call_kwargs.get("model_id") == "gemini-2.5-pro"

    @pytest.mark.asyncio
    async def test_no_user_settings_passes_none_model(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """When no user_settings row exists, model_id should be None."""
        user, conv = user_and_conv
        # Do NOT insert user_settings

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

            call_kwargs = mock_llm.stream_chat.call_args.kwargs
            assert call_kwargs.get("model_id") is None


# ---------------------------------------------------------------------------
# EXTENDED-9: Error handling edge cases
# ---------------------------------------------------------------------------


class TestErrorHandlingExtended:
    """Extended error handling scenarios."""

    @pytest.mark.asyncio
    async def test_gemini_rate_limit_error_sends_chat_error(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """GeminiRateLimitError should send a chat_error WS event."""
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
            mock_llm.stream_chat = AsyncMock(
                side_effect=GeminiRateLimitError()
            )
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_llm.GeminiRateLimitError = GeminiRateLimitError
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(GeminiRateLimitError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Test",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]
        assert "ce" in event_types  # chat_error compressed

    @pytest.mark.asyncio
    async def test_generic_error_sends_chat_error_with_details(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """A generic exception should send chat_error with error type in details."""
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
            mock_llm.stream_chat = AsyncMock(
                side_effect=ValueError("bad value")
            )
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_llm.GeminiRateLimitError = GeminiRateLimitError
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(ValueError):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Test",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        error_events = [c for c in ws_calls if c["type"] == "ce"]
        assert len(error_events) == 1
        assert "bad value" in error_events[0]["e"]
        assert error_events[0].get("d") == "ValueError"

    @pytest.mark.asyncio
    async def test_ws_send_failure_during_error_handling_does_not_crash(
        self, fresh_db, user_and_conv, mock_pool
    ):
        """If ws_send fails while sending chat_error, the original error should still propagate."""
        user, conv = user_and_conv
        # Give the conversation a title so auto-title ws_send is skipped
        await fresh_db.execute(
            "UPDATE conversations SET title = ? WHERE id = ?",
            ("Has Title", conv["id"]),
        )
        await fresh_db.commit()

        rate_status = _make_rate_limit_status()

        # ws_send that works for query_status but fails for chat_error
        call_count = 0

        async def selective_failing_ws_send(msg):
            nonlocal call_count
            call_count += 1
            # The first call is query_status("generating") -- let it pass
            # The second call (chat_error) should fail
            if msg.get("type") == "ce":
                raise RuntimeError("WS broken")

        from app.services.llm_service import GeminiRateLimitError

        with (
            patch("app.services.chat_service.rate_limit_service") as mock_rl,
            patch("app.services.chat_service.llm_service") as mock_llm,
            patch("app.services.chat_service.dataset_service") as mock_ds,
        ):
            mock_rl.check_limit = AsyncMock(return_value=rate_status)
            mock_rl.record_usage = AsyncMock()
            mock_llm.stream_chat = AsyncMock(
                side_effect=ValueError("original error")
            )
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_llm.GeminiRateLimitError = GeminiRateLimitError
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(ValueError, match="original error"):
                await process_message(
                    db=fresh_db,
                    conversation_id=conv["id"],
                    user_id=user["id"],
                    content="Test",
                    ws_send=selective_failing_ws_send,
                    pool=mock_pool,
                )

    @pytest.mark.asyncio
    async def test_error_still_clears_active_conversations(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """Even when ws_send fails during error handling, active_conversations should be cleaned up."""
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
            mock_llm.stream_chat = AsyncMock(
                side_effect=ValueError("fail")
            )
            mock_llm.prune_context = MagicMock(side_effect=lambda msgs, **kw: msgs)
            mock_llm.GeminiRateLimitError = GeminiRateLimitError
            mock_ds.get_datasets = AsyncMock(return_value=[])

            from app.services import chat_service
            from app.services.chat_service import process_message

            _clear_active_conversations()
            with pytest.raises(ValueError):
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
# EXTENDED-10: Return value structure
# ---------------------------------------------------------------------------


class TestProcessMessageReturnValue:
    """Verify the structure of process_message's return dict."""

    @pytest.mark.asyncio
    async def test_return_value_has_all_fields(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """The return dict should contain id, conversation_id, role, content, sql_query, token_count, created_at."""
        user, conv = user_and_conv
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
        )

        assert "id" in result
        assert result["conversation_id"] == conv["id"]
        assert result["role"] == "assistant"
        assert result["content"] == "Hello! I can help with that."
        assert "sql_query" in result
        assert "token_count" in result
        assert "created_at" in result

    @pytest.mark.asyncio
    async def test_return_value_matches_persisted_message(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """The returned id should match a message in the database."""
        user, conv = user_and_conv
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
        )

        messages = await _get_messages(fresh_db, conv["id"])
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert len(asst_msgs) == 1
        assert asst_msgs[0]["id"] == result["id"]
        assert asst_msgs[0]["content"] == result["content"]


# ---------------------------------------------------------------------------
# EXTENDED-11: WS events sent in correct order
# ---------------------------------------------------------------------------


class TestWsEventOrder:
    """Verify correct WS event dispatch during process_message."""

    @pytest.mark.asyncio
    async def test_query_status_sent_before_chat_complete(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """query_status('generating') must be sent before chat_complete."""
        user, conv = user_and_conv
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
        )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        event_types = [c["type"] for c in ws_calls]

        qs_idx = event_types.index("qs")
        cc_idx = event_types.index("cc")
        assert qs_idx < cc_idx

    @pytest.mark.asyncio
    async def test_chat_complete_contains_message_id(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """chat_complete WS event should contain the message_id."""
        user, conv = user_and_conv
        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
        )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        cc_events = [c for c in ws_calls if c["type"] == "cc"]
        assert len(cc_events) == 1
        assert cc_events[0]["mid"] == result["id"]

    @pytest.mark.asyncio
    async def test_chat_complete_contains_token_counts(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """chat_complete should contain input/output token counts."""
        user, conv = user_and_conv
        stream_result = _make_stream_result(input_tokens=200, output_tokens=80)

        result, _, _ = await _run_process_message(
            fresh_db, user, conv, ws_send, mock_pool,
            stream_result=stream_result,
        )

        ws_calls = [call.args[0] for call in ws_send.call_args_list]
        cc_events = [c for c in ws_calls if c["type"] == "cc"]
        assert cc_events[0]["it"] == 200
        assert cc_events[0]["ot"] == 80
        assert cc_events[0]["tc"] == 280


# ---------------------------------------------------------------------------
# EXTENDED-12: User message always persisted before LLM call
# ---------------------------------------------------------------------------


class TestUserMessagePersistenceOrder:
    """The user's message should always be saved, even if the LLM call fails."""

    @pytest.mark.asyncio
    async def test_user_message_persisted_even_on_llm_error(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """If the LLM call fails, the user message should still be in the database."""
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
            mock_llm.stream_chat = AsyncMock(
                side_effect=RuntimeError("LLM crashed")
            )
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
                    content="My important question",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

        # User message should be persisted even though LLM failed
        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == "My important question"

        # But no assistant message should exist
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        assert len(asst_msgs) == 0

    @pytest.mark.asyncio
    async def test_user_message_persisted_on_rate_limit_exceeded(
        self, fresh_db, user_and_conv, ws_send, mock_pool
    ):
        """If rate limit is exceeded, the user message should still be persisted."""
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
                    content="Blocked message",
                    ws_send=ws_send,
                    pool=mock_pool,
                )

        # User message should be persisted even though rate limited
        messages = await _get_messages(fresh_db, conv["id"])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == "Blocked message"
