"""Tests for LLM service helper functions.

Covers:
- ``_has_sql_results``: checks if a message dict contains SQL query results
- ``_extract_available_columns``: extracts column names from dataset dicts
- ``_messages_to_contents``: converts message dicts to Gemini Content objects
"""

from __future__ import annotations

import json

import pytest
from google.genai import types

from app.services.llm_service import (
    _extract_available_columns,
    _has_sql_results,
    _messages_to_contents,
)


# ---------------------------------------------------------------------------
# _has_sql_results
# ---------------------------------------------------------------------------


class TestHasSqlResults:
    """Tests for _has_sql_results(msg: dict) -> bool."""

    # -- True cases --

    def test_assistant_with_sql_query(self):
        msg = {"role": "assistant", "content": "Here are the results.", "sql_query": "SELECT * FROM t"}
        assert _has_sql_results(msg) is True

    def test_assistant_with_multiline_sql(self):
        msg = {
            "role": "assistant",
            "content": "Done.",
            "sql_query": "SELECT a,\n  b\nFROM t\nWHERE x > 1",
        }
        assert _has_sql_results(msg) is True

    def test_assistant_with_sql_query_surrounded_by_whitespace(self):
        msg = {"role": "assistant", "content": "", "sql_query": "  SELECT 1  "}
        assert _has_sql_results(msg) is True

    # -- False cases: wrong role --

    def test_user_message_returns_false(self):
        msg = {"role": "user", "content": "run a query", "sql_query": "SELECT 1"}
        assert _has_sql_results(msg) is False

    def test_system_message_returns_false(self):
        msg = {"role": "system", "content": "sys", "sql_query": "SELECT 1"}
        assert _has_sql_results(msg) is False

    # -- False cases: missing/empty sql_query --

    def test_no_sql_query_key(self):
        msg = {"role": "assistant", "content": "Hello."}
        assert _has_sql_results(msg) is False

    def test_sql_query_is_none(self):
        msg = {"role": "assistant", "content": "", "sql_query": None}
        assert _has_sql_results(msg) is False

    def test_sql_query_is_empty_string(self):
        msg = {"role": "assistant", "content": "", "sql_query": ""}
        assert _has_sql_results(msg) is False

    def test_sql_query_is_whitespace_only(self):
        msg = {"role": "assistant", "content": "", "sql_query": "   "}
        assert _has_sql_results(msg) is False

    def test_sql_query_is_null_string(self):
        """The string literal 'null' is treated as no SQL (special case in code)."""
        msg = {"role": "assistant", "content": "", "sql_query": "null"}
        assert _has_sql_results(msg) is False

    def test_sql_query_is_null_string_with_whitespace(self):
        msg = {"role": "assistant", "content": "", "sql_query": "  null  "}
        assert _has_sql_results(msg) is False

    # -- Edge cases --

    def test_empty_dict(self):
        assert _has_sql_results({}) is False

    def test_role_missing(self):
        msg = {"content": "text", "sql_query": "SELECT 1"}
        assert _has_sql_results(msg) is False


# ---------------------------------------------------------------------------
# _extract_available_columns
# ---------------------------------------------------------------------------


class TestExtractAvailableColumns:
    """Tests for _extract_available_columns(datasets: list[dict]) -> list[str]."""

    # -- Normal cases --

    def test_single_dataset_json_string(self):
        datasets = [
            {
                "schema_json": json.dumps([
                    {"name": "id", "type": "Int64"},
                    {"name": "city", "type": "Utf8"},
                ]),
            },
        ]
        cols = _extract_available_columns(datasets)
        assert cols == ["id", "city"]

    def test_multiple_datasets(self):
        datasets = [
            {"schema_json": json.dumps([{"name": "a", "type": "Int64"}])},
            {"schema_json": json.dumps([{"name": "b", "type": "Utf8"}, {"name": "c", "type": "Float64"}])},
        ]
        cols = _extract_available_columns(datasets)
        assert cols == ["a", "b", "c"]

    def test_schema_as_list_not_string(self):
        """schema_json can be a pre-parsed list (not a JSON string)."""
        datasets = [
            {
                "schema_json": [
                    {"name": "x", "type": "Int64"},
                    {"name": "y", "type": "Float64"},
                ],
            },
        ]
        cols = _extract_available_columns(datasets)
        assert cols == ["x", "y"]

    def test_duplicate_column_names_across_datasets(self):
        """Column names are NOT deduplicated; duplicates appear as-is."""
        datasets = [
            {"schema_json": json.dumps([{"name": "id", "type": "Int64"}])},
            {"schema_json": json.dumps([{"name": "id", "type": "Int64"}])},
        ]
        cols = _extract_available_columns(datasets)
        assert cols == ["id", "id"]

    # -- Edge cases --

    def test_empty_datasets_list(self):
        assert _extract_available_columns([]) == []

    def test_dataset_with_no_schema_json_key(self):
        """Falls back to '[]' default when schema_json is missing."""
        datasets = [{"name": "table1"}]
        assert _extract_available_columns(datasets) == []

    def test_dataset_with_empty_schema(self):
        datasets = [{"schema_json": "[]"}]
        assert _extract_available_columns(datasets) == []

    def test_dataset_with_none_schema(self):
        """schema_json=None triggers the `schema_raw or []` fallback."""
        datasets = [{"schema_json": None}]
        assert _extract_available_columns(datasets) == []

    def test_dataset_with_invalid_json_string(self):
        """Invalid JSON is gracefully skipped (no crash)."""
        datasets = [{"schema_json": "not-json!!!"}]
        assert _extract_available_columns(datasets) == []

    def test_column_dict_missing_name_key(self):
        """Column entries without a 'name' key are skipped."""
        datasets = [{"schema_json": json.dumps([{"type": "Int64"}])}]
        assert _extract_available_columns(datasets) == []

    def test_column_entry_is_not_a_dict(self):
        """Non-dict column entries (e.g. a bare string) are skipped."""
        datasets = [{"schema_json": json.dumps(["not_a_dict", 42])}]
        assert _extract_available_columns(datasets) == []

    def test_mixed_valid_and_invalid_datasets(self):
        """Valid datasets succeed even if others have broken schema."""
        datasets = [
            {"schema_json": "INVALID"},
            {"schema_json": json.dumps([{"name": "good", "type": "Utf8"}])},
        ]
        cols = _extract_available_columns(datasets)
        assert cols == ["good"]

    def test_column_with_empty_string_name_is_skipped(self):
        """An empty-string column name is falsy, so it should be skipped."""
        datasets = [{"schema_json": json.dumps([{"name": "", "type": "Int64"}])}]
        assert _extract_available_columns(datasets) == []

    def test_column_with_none_name_is_skipped(self):
        datasets = [{"schema_json": json.dumps([{"name": None, "type": "Int64"}])}]
        assert _extract_available_columns(datasets) == []


