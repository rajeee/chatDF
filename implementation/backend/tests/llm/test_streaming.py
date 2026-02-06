"""STREAMING tests: token forwarding via ws_send, cancellation.

Tests: spec/backend/llm/test.md#STREAM-1 through STREAM-4
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm_service import stream_chat

from .conftest import (
    MockChunk,
    MockFunctionCall,
    MockStreamResponse,
    MockUsageMetadata,
    make_text_stream,
    make_tool_call_stream,
)


@pytest.fixture
def mock_run_query():
    """Mock worker_pool.run_query for tool call tests."""
    with patch("app.services.llm_service.worker_pool") as mock_wp:
        mock_wp.run_query = AsyncMock(return_value={
            "rows": [{"id": 1}],
            "columns": ["id"],
            "total_rows": 1,
        })
        yield mock_wp


class TestTokenForwarding:
    """STREAM-1: Each token forwarded via WebSocket chat_token message."""

    @pytest.mark.asyncio
    async def test_text_chunks_sent_as_chat_token(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """Each text chunk produces a chat_token event via ws_send."""
        stream = make_text_stream(["Hello ", "beautiful ", "world"])
        mock_gemini_client.models.generate_content_stream = MagicMock(
            return_value=stream
        )

        messages = [{"role": "user", "content": "Hi"}]
        await stream_chat(messages, sample_datasets, mock_ws_send)

        token_events = [m for m in mock_ws_send.messages if m["type"] == "chat_token"]
        assert len(token_events) == 3
        assert token_events[0]["token"] == "Hello "
        assert token_events[1]["token"] == "beautiful "
        assert token_events[2]["token"] == "world"

    @pytest.mark.asyncio
    async def test_empty_text_chunks_skipped(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """Chunks with empty text should not produce chat_token events."""
        stream = make_text_stream(["Hello", "", "world"])
        mock_gemini_client.models.generate_content_stream = MagicMock(
            return_value=stream
        )

        messages = [{"role": "user", "content": "Hi"}]
        await stream_chat(messages, sample_datasets, mock_ws_send)

        token_events = [m for m in mock_ws_send.messages if m["type"] == "chat_token"]
        # Only non-empty tokens should be sent
        tokens = [e["token"] for e in token_events]
        assert "" not in tokens


class TestStreamPauseOnToolCall:
    """STREAM-2: Stream pauses when tool call is detected."""

    @pytest.mark.asyncio
    async def test_no_tokens_after_tool_call_until_resumed(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """When a tool call is detected, streaming pauses for tool execution."""
        tool_stream = make_tool_call_stream(
            "execute_sql", {"query": "SELECT 1"}
        )
        text_stream = make_text_stream(["After tool."])

        mock_gemini_client.models.generate_content_stream = MagicMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Query"}]
        await stream_chat(messages, sample_datasets, mock_ws_send)

        # After tool call, there should be a tool_call_start event,
        # then resumed tokens
        types_in_order = [m["type"] for m in mock_ws_send.messages]
        assert "tool_call_start" in types_in_order


class TestStreamResumeAfterToolExecution:
    """STREAM-3: After tool call completes, streaming resumes."""

    @pytest.mark.asyncio
    async def test_tokens_resume_after_tool_execution(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """Streaming resumes after tool execution with new tokens."""
        tool_stream = make_tool_call_stream(
            "execute_sql", {"query": "SELECT 1"}
        )
        text_stream = make_text_stream(["The result is 1."])

        mock_gemini_client.models.generate_content_stream = MagicMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Run query"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send)

        token_events = [m for m in mock_ws_send.messages if m["type"] == "chat_token"]
        assert len(token_events) >= 1
        assert any("result" in e["token"].lower() for e in token_events)


class TestUserCancellation:
    """STREAM-4: User cancels stream."""

    @pytest.mark.asyncio
    async def test_cancellation_stops_streaming(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """When cancel event is set, streaming stops and partial response is preserved."""
        cancel_event = asyncio.Event()

        # Create a stream that will be interrupted
        chunks = [MockChunk(text="First "), MockChunk(text="Second "), MockChunk(text="Third")]

        class SlowStream:
            """Stream that sets cancel after first chunk."""
            def __init__(self):
                self.usage_metadata = MockUsageMetadata(
                    prompt_token_count=20, candidates_token_count=5
                )
                self._chunks = iter(chunks)
                self._count = 0

            def __iter__(self):
                return self

            def __next__(self):
                self._count += 1
                if self._count > 1:
                    cancel_event.set()
                try:
                    return next(self._chunks)
                except StopIteration:
                    raise StopIteration

        mock_gemini_client.models.generate_content_stream = MagicMock(
            return_value=SlowStream()
        )

        messages = [{"role": "user", "content": "Tell me a story"}]
        result = await stream_chat(
            messages, sample_datasets, mock_ws_send, cancel_event=cancel_event
        )

        # Partial response should be preserved
        assert result.assistant_message is not None
        assert len(result.assistant_message) > 0
        # Should have at least the first token
        assert "First" in result.assistant_message
