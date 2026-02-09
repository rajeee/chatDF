"""TOKEN tests: token counting from usage_metadata.

Tests: spec/backend/llm/test.md#TOKEN-1 through TOKEN-3
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm_service import stream_chat

from .conftest import (
    MockUsageMetadata,
    make_text_stream,
    make_tool_call_stream,
)


class TestTokenCountingPerRequest:
    """TOKEN-1: Token counting from usage_metadata."""

    @pytest.mark.asyncio
    async def test_input_output_tokens_from_metadata(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """StreamResult contains correct input/output tokens from usage_metadata."""
        stream = make_text_stream(
            ["Hello world"],
            prompt_tokens=100,
            candidates_tokens=25,
        )
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            return_value=stream
        )

        messages = [{"role": "user", "content": "Hi"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send)

        assert result.input_tokens == 100
        assert result.output_tokens == 25

    @pytest.mark.asyncio
    async def test_tokens_summed_across_tool_calls(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_pool
    ):
        """When tool calls cause multiple Gemini API calls, tokens are summed."""
        tool_stream = make_tool_call_stream(
            "execute_sql",
            {"query": "SELECT 1"},
            prompt_tokens=50,
            candidates_tokens=10,
        )
        text_stream = make_text_stream(
            ["Done"],
            prompt_tokens=80,
            candidates_tokens=20,
        )

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Query"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_pool)

        # Tokens should be summed: 50+80=130 input, 10+20=30 output
        assert result.input_tokens == 130
        assert result.output_tokens == 30


class TestTokenCountInChatComplete:
    """TOKEN-3: chat_complete includes token_count."""

    @pytest.mark.asyncio
    async def test_stream_result_has_token_count(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """StreamResult includes total token count for chat_complete event."""
        stream = make_text_stream(
            ["Response text"],
            prompt_tokens=200,
            candidates_tokens=50,
        )
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            return_value=stream
        )

        messages = [{"role": "user", "content": "Hi"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send)

        # StreamResult should have input_tokens + output_tokens
        total = result.input_tokens + result.output_tokens
        assert total == 250
