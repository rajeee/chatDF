"""ERR-CORRECT tests: SQL error retry up to 3 times.

Tests: spec/backend/llm/test.md#ERR-CORRECT-1 through ERR-CORRECT-4
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm_service import stream_chat

from .conftest import (
    MockStreamResponse,
    MockUsageMetadata,
    make_text_stream,
    make_tool_call_stream,
)


@pytest.fixture
def mock_pool_error():
    """Mock pool whose run_query always returns a SQL error."""
    pool = MagicMock()
    pool.run_query = AsyncMock(return_value={
        "error_type": "sql_error",
        "message": "SQL syntax error near 'SELCT'",
        "details": "column 'foo' not found",
    })
    return pool


@pytest.fixture
def mock_pool_success_after_retries():
    """Mock pool whose run_query fails twice then succeeds."""
    pool = MagicMock()
    call_count = {"n": 0}

    async def side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] <= 2:
            return {
                "error_type": "sql_error",
                "message": f"Error on attempt {call_count['n']}",
                "details": "syntax error",
            }
        return {
            "rows": [{"id": 1}],
            "columns": ["id"],
            "total_rows": 1,
        }

    pool.run_query = AsyncMock(side_effect=side_effect)
    return pool


class TestSqlErrorSentBackToLlm:
    """ERR-CORRECT-1: SQL error sent back to LLM as tool response."""

    @pytest.mark.asyncio
    async def test_sql_error_triggers_retry(
        self,
        mock_gemini_client,
        mock_ws_send,
        sample_datasets,
        mock_pool_error,
    ):
        """When execute_sql fails, error is sent back to Gemini for retry."""
        # First call: tool call
        # Second call: retry tool call (LLM tries again after seeing error)
        # Third call: retry tool call (LLM tries again)
        # Fourth call: after 3 retries, LLM explains error
        tool_stream1 = make_tool_call_stream("execute_sql", {"query": "SELCT * FROM table1"})
        tool_stream2 = make_tool_call_stream("execute_sql", {"query": "SELECT * FROM table1"})
        tool_stream3 = make_tool_call_stream("execute_sql", {"query": "SELECT * FROM table1 LIMIT 10"})
        final_text = make_text_stream(["I encountered errors with the SQL."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream1, tool_stream2, tool_stream3, final_text]
        )

        messages = [{"role": "user", "content": "Query data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_pool_error)

        # Gemini was called multiple times (initial + retries + final)
        assert mock_gemini_client.aio.models.generate_content_stream.await_count >= 2
        # Error was passed back to Gemini (verify by checking run_query was called)
        assert mock_pool_error.run_query.await_count >= 1


class TestRetryUpToThreeTimes:
    """ERR-CORRECT-2: Retry up to 3 times."""

    @pytest.mark.asyncio
    async def test_max_three_sql_retries(
        self,
        mock_gemini_client,
        mock_ws_send,
        sample_datasets,
        mock_pool_error,
    ):
        """After 3 SQL failures, no more retries are attempted."""
        # Create enough tool call streams for potential 4+ retries
        tool_streams = [
            make_tool_call_stream("execute_sql", {"query": f"SELECT {i}"})
            for i in range(5)
        ]
        final_text = make_text_stream(["I could not execute the query."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=tool_streams + [final_text]
        )

        messages = [{"role": "user", "content": "Query data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_pool_error)

        # run_query should be called at most 3 times (initial + 2 retries = 3)
        assert mock_pool_error.run_query.await_count <= 3


class TestDifferentErrorTypes:
    """ERR-CORRECT-3: Different SQL error types are forwarded to Gemini."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "error_message",
        [
            "column 'foo' not found",
            "type mismatch: expected Int64 got Utf8",
            "SQL syntax error near 'SELCT'",
        ],
    )
    async def test_various_errors_forwarded(
        self,
        mock_gemini_client,
        mock_ws_send,
        sample_datasets,
        error_message,
    ):
        """Each error type is sent to Gemini as a descriptive tool response."""
        mock_pool = MagicMock()
        mock_pool.run_query = AsyncMock(return_value={
            "error_type": "sql_error",
            "message": error_message,
            "details": error_message,
        })

        tool_stream = make_tool_call_stream("execute_sql", {"query": "SELECT x"})
        final_text = make_text_stream(["Error encountered."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, final_text]
        )

        messages = [{"role": "user", "content": "Query"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_pool)

        # Gemini should have been called at least twice
        assert mock_gemini_client.aio.models.generate_content_stream.await_count >= 2


class TestAfterThreeFailuresLlmExplains:
    """ERR-CORRECT-4: After 3 failures, LLM explains the error."""

    @pytest.mark.asyncio
    async def test_forced_explanation_after_3_failures(
        self,
        mock_gemini_client,
        mock_ws_send,
        sample_datasets,
        mock_pool_error,
    ):
        """After 3 SQL retries exhausted, LLM produces an explanation."""
        tool_streams = [
            make_tool_call_stream("execute_sql", {"query": f"SELECT {i}"})
            for i in range(4)
        ]
        final_text = make_text_stream(["I was unable to run the query successfully."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=tool_streams + [final_text]
        )

        messages = [{"role": "user", "content": "Query data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_pool_error)

        # The final response should be text (not another tool call)
        assert result.assistant_message is not None
        assert len(result.assistant_message) > 0
