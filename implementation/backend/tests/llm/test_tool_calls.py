"""TOOL tests: tool call dispatch (execute_sql, load_dataset).

Tests: spec/backend/llm/test.md#TOOL-1 through TOOL-4
"""

from __future__ import annotations

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
    """Mock worker_pool.run_query."""
    with patch("app.services.llm_service.worker_pool") as mock_wp:
        mock_wp.run_query = AsyncMock(return_value={
            "rows": [{"id": 1, "value": "a"}],
            "columns": ["id", "value"],
            "total_rows": 1,
        })
        yield mock_wp


@pytest.fixture
def mock_dataset_service():
    """Mock dataset_service.add_dataset."""
    with patch("app.services.llm_service.dataset_service") as mock_ds:
        mock_ds.add_dataset = AsyncMock(return_value={
            "id": "ds-123",
            "name": "table1",
            "row_count": 100,
            "column_count": 3,
        })
        yield mock_ds


class TestExecuteSqlToolCall:
    """TOOL-1: execute_sql tool call dispatches to worker_pool.run_query."""

    @pytest.mark.asyncio
    async def test_execute_sql_dispatches_to_run_query(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """LLM calls execute_sql -> worker_pool.run_query is invoked with the SQL."""
        # First call: tool call stream
        tool_stream = make_tool_call_stream(
            "execute_sql", {"query": "SELECT * FROM table1"}
        )
        # Second call: final text response after tool result
        text_stream = make_text_stream(["Here are the results."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Show me the data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        mock_run_query.run_query.assert_awaited_once()
        call_args = mock_run_query.run_query.call_args
        assert "SELECT * FROM table1" in str(call_args)

    @pytest.mark.asyncio
    async def test_execute_sql_result_sent_back_to_gemini(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """After execute_sql, tool result is sent back to Gemini for continuation."""
        tool_stream = make_tool_call_stream(
            "execute_sql", {"query": "SELECT * FROM table1"}
        )
        text_stream = make_text_stream(["The results show one row."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Show me data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        # Gemini should have been called twice: initial + after tool result
        assert mock_gemini_client.aio.models.generate_content_stream.call_count == 2

    @pytest.mark.asyncio
    async def test_tool_call_start_event_sent(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """ws_send receives a tool_call_start event when tool call is detected."""
        tool_stream = make_tool_call_stream(
            "execute_sql", {"query": "SELECT 1"}
        )
        text_stream = make_text_stream(["Done."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "test"}]
        await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        tool_start_events = [
            m for m in mock_ws_send.messages if m["type"] == "tcs"
        ]
        assert len(tool_start_events) >= 1
        assert tool_start_events[0]["tl"] == "execute_sql"


class TestLoadDatasetToolCall:
    """TOOL-2: load_dataset tool call dispatches to dataset_service.add_dataset."""

    @pytest.mark.asyncio
    async def test_load_dataset_dispatches_to_add_dataset(
        self,
        mock_gemini_client,
        mock_ws_send,
        sample_datasets,
        mock_run_query,
        mock_dataset_service,
    ):
        """LLM calls load_dataset -> dataset_service.add_dataset is invoked."""
        tool_stream = make_tool_call_stream(
            "load_dataset", {"url": "https://example.com/data.parquet"}
        )
        text_stream = make_text_stream(["Dataset loaded successfully."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Load this data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        mock_dataset_service.add_dataset.assert_awaited_once()
        call_args = mock_dataset_service.add_dataset.call_args
        assert "https://example.com/data.parquet" in str(call_args)

    @pytest.mark.asyncio
    async def test_load_dataset_result_returned_to_gemini(
        self,
        mock_gemini_client,
        mock_ws_send,
        sample_datasets,
        mock_run_query,
        mock_dataset_service,
    ):
        """After load_dataset, result is sent back to Gemini."""
        tool_stream = make_tool_call_stream(
            "load_dataset", {"url": "https://example.com/data.parquet"}
        )
        text_stream = make_text_stream(["I loaded the dataset."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Load this"}]
        await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        assert mock_gemini_client.aio.models.generate_content_stream.call_count == 2


class TestMaxToolCalls:
    """TOOL-4: Maximum 5 tool calls per turn."""

    @pytest.mark.asyncio
    async def test_max_five_tool_calls_enforced(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """After 5 tool calls, no more tool calls are executed."""
        # Create 6 sequential tool call responses followed by a final text
        tool_streams = [
            make_tool_call_stream("execute_sql", {"query": f"SELECT {i}"})
            for i in range(6)
        ]
        final_text = make_text_stream(["Here is the summary."])

        # After 5 tool calls, the 6th should not be dispatched;
        # instead the LLM should be forced to respond
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=tool_streams + [final_text]
        )

        messages = [{"role": "user", "content": "Run many queries"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        # run_query should have been called at most 5 times
        assert mock_run_query.run_query.await_count <= 5

    @pytest.mark.asyncio
    async def test_max_tool_calls_still_produces_response(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query
    ):
        """Even when max tool calls reached, a final response is produced."""
        tool_streams = [
            make_tool_call_stream("execute_sql", {"query": f"SELECT {i}"})
            for i in range(5)
        ]
        final_text = make_text_stream(["Summary after 5 calls."])

        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=tool_streams + [final_text]
        )

        messages = [{"role": "user", "content": "Run queries"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query)

        assert result.assistant_message is not None
        assert len(result.assistant_message) > 0
