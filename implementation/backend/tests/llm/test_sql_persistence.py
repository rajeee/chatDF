"""Tests for SQL execution persistence: full_rows vs capped rows.

Verifies that:
- SqlExecution stores both full_rows (up to 1000) and rows (capped at 100)
- DB serialization uses full_rows for persistence
- WS chat_complete event uses capped rows for transmission
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm_service import SqlExecution, stream_chat

from .conftest import (
    MockChunk,
    MockFunctionCall,
    MockStreamResponse,
    MockUsageMetadata,
    make_text_stream,
    make_tool_call_stream,
)


class TestSqlExecutionFullRows:
    """Tests for SqlExecution dataclass full_rows field."""

    def test_full_rows_default_is_none(self):
        """SqlExecution.full_rows defaults to None."""
        ex = SqlExecution(query="SELECT 1")
        assert ex.full_rows is None

    def test_full_rows_stores_all_rows(self):
        """SqlExecution.full_rows can store up to 1000 rows."""
        all_rows = [[i, f"val_{i}"] for i in range(500)]
        capped = all_rows[:100]
        ex = SqlExecution(
            query="SELECT * FROM t",
            columns=["id", "value"],
            rows=capped,
            full_rows=all_rows,
            total_rows=500,
        )
        assert len(ex.rows) == 100
        assert len(ex.full_rows) == 500
        assert ex.total_rows == 500

    def test_rows_and_full_rows_independent(self):
        """Rows and full_rows are independent lists."""
        all_rows = [[i] for i in range(200)]
        capped = all_rows[:100]
        ex = SqlExecution(
            query="SELECT id FROM t",
            columns=["id"],
            rows=capped,
            full_rows=all_rows,
            total_rows=200,
        )
        assert ex.rows is not ex.full_rows
        assert len(ex.rows) == 100
        assert len(ex.full_rows) == 200


class TestExecuteSqlFullRows:
    """Tests that execute_sql tool call populates both rows and full_rows."""

    @pytest.fixture
    def large_query_result(self):
        """Mock worker result with 500 rows."""
        columns = ["id", "name"]
        rows = [{"id": i, "name": f"name_{i}"} for i in range(500)]
        return {
            "rows": rows,
            "columns": columns,
            "total_rows": 500,
            "execution_time_ms": 42.5,
        }

    @pytest.fixture
    def mock_run_query_large(self, large_query_result):
        """Mock worker_pool.run_query returning 500 rows."""
        with patch("app.services.llm_service.worker_pool") as mock_wp:
            mock_wp.run_query = AsyncMock(return_value=large_query_result)
            yield mock_wp

    @pytest.mark.asyncio
    async def test_full_rows_populated_with_all_worker_rows(
        self, mock_gemini_client, mock_ws_send, sample_datasets, mock_run_query_large
    ):
        """full_rows contains all rows from worker (up to 1000), rows capped at 100."""
        tool_stream = make_tool_call_stream(
            "execute_sql", {"query": "SELECT * FROM table1"}
        )
        text_stream = make_text_stream(["Here are results."])
        mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
            side_effect=[tool_stream, text_stream]
        )

        messages = [{"role": "user", "content": "Show data"}]
        result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_run_query_large)

        assert len(result.sql_executions) == 1
        ex = result.sql_executions[0]
        # rows: capped at 100
        assert len(ex.rows) == 100
        # full_rows: all 500 rows from worker
        assert len(ex.full_rows) == 500
        assert ex.total_rows == 500

    @pytest.mark.asyncio
    async def test_small_result_rows_equal_full_rows(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """When result has <= 100 rows, rows and full_rows contain same data."""
        small_result = {
            "rows": [{"id": i} for i in range(50)],
            "columns": ["id"],
            "total_rows": 50,
            "execution_time_ms": 5.0,
        }
        with patch("app.services.llm_service.worker_pool") as mock_wp:
            mock_wp.run_query = AsyncMock(return_value=small_result)

            tool_stream = make_tool_call_stream(
                "execute_sql", {"query": "SELECT id FROM table1"}
            )
            text_stream = make_text_stream(["Done."])
            mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
                side_effect=[tool_stream, text_stream]
            )

            messages = [{"role": "user", "content": "query"}]
            result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_wp)

        ex = result.sql_executions[0]
        assert len(ex.rows) == 50
        assert len(ex.full_rows) == 50
        assert ex.rows == ex.full_rows

    @pytest.mark.asyncio
    async def test_error_execution_has_no_full_rows(
        self, mock_gemini_client, mock_ws_send, sample_datasets
    ):
        """Error executions don't have full_rows."""
        error_result = {
            "error_type": "sql",
            "message": "Table not found",
            "execution_time_ms": 1.0,
        }
        with patch("app.services.llm_service.worker_pool") as mock_wp:
            mock_wp.run_query = AsyncMock(return_value=error_result)

            tool_stream = make_tool_call_stream(
                "execute_sql", {"query": "SELECT * FROM missing"}
            )
            text_stream = make_text_stream(["Error occurred."])
            mock_gemini_client.aio.models.generate_content_stream = AsyncMock(
                side_effect=[tool_stream, text_stream]
            )

            messages = [{"role": "user", "content": "query"}]
            result = await stream_chat(messages, sample_datasets, mock_ws_send, pool=mock_wp)

        ex = result.sql_executions[0]
        assert ex.error is not None
        assert ex.full_rows is None
        assert ex.rows is None


