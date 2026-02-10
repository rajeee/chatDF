"""Tests for WebSocket message factory functions.

Each factory function in ``app.services.ws_messages`` returns a compressed
dict with a ``type`` discriminator and shortened field names.  These tests
verify the exact dict structure for every function, including edge cases
around optional/nullable fields, empty values, and boundary inputs.
"""

from __future__ import annotations

from app.services.ws_messages import (
    chart_spec,
    chat_complete,
    chat_error,
    chat_token,
    conversation_title_updated,
    dataset_error,
    dataset_loaded,
    dataset_loading,
    followup_suggestions,
    query_progress,
    query_status,
    rate_limit_exceeded,
    rate_limit_warning,
    reasoning_complete,
    reasoning_token,
    tool_call_start,
    usage_update,
)


# ---------------------------------------------------------------------------
# chat_token
# ---------------------------------------------------------------------------
class TestChatToken:
    def test_returns_compressed_format(self):
        result = chat_token(token="hello", message_id="msg-1")
        assert result == {"type": "ct", "t": "hello", "mid": "msg-1"}

    def test_empty_token(self):
        result = chat_token(token="", message_id="msg-1")
        assert result == {"type": "ct", "t": "", "mid": "msg-1"}

    def test_multiline_token(self):
        result = chat_token(token="line1\nline2", message_id="m")
        assert result["t"] == "line1\nline2"

    def test_special_characters_in_token(self):
        result = chat_token(token='<script>alert("xss")</script>', message_id="m")
        assert result["t"] == '<script>alert("xss")</script>'

    def test_unicode_token(self):
        result = chat_token(token="\U0001f600\u00e9", message_id="m")
        assert result["t"] == "\U0001f600\u00e9"

    def test_only_expected_keys(self):
        result = chat_token(token="x", message_id="y")
        assert set(result.keys()) == {"type", "t", "mid"}

    def test_keyword_only_enforcement(self):
        """All arguments must be keyword-only."""
        try:
            chat_token("tok", "mid")  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# chat_complete
# ---------------------------------------------------------------------------
class TestChatComplete:
    def test_all_fields_provided(self):
        result = chat_complete(
            message_id="msg-42",
            sql_query="SELECT 1",
            token_count=150,
            sql_executions=[{"q": "SELECT 1", "rows": 1}],
            reasoning="thought about it",
            input_tokens=100,
            output_tokens=50,
            tool_call_trace=[{"tool": "run_sql", "args": {}}],
        )
        assert result == {
            "type": "cc",
            "mid": "msg-42",
            "tc": 150,
            "se": [{"q": "SELECT 1", "rows": 1}],
            "it": 100,
            "ot": 50,
            "sq": "SELECT 1",
            "r": "thought about it",
            "tct": [{"tool": "run_sql", "args": {}}],
        }

    def test_optional_fields_omitted_when_none(self):
        result = chat_complete(
            message_id="msg-1",
            sql_query=None,
            token_count=10,
            sql_executions=None,
            reasoning=None,
            input_tokens=5,
            output_tokens=5,
            tool_call_trace=None,
        )
        assert "sq" not in result
        assert "r" not in result
        assert "tct" not in result

    def test_sql_executions_defaults_to_empty_list_when_none(self):
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
            sql_executions=None,
        )
        assert result["se"] == []

    def test_sql_executions_defaults_to_empty_list_when_omitted(self):
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
        )
        assert result["se"] == []

    def test_input_output_tokens_default_to_zero(self):
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
        )
        assert result["it"] == 0
        assert result["ot"] == 0

    def test_empty_string_sql_query_is_falsy_omitted(self):
        """An empty sql_query string is falsy and should be omitted."""
        result = chat_complete(
            message_id="m",
            sql_query="",
            token_count=0,
        )
        assert "sq" not in result

    def test_empty_string_reasoning_is_falsy_omitted(self):
        """An empty reasoning string is falsy and should be omitted."""
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
            reasoning="",
        )
        assert "r" not in result

    def test_empty_list_tool_call_trace_is_falsy_omitted(self):
        """An empty tool_call_trace list is falsy and should be omitted."""
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
            tool_call_trace=[],
        )
        assert "tct" not in result

    def test_required_keys_always_present(self):
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
        )
        assert set(result.keys()) >= {"type", "mid", "tc", "se", "it", "ot"}

    def test_only_expected_keys_all_optional_none(self):
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=0,
        )
        assert set(result.keys()) == {"type", "mid", "tc", "se", "it", "ot"}

    def test_only_expected_keys_all_optional_set(self):
        result = chat_complete(
            message_id="m",
            sql_query="q",
            token_count=0,
            reasoning="r",
            tool_call_trace=[{"t": 1}],
        )
        assert set(result.keys()) == {
            "type", "mid", "tc", "se", "it", "ot", "sq", "r", "tct",
        }

    def test_large_token_count(self):
        result = chat_complete(
            message_id="m",
            sql_query=None,
            token_count=999_999,
        )
        assert result["tc"] == 999_999

    def test_keyword_only_enforcement(self):
        try:
            chat_complete("m", None, 0)  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# chat_error
