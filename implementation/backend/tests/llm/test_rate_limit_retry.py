"""Rate-limit retry tests: Gemini 429 RESOURCE_EXHAUSTED handling.

Tests that stream_chat:
1. Retries up to MAX_GEMINI_RETRIES times on 429 errors
2. Uses exponential backoff delays (2, 4, 8 seconds)
3. Raises GeminiRateLimitError with user-friendly message after all retries
4. Succeeds if a retry attempt works
5. Does NOT retry on non-429 ClientErrors
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm_service import (
    GeminiRateLimitError,
    MAX_GEMINI_RETRIES,
    GEMINI_RETRY_BASE_DELAY,
    stream_chat,
)

from .conftest import (
    MockStreamResponse,
    MockChunk,
    MockUsageMetadata,
    make_text_stream,
)


def _make_429_error():
    """Create a mock ClientError with code=429."""
    from google.genai.errors import ClientError

    return ClientError(code=429, response_json={"error": {"message": "RESOURCE_EXHAUSTED", "status": "RESOURCE_EXHAUSTED"}})


def _make_400_error():
    """Create a mock ClientError with code=400."""
    from google.genai.errors import ClientError

    return ClientError(code=400, response_json={"error": {"message": "INVALID_ARGUMENT", "status": "INVALID_ARGUMENT"}})


class TestGeminiRateLimitRetry:
    """Tests for 429 retry with exponential backoff."""

    @pytest.mark.asyncio
    async def test_retries_on_429_then_succeeds(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """If the first call fails with 429 but the second succeeds, stream_chat returns normally."""
        success_stream = make_text_stream(["OK"])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[_make_429_error(), success_stream]
        )

        with patch("app.services.llm_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            messages = [{"role": "user", "content": "Hi"}]
            result = await stream_chat(messages, sample_datasets, mock_ws_send)

        assert result.assistant_message == "OK"
        # Should have slept once with base delay (2 ** 0 * 2 = 2)
        mock_sleep.assert_called_once_with(GEMINI_RETRY_BASE_DELAY)

    @pytest.mark.asyncio
    async def test_exponential_backoff_delays(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """Retry delays follow exponential backoff: 2, 4, 8 seconds."""
        success_stream = make_text_stream(["OK"])

        # Fail 3 times (MAX_GEMINI_RETRIES), succeed on 4th attempt
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[
                _make_429_error(),
                _make_429_error(),
                _make_429_error(),
                success_stream,
            ]
        )

        with patch("app.services.llm_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            messages = [{"role": "user", "content": "Hi"}]
            result = await stream_chat(messages, sample_datasets, mock_ws_send)

        assert result.assistant_message == "OK"
        assert mock_sleep.call_count == 3
        delays = [call.args[0] for call in mock_sleep.call_args_list]
        assert delays == [2, 4, 8]

    @pytest.mark.asyncio
    async def test_raises_gemini_rate_limit_error_after_all_retries(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """After MAX_GEMINI_RETRIES+1 consecutive 429 errors, raises GeminiRateLimitError."""
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[_make_429_error()] * (MAX_GEMINI_RETRIES + 1)
        )

        with patch("app.services.llm_service.asyncio.sleep", new_callable=AsyncMock):
            messages = [{"role": "user", "content": "Hi"}]
            with pytest.raises(GeminiRateLimitError) as exc_info:
                await stream_chat(messages, sample_datasets, mock_ws_send)

        assert "temporarily busy" in str(exc_info.value)
        assert "try again" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_non_429_client_error_not_retried(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """A non-429 ClientError (e.g., 400) is raised immediately, no retry."""
        from google.genai.errors import ClientError

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=_make_400_error()
        )

        with patch("app.services.llm_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            messages = [{"role": "user", "content": "Hi"}]
            with pytest.raises(ClientError) as exc_info:
                await stream_chat(messages, sample_datasets, mock_ws_send)

        assert exc_info.value.code == 400
        mock_sleep.assert_not_called()

    @pytest.mark.asyncio
    async def test_429_retry_resets_per_outer_loop_iteration(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """Each iteration of the outer while-True loop gets fresh retries."""
        # First call succeeds with a tool call, then the follow-up call gets 429+retry+success
        from .conftest import make_tool_call_stream

        tool_stream = make_tool_call_stream(
            tool_name="suggest_followups",
            tool_args={"suggestions": ["Q1?"]},
        )
        success_stream = make_text_stream(["Done"])

        # 1st outer iter: tool call (succeeds)
        # 2nd outer iter: 429 then success
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, _make_429_error(), success_stream]
        )

        with patch("app.services.llm_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            messages = [{"role": "user", "content": "Hi"}]
            result = await stream_chat(messages, sample_datasets, mock_ws_send)

        assert result.assistant_message == "Done"
        # Only 1 sleep call (for the one retry in the 2nd outer iter)
        mock_sleep.assert_called_once()

    @pytest.mark.asyncio
    async def test_user_friendly_error_message_content(self):
        """GeminiRateLimitError has a clear, user-friendly message."""
        exc = GeminiRateLimitError()
        msg = str(exc)
        assert msg == "The AI service is temporarily busy. Please try again in a moment."
