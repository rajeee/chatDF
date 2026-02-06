"""Tests for WebSocket message factory functions.

Tests: spec/backend/websocket/test.md#WS-MSG-1 through WS-MSG-9

Each test verifies:
- The returned dict has the correct ``type`` field
- All required fields are present with expected values
- No unexpected fields are included
"""

from __future__ import annotations

import pytest

from app.services.ws_messages import (
    chat_complete,
    chat_error,
    chat_token,
    dataset_error,
    dataset_loaded,
    dataset_loading,
    query_status,
    rate_limit_exceeded,
    rate_limit_warning,
)


# ---- WS-MSG-1: chat_token ----

class TestChatToken:
    """Verify ``chat_token`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = chat_token(token="Hello", message_id="msg-1")
        assert result["type"] == "chat_token"

    def test_includes_token_field(self):
        result = chat_token(token="world", message_id="msg-2")
        assert result["token"] == "world"

    def test_includes_message_id(self):
        result = chat_token(token="x", message_id="msg-abc")
        assert result["message_id"] == "msg-abc"

    def test_exact_keys(self):
        result = chat_token(token="t", message_id="m")
        assert set(result.keys()) == {"type", "token", "message_id"}

    def test_empty_token(self):
        result = chat_token(token="", message_id="msg-1")
        assert result["token"] == ""


# ---- WS-MSG-2: chat_complete ----

class TestChatComplete:
    """Verify ``chat_complete`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = chat_complete(message_id="msg-1", sql_query="SELECT 1", token_count=42)
        assert result["type"] == "chat_complete"

    def test_includes_message_id(self):
        result = chat_complete(message_id="msg-99", sql_query=None, token_count=10)
        assert result["message_id"] == "msg-99"

    def test_includes_sql_query(self):
        result = chat_complete(message_id="m", sql_query="SELECT * FROM t", token_count=5)
        assert result["sql_query"] == "SELECT * FROM t"

    def test_sql_query_none(self):
        result = chat_complete(message_id="m", sql_query=None, token_count=5)
        assert result["sql_query"] is None

    def test_includes_token_count(self):
        result = chat_complete(message_id="m", sql_query=None, token_count=100)
        assert result["token_count"] == 100

    def test_exact_keys(self):
        result = chat_complete(message_id="m", sql_query="q", token_count=1)
        assert set(result.keys()) == {"type", "message_id", "sql_query", "token_count"}


# ---- WS-MSG-3: chat_error ----

class TestChatError:
    """Verify ``chat_error`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = chat_error(error="something broke", details=None)
        assert result["type"] == "chat_error"

    def test_includes_error(self):
        result = chat_error(error="timeout", details=None)
        assert result["error"] == "timeout"

    def test_includes_details(self):
        result = chat_error(error="err", details="extra info")
        assert result["details"] == "extra info"

    def test_details_none(self):
        result = chat_error(error="err", details=None)
        assert result["details"] is None

    def test_exact_keys(self):
        result = chat_error(error="e", details="d")
        assert set(result.keys()) == {"type", "error", "details"}


# ---- WS-MSG-4: dataset_loading ----