# ---------------------------------------------------------------------------
class TestChatError:
    def test_with_details(self):
        result = chat_error(error="Something failed", details="traceback here")
        assert result == {
            "type": "ce",
            "e": "Something failed",
            "d": "traceback here",
        }

    def test_details_omitted_when_none(self):
        result = chat_error(error="fail", details=None)
        assert result == {"type": "ce", "e": "fail"}
        assert "d" not in result

    def test_empty_details_is_falsy_omitted(self):
        result = chat_error(error="fail", details="")
        assert "d" not in result

    def test_only_expected_keys_with_details(self):
        result = chat_error(error="e", details="d")
        assert set(result.keys()) == {"type", "e", "d"}

    def test_only_expected_keys_without_details(self):
        result = chat_error(error="e", details=None)
        assert set(result.keys()) == {"type", "e"}

    def test_keyword_only_enforcement(self):
        try:
            chat_error("err", None)  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# dataset_loading
# ---------------------------------------------------------------------------
class TestDatasetLoading:
    def test_returns_compressed_format(self):
        result = dataset_loading(dataset_id="ds-1", url="https://example.com/data.csv")
        assert result == {
            "type": "dl",
            "did": "ds-1",
            "u": "https://example.com/data.csv",
            "s": "loading",
        }

    def test_status_always_loading(self):
        result = dataset_loading(dataset_id="x", url="u")
        assert result["s"] == "loading"

    def test_only_expected_keys(self):
        result = dataset_loading(dataset_id="x", url="u")
        assert set(result.keys()) == {"type", "did", "u", "s"}

    def test_keyword_only_enforcement(self):
        try:
            dataset_loading("ds-1", "u")  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# dataset_loaded
# ---------------------------------------------------------------------------
class TestDatasetLoaded:
    def test_returns_compressed_format(self):
        schema = [{"name": "id", "type": "int"}, {"name": "val", "type": "str"}]
        result = dataset_loaded(
            dataset_id="ds-1",
            name="sales.csv",
            row_count=1000,
            column_count=5,
            schema=schema,
        )
        assert result == {
            "type": "dld",
            "did": "ds-1",
            "n": "sales.csv",
            "rc": 1000,
            "cc": 5,
            "sc": schema,
        }

    def test_empty_schema(self):
        result = dataset_loaded(
            dataset_id="ds-1",
            name="empty.csv",
            row_count=0,
            column_count=0,
            schema=[],
        )
        assert result["sc"] == []
        assert result["rc"] == 0
        assert result["cc"] == 0

    def test_only_expected_keys(self):
        result = dataset_loaded(
            dataset_id="x",
            name="n",
            row_count=0,
            column_count=0,
            schema=[],
        )
        assert set(result.keys()) == {"type", "did", "n", "rc", "cc", "sc"}

    def test_keyword_only_enforcement(self):
        try:
            dataset_loaded("ds", "n", 0, 0, [])  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# dataset_error
