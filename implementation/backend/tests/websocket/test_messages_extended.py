"""Extended tests for WebSocket message factory functions.

Covers the three factory functions NOT tested in test_messages.py:
- query_progress
- chart_spec
- followup_suggestions

Also tests optional arguments of chat_complete that are not exercised
in the base test file (sql_executions, reasoning, tool_call_trace).

Each test verifies:
- The returned dict has the correct ``type`` field
- All required fields are present with expected values
- No unexpected fields are included
- Edge cases (empty inputs, large values, complex data)
"""

from __future__ import annotations

import pytest

from app.services.ws_messages import (
    chart_spec,
    chat_complete,
    followup_suggestions,
    query_progress,
)


# ---- query_progress ----

class TestQueryProgress:
    """Verify ``query_progress`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = query_progress(query_number=1)
        assert result["type"] == "qp"

    def test_includes_query_number(self):
        result = query_progress(query_number=3)
        assert result["n"] == 3

    def test_exact_keys(self):
        result = query_progress(query_number=1)
        assert set(result.keys()) == {"type", "n"}

    def test_query_number_zero(self):
        result = query_progress(query_number=0)
        assert result["n"] == 0

    def test_large_query_number(self):
        result = query_progress(query_number=999999)
        assert result["n"] == 999999

    def test_negative_query_number(self):
        """Factory does not validate; negative values pass through."""
        result = query_progress(query_number=-1)
        assert result["n"] == -1
        assert result["type"] == "qp"


# ---- chart_spec ----

class TestChartSpec:
    """Verify ``chart_spec`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = chart_spec(execution_index=0, spec={"type": "bar"})
        assert result["type"] == "cs"

    def test_includes_execution_index(self):
        result = chart_spec(execution_index=5, spec={})
        assert result["ei"] == 5

    def test_includes_spec(self):
        spec_data = {"type": "bar", "x": "date", "y": "value"}
        result = chart_spec(execution_index=0, spec=spec_data)
        assert result["sp"] == spec_data

    def test_exact_keys(self):
        result = chart_spec(execution_index=0, spec={})
        assert set(result.keys()) == {"type", "ei", "sp"}

    def test_empty_spec_dict(self):
        result = chart_spec(execution_index=0, spec={})
        assert result["sp"] == {}

    def test_complex_nested_spec(self):
        """Complex Vega-Lite-style spec with nested structures."""
        nested_spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "mark": {"type": "bar", "tooltip": True},
            "encoding": {
                "x": {"field": "category", "type": "nominal", "sort": "-y"},
                "y": {"field": "amount", "type": "quantitative", "aggregate": "sum"},
                "color": {
                    "field": "region",
                    "type": "nominal",
                    "scale": {"scheme": "category10"},
                },
            },
            "data": {"values": [{"category": "A", "amount": 10, "region": "North"}]},
            "config": {"view": {"stroke": None}},
        }
        result = chart_spec(execution_index=2, spec=nested_spec)
        assert result["sp"] == nested_spec
        assert result["sp"]["encoding"]["color"]["scale"]["scheme"] == "category10"

    def test_spec_with_list_values(self):
        spec_data = {"layers": [{"mark": "line"}, {"mark": "point"}]}
        result = chart_spec(execution_index=1, spec=spec_data)
        assert len(result["sp"]["layers"]) == 2

    def test_large_execution_index(self):
        result = chart_spec(execution_index=10000, spec={"type": "scatter"})
        assert result["ei"] == 10000


# ---- followup_suggestions ----

class TestFollowupSuggestions:
    """Verify ``followup_suggestions`` returns correct shape (compressed format)."""

    def test_returns_dict_with_type(self):
        result = followup_suggestions(suggestions=["What else?"])
        assert result["type"] == "fs"

    def test_includes_suggestions(self):
        suggestions_list = ["Show top 10", "Group by category"]
        result = followup_suggestions(suggestions=suggestions_list)
        assert result["sg"] == suggestions_list

    def test_exact_keys(self):
        result = followup_suggestions(suggestions=["a"])
        assert set(result.keys()) == {"type", "sg"}

    def test_empty_suggestions_list(self):
        result = followup_suggestions(suggestions=[])
        assert result["sg"] == []
        assert result["type"] == "fs"

    def test_single_suggestion(self):
        result = followup_suggestions(suggestions=["Tell me more"])
        assert result["sg"] == ["Tell me more"]
        assert len(result["sg"]) == 1

    def test_many_suggestions(self):
        many = [f"Suggestion {i}" for i in range(20)]
        result = followup_suggestions(suggestions=many)
        assert len(result["sg"]) == 20
        assert result["sg"][0] == "Suggestion 0"
        assert result["sg"][19] == "Suggestion 19"

    def test_suggestions_with_special_characters(self):
        suggestions_list = [
            "What's the average?",
            'Show "quoted" values',
            "Filter WHERE col > 100",
            "Use strftime('%Y', date)",
        ]
        result = followup_suggestions(suggestions=suggestions_list)
        assert result["sg"] == suggestions_list

    def test_suggestions_preserves_order(self):
        ordered = ["first", "second", "third"]
        result = followup_suggestions(suggestions=ordered)
        assert result["sg"] == ordered

    def test_suggestions_with_empty_strings(self):
        result = followup_suggestions(suggestions=["", "valid", ""])
        assert result["sg"] == ["", "valid", ""]


# ---- chat_complete with optional arguments ----

class TestChatCompleteOptionalArgs:
    """Test optional args of ``chat_complete`` not covered in test_messages.py.

    The base test file only tests message_id, sql_query, and token_count.
    These tests exercise sql_executions, reasoning, and tool_call_trace.
    """

    def test_sql_executions_included(self):
        executions = [
            {"sql": "SELECT COUNT(*) FROM t", "rows": [[42]], "columns": ["count"]},
        ]
        result = chat_complete(
            message_id="m1",
            sql_query="SELECT COUNT(*) FROM t",
            token_count=50,
            sql_executions=executions,
        )
        assert result["se"] == executions

    def test_sql_executions_none_defaults_to_empty_list(self):
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            sql_executions=None,
        )
        assert result["se"] == []

    def test_sql_executions_empty_list(self):
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            sql_executions=[],
        )
        assert result["se"] == []

    def test_sql_executions_multiple(self):
        executions = [
            {"sql": "SELECT 1", "rows": [[1]], "columns": ["1"]},
            {"sql": "SELECT 2", "rows": [[2]], "columns": ["2"]},
            {"sql": "SELECT 3", "rows": [[3]], "columns": ["3"]},
        ]
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=100,
            sql_executions=executions,
        )
        assert len(result["se"]) == 3

    def test_reasoning_included(self):
        result = chat_complete(
            message_id="m1",
            sql_query="SELECT 1",
            token_count=20,
            reasoning="I need to count the rows first",
        )
        assert result["r"] == "I need to count the rows first"

    def test_reasoning_none_omitted(self):
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            reasoning=None,
        )
        assert "r" not in result

    def test_reasoning_empty_string_omitted(self):
        """Empty string is falsy, so reasoning should be omitted."""
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            reasoning="",
        )
        assert "r" not in result

    def test_tool_call_trace_included(self):
        trace = [
            {"tool": "execute_sql", "args": {"query": "SELECT 1"}, "result": "ok"},
        ]
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=30,
            tool_call_trace=trace,
        )
        assert result["tct"] == trace

    def test_tool_call_trace_none_omitted(self):
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            tool_call_trace=None,
        )
        assert "tct" not in result

    def test_tool_call_trace_empty_list_omitted(self):
        """Empty list is falsy, so tool_call_trace should be omitted."""
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            tool_call_trace=[],
        )
        assert "tct" not in result

    def test_all_optional_args_present(self):
        """All optional fields present -- verify complete key set."""
        executions = [{"sql": "SELECT 1", "rows": [[1]], "columns": ["1"]}]
        trace = [{"tool": "execute_sql", "args": {}, "result": "ok"}]
        result = chat_complete(
            message_id="m-full",
            sql_query="SELECT * FROM t",
            token_count=200,
            sql_executions=executions,
            reasoning="Think step by step",
            input_tokens=150,
            output_tokens=50,
            tool_call_trace=trace,
        )
        assert set(result.keys()) == {
            "type", "mid", "sq", "tc", "se", "r", "it", "ot", "tct",
        }
        assert result["type"] == "cc"
        assert result["mid"] == "m-full"
        assert result["sq"] == "SELECT * FROM t"
        assert result["tc"] == 200
        assert result["se"] == executions
        assert result["r"] == "Think step by step"
        assert result["it"] == 150
        assert result["ot"] == 50
        assert result["tct"] == trace

    def test_input_output_tokens_defaults(self):
        """input_tokens and output_tokens default to 0."""
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
        )
        assert result["it"] == 0
        assert result["ot"] == 0

    def test_input_output_tokens_custom_values(self):
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=100,
            input_tokens=75,
            output_tokens=25,
        )
        assert result["it"] == 75
        assert result["ot"] == 25

    def test_only_reasoning_and_no_sql(self):
        """Reasoning present but no sql_query or tool_call_trace."""
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            reasoning="The user wants a chart",
        )
        assert "r" in result
        assert "sq" not in result
        assert "tct" not in result

    def test_only_tool_call_trace_and_no_sql(self):
        """Tool call trace present but no sql_query or reasoning."""
        trace = [{"tool": "execute_sql", "args": {"query": "SELECT 1"}}]
        result = chat_complete(
            message_id="m1",
            sql_query=None,
            token_count=10,
            tool_call_trace=trace,
        )
        assert "tct" in result
        assert "sq" not in result
        assert "r" not in result
