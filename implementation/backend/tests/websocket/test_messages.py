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
    conversation_title_updated,
    dataset_error,
    dataset_loaded,
    dataset_loading,
    query_status,
    rate_limit_exceeded,
    rate_limit_warning,
    reasoning_complete,
    reasoning_token,
    tool_call_start,
    usage_update,
)


# ---- WS-MSG-1: chat_token ----

class TestChatToken:
    """Verify ``chat_token`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = chat_token(token="Hello", message_id="msg-1")
        assert result["type"] == "ct"

    def test_includes_token_field(self):
        result = chat_token(token="world", message_id="msg-2")
        assert result["t"] == "world"

    def test_includes_message_id(self):
        result = chat_token(token="x", message_id="msg-abc")
        assert result["mid"] == "msg-abc"

    def test_exact_keys(self):
        result = chat_token(token="t", message_id="m")
        assert set(result.keys()) == {"type", "t", "mid"}

    def test_empty_token(self):
        result = chat_token(token="", message_id="msg-1")
        assert result["t"] == ""


# ---- WS-MSG-2: chat_complete ----

class TestChatComplete:
    """Verify ``chat_complete`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = chat_complete(message_id="msg-1", sql_query="SELECT 1", token_count=42)
        assert result["type"] == "cc"

    def test_includes_message_id(self):
        result = chat_complete(message_id="msg-99", sql_query=None, token_count=10)
        assert result["mid"] == "msg-99"

    def test_includes_sql_query(self):
        result = chat_complete(message_id="m", sql_query="SELECT * FROM t", token_count=5)
        assert result["sq"] == "SELECT * FROM t"

    def test_sql_query_none_omitted(self):
        """Null sql_query is omitted from compressed format."""
        result = chat_complete(message_id="m", sql_query=None, token_count=5)
        assert "sq" not in result
        assert "sql_query" not in result

    def test_includes_token_count(self):
        result = chat_complete(message_id="m", sql_query=None, token_count=100)
        assert result["tc"] == 100

    def test_exact_keys_with_sql(self):
        result = chat_complete(message_id="m", sql_query="q", token_count=1)
        assert set(result.keys()) == {"type", "mid", "sq", "tc", "se"}

    def test_exact_keys_without_sql(self):
        result = chat_complete(message_id="m", sql_query=None, token_count=1)
        assert set(result.keys()) == {"type", "mid", "tc", "se"}


# ---- WS-MSG-3: chat_error ----

class TestChatError:
    """Verify ``chat_error`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = chat_error(error="something broke", details=None)
        assert result["type"] == "ce"

    def test_includes_error(self):
        result = chat_error(error="timeout", details=None)
        assert result["e"] == "timeout"

    def test_includes_details(self):
        result = chat_error(error="err", details="extra info")
        assert result["d"] == "extra info"

    def test_details_none_omitted(self):
        """Null details is omitted from compressed format."""
        result = chat_error(error="err", details=None)
        assert "d" not in result
        assert "details" not in result

    def test_exact_keys_with_details(self):
        result = chat_error(error="e", details="d")
        assert set(result.keys()) == {"type", "e", "d"}

    def test_exact_keys_without_details(self):
        result = chat_error(error="e", details=None)
        assert set(result.keys()) == {"type", "e"}


# ---- WS-MSG-4: dataset_loading ----

class TestDatasetLoading:
    """Verify ``dataset_loading`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = dataset_loading(dataset_id="ds-1", url="https://example.com/data.parquet")
        assert result["type"] == "dl"

    def test_includes_dataset_id(self):
        result = dataset_loading(dataset_id="ds-abc", url="https://x.com/f.parquet")
        assert result["did"] == "ds-abc"

    def test_includes_url(self):
        result = dataset_loading(dataset_id="ds-1", url="https://example.com/data.parquet")
        assert result["u"] == "https://example.com/data.parquet"

    def test_includes_status_loading(self):
        """Per spec, dataset_loading includes status: 'loading'."""
        result = dataset_loading(dataset_id="ds-1", url="https://x.com/f.parquet")
        assert result["s"] == "loading"

    def test_exact_keys(self):
        result = dataset_loading(dataset_id="d", url="u")
        assert set(result.keys()) == {"type", "did", "u", "s"}


# ---- WS-MSG-5: dataset_loaded ----

class TestDatasetLoaded:
    """Verify ``dataset_loaded`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = dataset_loaded(
            dataset_id="ds-1",
            name="sales.parquet",
            row_count=1000,
            column_count=5,
            schema=[{"name": "id", "type": "INTEGER"}],
        )
        assert result["type"] == "dld"

    def test_includes_all_fields(self):
        schema = [{"name": "id", "type": "INTEGER"}, {"name": "value", "type": "TEXT"}]
        result = dataset_loaded(
            dataset_id="ds-2",
            name="data.parquet",
            row_count=50,
            column_count=2,
            schema=schema,
        )
        assert result["did"] == "ds-2"
        assert result["n"] == "data.parquet"
        assert result["rc"] == 50
        assert result["cc"] == 2
        assert result["sc"] == schema

    def test_exact_keys(self):
        result = dataset_loaded(
            dataset_id="d", name="n", row_count=0, column_count=0, schema=[]
        )
        assert set(result.keys()) == {
            "type", "did", "n", "rc", "cc", "sc"
        }


# ---- WS-MSG-6: dataset_error ----

class TestDatasetError:
    """Verify ``dataset_error`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = dataset_error(dataset_id="ds-1", error="download failed")
        assert result["type"] == "de"

    def test_includes_dataset_id(self):
        result = dataset_error(dataset_id="ds-x", error="oops")
        assert result["did"] == "ds-x"

    def test_includes_error(self):
        result = dataset_error(dataset_id="ds-1", error="timeout")
        assert result["e"] == "timeout"

    def test_exact_keys(self):
        result = dataset_error(dataset_id="d", error="e")
        assert set(result.keys()) == {"type", "did", "e"}