# ---------------------------------------------------------------------------
class TestDatasetError:
    def test_returns_compressed_format(self):
        result = dataset_error(dataset_id="ds-1", error="File not found")
        assert result == {"type": "de", "did": "ds-1", "e": "File not found"}

    def test_only_expected_keys(self):
        result = dataset_error(dataset_id="x", error="e")
        assert set(result.keys()) == {"type", "did", "e"}

    def test_keyword_only_enforcement(self):
        try:
            dataset_error("ds", "e")  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# query_status
# ---------------------------------------------------------------------------
class TestQueryStatus:
    def test_returns_compressed_format(self):
        result = query_status(phase="executing")
        assert result == {"type": "qs", "p": "executing"}

    def test_various_phases(self):
        for phase in ("parsing", "executing", "formatting", "done"):
            result = query_status(phase=phase)
            assert result["p"] == phase

    def test_only_expected_keys(self):
        result = query_status(phase="x")
        assert set(result.keys()) == {"type", "p"}

    def test_keyword_only_enforcement(self):
        try:
            query_status("parsing")  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# rate_limit_warning
# ---------------------------------------------------------------------------
class TestRateLimitWarning:
    def test_returns_compressed_format(self):
        result = rate_limit_warning(usage_percent=85.5, remaining_tokens=1500)
        assert result == {"type": "rlw", "up": 85.5, "rt": 1500}

    def test_zero_remaining(self):
        result = rate_limit_warning(usage_percent=100.0, remaining_tokens=0)
        assert result["up"] == 100.0
        assert result["rt"] == 0

    def test_float_precision(self):
        result = rate_limit_warning(usage_percent=33.333, remaining_tokens=999)
        assert result["up"] == 33.333

    def test_only_expected_keys(self):
        result = rate_limit_warning(usage_percent=0.0, remaining_tokens=0)
        assert set(result.keys()) == {"type", "up", "rt"}

    def test_keyword_only_enforcement(self):
        try:
            rate_limit_warning(85.5, 1500)  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# rate_limit_exceeded
# ---------------------------------------------------------------------------
class TestRateLimitExceeded:
    def test_returns_compressed_format(self):
        result = rate_limit_exceeded(resets_in_seconds=60)
        assert result == {"type": "rle", "rs": 60}

    def test_zero_seconds(self):
        result = rate_limit_exceeded(resets_in_seconds=0)
        assert result["rs"] == 0

    def test_only_expected_keys(self):
        result = rate_limit_exceeded(resets_in_seconds=1)
        assert set(result.keys()) == {"type", "rs"}

    def test_keyword_only_enforcement(self):
        try:
            rate_limit_exceeded(60)  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# reasoning_token
# ---------------------------------------------------------------------------
class TestReasoningToken:
    def test_returns_compressed_format(self):
        result = reasoning_token(token="thinking...")
        assert result == {"type": "rt", "t": "thinking..."}

    def test_empty_token(self):
        result = reasoning_token(token="")
        assert result == {"type": "rt", "t": ""}

    def test_only_expected_keys(self):
        result = reasoning_token(token="x")
        assert set(result.keys()) == {"type", "t"}

    def test_keyword_only_enforcement(self):
        try:
            reasoning_token("tok")  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# reasoning_complete
# ---------------------------------------------------------------------------
class TestReasoningComplete:
    def test_returns_compressed_format(self):
        result = reasoning_complete()
        assert result == {"type": "rc"}

    def test_only_type_key(self):
        result = reasoning_complete()
        assert set(result.keys()) == {"type"}

    def test_returns_new_dict_each_call(self):
        """Each call should return a fresh dict, not a shared mutable."""
        a = reasoning_complete()
        b = reasoning_complete()
        assert a == b
        assert a is not b