# ---------------------------------------------------------------------------
# _messages_to_contents
# ---------------------------------------------------------------------------


class TestMessagesToContents:
    """Tests for _messages_to_contents(messages: list[dict]) -> list[types.Content]."""

    # -- Normal cases --

    def test_single_user_message(self):
        messages = [{"role": "user", "content": "Hello"}]
        contents = _messages_to_contents(messages)
        assert len(contents) == 1
        assert contents[0].role == "user"
        assert contents[0].parts[0].text == "Hello"

    def test_single_assistant_message_becomes_model_role(self):
        messages = [{"role": "assistant", "content": "Hi there"}]
        contents = _messages_to_contents(messages)
        assert len(contents) == 1
        assert contents[0].role == "model"
        assert contents[0].parts[0].text == "Hi there"

    def test_user_assistant_conversation(self):
        messages = [
            {"role": "user", "content": "What is 2+2?"},
            {"role": "assistant", "content": "4"},
            {"role": "user", "content": "Thanks"},
        ]
        contents = _messages_to_contents(messages)
        assert len(contents) == 3
        assert contents[0].role == "user"
        assert contents[1].role == "model"
        assert contents[2].role == "user"
        assert contents[0].parts[0].text == "What is 2+2?"
        assert contents[1].parts[0].text == "4"
        assert contents[2].parts[0].text == "Thanks"

    def test_system_messages_are_skipped(self):
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello"},
        ]
        contents = _messages_to_contents(messages)
        assert len(contents) == 1
        assert contents[0].role == "user"

    def test_multiple_system_messages_all_skipped(self):
        messages = [
            {"role": "system", "content": "System 1"},
            {"role": "system", "content": "System 2"},
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello"},
        ]
        contents = _messages_to_contents(messages)
        assert len(contents) == 2

    # -- Return type validation --

    def test_returns_list_of_content_objects(self):
        messages = [{"role": "user", "content": "test"}]
        contents = _messages_to_contents(messages)
        assert isinstance(contents, list)
        assert isinstance(contents[0], types.Content)

    def test_parts_contain_part_objects(self):
        messages = [{"role": "user", "content": "test"}]
        contents = _messages_to_contents(messages)
        assert isinstance(contents[0].parts[0], types.Part)

    # -- Edge cases --

    def test_empty_messages_list(self):
        assert _messages_to_contents([]) == []

    def test_empty_content_string(self):
        messages = [{"role": "user", "content": ""}]
        contents = _messages_to_contents(messages)
        assert len(contents) == 1
        assert contents[0].parts[0].text == ""

    def test_long_content_preserved(self):
        long_text = "x" * 10_000
        messages = [{"role": "user", "content": long_text}]
        contents = _messages_to_contents(messages)
        assert contents[0].parts[0].text == long_text

    def test_content_with_special_characters(self):
        special = "SELECT * FROM t WHERE name LIKE '%O\\'Brien%' AND val > 0"
        messages = [{"role": "user", "content": special}]
        contents = _messages_to_contents(messages)
        assert contents[0].parts[0].text == special

    def test_content_with_unicode(self):
        msg = {"role": "user", "content": "Datos de ventas: \u00bf cu\u00e1ntos registros?"}
        contents = _messages_to_contents([msg])
        assert contents[0].parts[0].text == msg["content"]

    def test_only_system_messages_returns_empty(self):
        messages = [
            {"role": "system", "content": "sys1"},
            {"role": "system", "content": "sys2"},
        ]
        contents = _messages_to_contents(messages)
        assert contents == []

    def test_ordering_preserved(self):
        """Output order matches input order (excluding system messages)."""
        messages = [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "second"},
            {"role": "user", "content": "third"},
        ]
        contents = _messages_to_contents(messages)
        texts = [c.parts[0].text for c in contents]
        assert texts == ["first", "second", "third"]

    def test_each_content_has_exactly_one_part(self):
        """Each message produces a Content with exactly one Part."""
        messages = [
            {"role": "user", "content": "a"},
            {"role": "assistant", "content": "b"},
        ]
        contents = _messages_to_contents(messages)
        for c in contents:
            assert len(c.parts) == 1