# ---- WS-MSG-7: query_status ----

class TestQueryStatus:
    """Verify ``query_status`` returns correct shape (compressed format)."""

    @pytest.mark.parametrize(
        "phase",
        ["queued", "generating", "executing", "formatting"],
    )
    def test_valid_phases(self, phase: str):
        result = query_status(phase=phase)
        assert result["type"] == "qs"
        assert result["p"] == phase

    def test_exact_keys(self):
        result = query_status(phase="generating")
        assert set(result.keys()) == {"type", "p"}


# ---- WS-MSG-8: rate_limit_warning ----

class TestRateLimitWarning:
    """Verify ``rate_limit_warning`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = rate_limit_warning(usage_percent=85.0, remaining_tokens=1500)
        assert result["type"] == "rlw"

    def test_includes_usage_percent(self):
        result = rate_limit_warning(usage_percent=90.5, remaining_tokens=500)
        assert result["up"] == 90.5

    def test_includes_remaining_tokens(self):
        result = rate_limit_warning(usage_percent=80.0, remaining_tokens=2000)
        assert result["rt"] == 2000

    def test_exact_keys(self):
        result = rate_limit_warning(usage_percent=80.0, remaining_tokens=100)
        assert set(result.keys()) == {"type", "up", "rt"}


# ---- WS-MSG-9: rate_limit_exceeded ----

class TestRateLimitExceeded:
    """Verify ``rate_limit_exceeded`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = rate_limit_exceeded(resets_in_seconds=3600)
        assert result["type"] == "rle"

    def test_includes_resets_in_seconds(self):
        result = rate_limit_exceeded(resets_in_seconds=120)
        assert result["rs"] == 120

    def test_exact_keys(self):
        result = rate_limit_exceeded(resets_in_seconds=60)
        assert set(result.keys()) == {"type", "rs"}


# ---- Additional compressed message types ----

class TestReasoningToken:
    """Verify ``reasoning_token`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = reasoning_token(token="thinking...")
        assert result["type"] == "rt"

    def test_includes_token(self):
        result = reasoning_token(token="deep thought")
        assert result["t"] == "deep thought"

    def test_exact_keys(self):
        result = reasoning_token(token="x")
        assert set(result.keys()) == {"type", "t"}


class TestReasoningComplete:
    """Verify ``reasoning_complete`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = reasoning_complete()
        assert result["type"] == "rc"

    def test_exact_keys(self):
        result = reasoning_complete()
        assert set(result.keys()) == {"type"}


class TestToolCallStart:
    """Verify ``tool_call_start`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = tool_call_start(tool="execute_sql", args={"query": "SELECT 1"})
        assert result["type"] == "tcs"

    def test_includes_tool(self):
        result = tool_call_start(tool="my_tool", args={})
        assert result["tl"] == "my_tool"

    def test_includes_args(self):
        args = {"key": "value"}
        result = tool_call_start(tool="tool", args=args)
        assert result["a"] == args

    def test_exact_keys(self):
        result = tool_call_start(tool="t", args={})
        assert set(result.keys()) == {"type", "tl", "a"}


class TestConversationTitleUpdated:
    """Verify ``conversation_title_updated`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = conversation_title_updated()
        assert result["type"] == "ctu"

    def test_exact_keys(self):
        result = conversation_title_updated()
        assert set(result.keys()) == {"type"}


class TestUsageUpdate:
    """Verify ``usage_update`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = usage_update()
        assert result["type"] == "uu"

    def test_exact_keys(self):
        result = usage_update()
        assert set(result.keys()) == {"type"}