# ---------------------------------------------------------------------------
# tool_call_start
# ---------------------------------------------------------------------------
class TestToolCallStart:
    def test_returns_compressed_format(self):
        result = tool_call_start(tool="run_sql", args={"query": "SELECT 1"})
        assert result == {
            "type": "tcs",
            "tl": "run_sql",
            "a": {"query": "SELECT 1"},
        }

    def test_empty_args(self):
        result = tool_call_start(tool="some_tool", args={})
        assert result["a"] == {}

    def test_nested_args(self):
        nested = {"a": {"b": [1, 2, {"c": 3}]}}
        result = tool_call_start(tool="t", args=nested)
        assert result["a"] == nested

    def test_only_expected_keys(self):
        result = tool_call_start(tool="t", args={})
        assert set(result.keys()) == {"type", "tl", "a"}

    def test_keyword_only_enforcement(self):
        try:
            tool_call_start("tool", {})  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# conversation_title_updated
# ---------------------------------------------------------------------------
class TestConversationTitleUpdated:
    def test_returns_compressed_format(self):
        result = conversation_title_updated()
        assert result == {"type": "ctu"}

    def test_only_type_key(self):
        result = conversation_title_updated()
        assert set(result.keys()) == {"type"}

    def test_returns_new_dict_each_call(self):
        a = conversation_title_updated()
        b = conversation_title_updated()
        assert a == b
        assert a is not b


# ---------------------------------------------------------------------------
# usage_update
# ---------------------------------------------------------------------------
class TestUsageUpdate:
    def test_returns_compressed_format(self):
        result = usage_update()
        assert result == {"type": "uu"}

    def test_only_type_key(self):
        result = usage_update()
        assert set(result.keys()) == {"type"}

    def test_returns_new_dict_each_call(self):
        a = usage_update()
        b = usage_update()
        assert a == b
        assert a is not b


# ---------------------------------------------------------------------------
# query_progress
# ---------------------------------------------------------------------------
class TestQueryProgress:
    def test_returns_compressed_format(self):
        result = query_progress(query_number=3)
        assert result == {"type": "qp", "n": 3}

    def test_first_query(self):
        result = query_progress(query_number=1)
        assert result["n"] == 1

    def test_zero_query_number(self):
        result = query_progress(query_number=0)
        assert result["n"] == 0

    def test_only_expected_keys(self):
        result = query_progress(query_number=1)
        assert set(result.keys()) == {"type", "n"}

    def test_keyword_only_enforcement(self):
        try:
            query_progress(5)  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# chart_spec
# ---------------------------------------------------------------------------
class TestChartSpec:
    def test_returns_compressed_format(self):
        spec = {"type": "bar", "x": "category", "y": "value"}
        result = chart_spec(execution_index=0, spec=spec)
        assert result == {
            "type": "cs",
            "ei": 0,
            "sp": {"type": "bar", "x": "category", "y": "value"},
        }

    def test_empty_spec(self):
        result = chart_spec(execution_index=0, spec={})
        assert result["sp"] == {}

    def test_complex_spec(self):
        spec = {
            "type": "line",
            "data": [1, 2, 3],
            "options": {"legend": True, "title": "Test"},
        }
        result = chart_spec(execution_index=2, spec=spec)
        assert result["sp"] == spec
        assert result["ei"] == 2

    def test_only_expected_keys(self):
        result = chart_spec(execution_index=0, spec={})
        assert set(result.keys()) == {"type", "ei", "sp"}

    def test_keyword_only_enforcement(self):
        try:
            chart_spec(0, {})  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# followup_suggestions
# ---------------------------------------------------------------------------
class TestFollowupSuggestions:
    def test_returns_compressed_format(self):
        suggestions = ["What is the total?", "Show me a chart"]
        result = followup_suggestions(suggestions=suggestions)
        assert result == {
            "type": "fs",
            "sg": ["What is the total?", "Show me a chart"],
        }

    def test_empty_suggestions(self):
        result = followup_suggestions(suggestions=[])
        assert result["sg"] == []

    def test_single_suggestion(self):
        result = followup_suggestions(suggestions=["Tell me more"])
        assert result["sg"] == ["Tell me more"]

    def test_only_expected_keys(self):
        result = followup_suggestions(suggestions=[])
        assert set(result.keys()) == {"type", "sg"}

    def test_keyword_only_enforcement(self):
        try:
            followup_suggestions(["a"])  # type: ignore[misc]
            assert False, "Should have raised TypeError"
        except TypeError:
            pass