class TestDatasetLoading:
    """Verify ``dataset_loading`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = dataset_loading(dataset_id="ds-1", url="https://example.com/data.parquet")
        assert result["type"] == "dataset_loading"

    def test_includes_dataset_id(self):
        result = dataset_loading(dataset_id="ds-abc", url="https://x.com/f.parquet")
        assert result["dataset_id"] == "ds-abc"

    def test_includes_url(self):
        result = dataset_loading(dataset_id="ds-1", url="https://example.com/data.parquet")
        assert result["url"] == "https://example.com/data.parquet"

    def test_includes_status_loading(self):
        """Per spec, dataset_loading includes status: 'loading'."""
        result = dataset_loading(dataset_id="ds-1", url="https://x.com/f.parquet")
        assert result["status"] == "loading"

    def test_exact_keys(self):
        result = dataset_loading(dataset_id="d", url="u")
        assert set(result.keys()) == {"type", "dataset_id", "url", "status"}


# ---- WS-MSG-5: dataset_loaded ----

class TestDatasetLoaded:
    """Verify ``dataset_loaded`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = dataset_loaded(
            dataset_id="ds-1",
            name="sales.parquet",
            row_count=1000,
            column_count=5,
            schema=[{"name": "id", "type": "INTEGER"}],
        )
        assert result["type"] == "dataset_loaded"

    def test_includes_all_fields(self):
        schema = [{"name": "id", "type": "INTEGER"}, {"name": "value", "type": "TEXT"}]
        result = dataset_loaded(
            dataset_id="ds-2",
            name="data.parquet",
            row_count=50,
            column_count=2,
            schema=schema,
        )
        assert result["dataset_id"] == "ds-2"
        assert result["name"] == "data.parquet"
        assert result["row_count"] == 50
        assert result["column_count"] == 2
        assert result["schema"] == schema

    def test_exact_keys(self):
        result = dataset_loaded(
            dataset_id="d", name="n", row_count=0, column_count=0, schema=[]
        )
        assert set(result.keys()) == {
            "type", "dataset_id", "name", "row_count", "column_count", "schema"
        }


# ---- WS-MSG-6: dataset_error ----

class TestDatasetError:
    """Verify ``dataset_error`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = dataset_error(dataset_id="ds-1", error="download failed")
        assert result["type"] == "dataset_error"

    def test_includes_dataset_id(self):
        result = dataset_error(dataset_id="ds-x", error="oops")
        assert result["dataset_id"] == "ds-x"

    def test_includes_error(self):
        result = dataset_error(dataset_id="ds-1", error="timeout")
        assert result["error"] == "timeout"

    def test_exact_keys(self):
        result = dataset_error(dataset_id="d", error="e")
        assert set(result.keys()) == {"type", "dataset_id", "error"}


# ---- WS-MSG-7: query_status ----

class TestQueryStatus:
    """Verify ``query_status`` returns correct shape."""

    @pytest.mark.parametrize(
        "phase",
        ["queued", "generating", "executing", "formatting"],
    )
    def test_valid_phases(self, phase: str):
        result = query_status(phase=phase)
        assert result["type"] == "query_status"
        assert result["phase"] == phase

    def test_exact_keys(self):
        result = query_status(phase="generating")
        assert set(result.keys()) == {"type", "phase"}


# ---- WS-MSG-8: rate_limit_warning ----

class TestRateLimitWarning:
    """Verify ``rate_limit_warning`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = rate_limit_warning(usage_percent=85.0, remaining_tokens=1500)
        assert result["type"] == "rate_limit_warning"

    def test_includes_usage_percent(self):
        result = rate_limit_warning(usage_percent=90.5, remaining_tokens=500)
        assert result["usage_percent"] == 90.5

    def test_includes_remaining_tokens(self):
        result = rate_limit_warning(usage_percent=80.0, remaining_tokens=2000)
        assert result["remaining_tokens"] == 2000

    def test_exact_keys(self):
        result = rate_limit_warning(usage_percent=80.0, remaining_tokens=100)
        assert set(result.keys()) == {"type", "usage_percent", "remaining_tokens"}


# ---- WS-MSG-9: rate_limit_exceeded ----

class TestRateLimitExceeded:
    """Verify ``rate_limit_exceeded`` returns correct shape."""

    def test_returns_dict_with_type(self):
        result = rate_limit_exceeded(resets_in_seconds=3600)
        assert result["type"] == "rate_limit_exceeded"

    def test_includes_resets_in_seconds(self):
        result = rate_limit_exceeded(resets_in_seconds=120)
        assert result["resets_in_seconds"] == 120

    def test_exact_keys(self):
        result = rate_limit_exceeded(resets_in_seconds=60)
        assert set(result.keys()) == {"type", "resets_in_seconds"}