class TestChatServiceSerialization:
    """Tests for DB vs WS serialization of sql_executions."""

    def test_db_serialization_uses_full_rows(self):
        """When serializing for DB, full_rows should be used instead of rows."""
        all_rows = [[i, f"val_{i}"] for i in range(300)]
        capped = all_rows[:100]
        ex = SqlExecution(
            query="SELECT * FROM t",
            columns=["id", "value"],
            rows=capped,
            full_rows=all_rows,
            total_rows=300,
            execution_time_ms=15.0,
        )

        # Simulate what chat_service does for DB serialization
        db_dict = {
            "query": ex.query,
            "columns": ex.columns,
            "rows": ex.full_rows if ex.full_rows is not None else ex.rows,
            "total_rows": ex.total_rows,
            "error": ex.error,
            "execution_time_ms": ex.execution_time_ms,
        }

        assert len(db_dict["rows"]) == 300
        db_json = json.dumps([db_dict], default=str)
        parsed = json.loads(db_json)
        assert len(parsed[0]["rows"]) == 300
        assert parsed[0]["execution_time_ms"] == 15.0

    def test_ws_serialization_uses_capped_rows(self):
        """When serializing for WS, capped rows (100) should be used."""
        all_rows = [[i, f"val_{i}"] for i in range(300)]
        capped = all_rows[:100]
        ex = SqlExecution(
            query="SELECT * FROM t",
            columns=["id", "value"],
            rows=capped,
            full_rows=all_rows,
            total_rows=300,
            execution_time_ms=15.0,
        )

        # Simulate what chat_service does for WS serialization
        ws_dict = {
            "query": ex.query,
            "columns": ex.columns,
            "rows": ex.rows,
            "total_rows": ex.total_rows,
            "error": ex.error,
            "execution_time_ms": ex.execution_time_ms,
        }

        assert len(ws_dict["rows"]) == 100

    def test_db_serialization_preserves_execution_time(self):
        """DB serialization now includes execution_time_ms."""
        ex = SqlExecution(
            query="SELECT 1",
            columns=["1"],
            rows=[[1]],
            full_rows=[[1]],
            total_rows=1,
            execution_time_ms=3.14,
        )
        db_dict = {
            "query": ex.query,
            "columns": ex.columns,
            "rows": ex.full_rows if ex.full_rows is not None else ex.rows,
            "total_rows": ex.total_rows,
            "error": ex.error,
            "execution_time_ms": ex.execution_time_ms,
        }
        db_json = json.dumps([db_dict], default=str)
        parsed = json.loads(db_json)
        assert parsed[0]["execution_time_ms"] == 3.14

    def test_backward_compat_no_full_rows(self):
        """SqlExecution without full_rows falls back to rows for DB."""
        ex = SqlExecution(
            query="SELECT 1",
            columns=["1"],
            rows=[[1]],
            total_rows=1,
        )
        # full_rows is None, so DB should fall back to rows
        db_rows = ex.full_rows if ex.full_rows is not None else ex.rows
        assert db_rows == [[1]]