# ---------------------------------------------------------------------------
# Cross-cutting: every function returns a plain dict
# ---------------------------------------------------------------------------
class TestAllReturnPlainDicts:
    """Ensure every factory returns a plain ``dict`` (not a subclass)."""

    def test_all_return_type_is_dict(self):
        results = [
            chat_token(token="t", message_id="m"),
            chat_complete(message_id="m", sql_query=None, token_count=0),
            chat_error(error="e", details=None),
            dataset_loading(dataset_id="d", url="u"),
            dataset_loaded(
                dataset_id="d", name="n", row_count=0, column_count=0, schema=[]
            ),
            dataset_error(dataset_id="d", error="e"),
            query_status(phase="p"),
            rate_limit_warning(usage_percent=0.0, remaining_tokens=0),
            rate_limit_exceeded(resets_in_seconds=0),
            reasoning_token(token="t"),
            reasoning_complete(),
            tool_call_start(tool="t", args={}),
            conversation_title_updated(),
            usage_update(),
            query_progress(query_number=0),
            chart_spec(execution_index=0, spec={}),
            followup_suggestions(suggestions=[]),
        ]
        for r in results:
            assert type(r) is dict


# ---------------------------------------------------------------------------
# Cross-cutting: every function's type field is a non-empty string
# ---------------------------------------------------------------------------
class TestAllHaveTypeField:
    """Every message must have a ``type`` key with a non-empty string value."""

    def test_type_field_present_and_non_empty(self):
        results = [
            chat_token(token="t", message_id="m"),
            chat_complete(message_id="m", sql_query=None, token_count=0),
            chat_error(error="e", details=None),
            dataset_loading(dataset_id="d", url="u"),
            dataset_loaded(
                dataset_id="d", name="n", row_count=0, column_count=0, schema=[]
            ),
            dataset_error(dataset_id="d", error="e"),
            query_status(phase="p"),
            rate_limit_warning(usage_percent=0.0, remaining_tokens=0),
            rate_limit_exceeded(resets_in_seconds=0),
            reasoning_token(token="t"),
            reasoning_complete(),
            tool_call_start(tool="t", args={}),
            conversation_title_updated(),
            usage_update(),
            query_progress(query_number=0),
            chart_spec(execution_index=0, spec={}),
            followup_suggestions(suggestions=[]),
        ]
        for r in results:
            assert "type" in r
            assert isinstance(r["type"], str)
            assert len(r["type"]) > 0


# ---------------------------------------------------------------------------
# Cross-cutting: unique type discriminators
# ---------------------------------------------------------------------------
class TestUniqueTypeDiscriminators:
    """All 17 message types must have unique ``type`` values."""

    def test_no_duplicate_type_values(self):
        type_values = [
            chat_token(token="t", message_id="m")["type"],
            chat_complete(message_id="m", sql_query=None, token_count=0)["type"],
            chat_error(error="e", details=None)["type"],
            dataset_loading(dataset_id="d", url="u")["type"],
            dataset_loaded(
                dataset_id="d", name="n", row_count=0, column_count=0, schema=[]
            )["type"],
            dataset_error(dataset_id="d", error="e")["type"],
            query_status(phase="p")["type"],
            rate_limit_warning(usage_percent=0.0, remaining_tokens=0)["type"],
            rate_limit_exceeded(resets_in_seconds=0)["type"],
            reasoning_token(token="t")["type"],
            reasoning_complete()["type"],
            tool_call_start(tool="t", args={})["type"],
            conversation_title_updated()["type"],
            usage_update()["type"],
            query_progress(query_number=0)["type"],
            chart_spec(execution_index=0, spec={})["type"],
            followup_suggestions(suggestions=[])["type"],
        ]
        assert len(type_values) == 17
        assert len(set(type_values)) == 17
