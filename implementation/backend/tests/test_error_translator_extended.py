"""Extended tests for the Polars SQL error translator.

Complements test_error_translator.py with coverage of:
- Edge cases: empty input, None-like input, very long messages
- Pattern priority: which pattern wins when multiple could match
- Untested branches within patterns (e.g., pattern 7 regex vs class name)
- Pattern 18 operator precedence edge case
- Unicode and special characters in error messages
- Return format consistency
"""

from __future__ import annotations

import pytest

from app.workers.error_translator import translate_polars_error, _match_error_pattern


# ---------------------------------------------------------------------------
# Edge cases: empty / degenerate input
# ---------------------------------------------------------------------------


class TestEmptyAndDegenerate:
    """Handle empty, whitespace-only, and unusual input."""

    def test_empty_string_returns_as_is(self):
        assert translate_polars_error("") == ""

    def test_empty_string_with_columns(self):
        """Empty message with available_columns still returns empty."""
        assert translate_polars_error("", available_columns=["a", "b"]) == ""

    def test_whitespace_only_gets_generic(self):
        """Whitespace-only is truthy, so it should get the generic fallback."""
        result = translate_polars_error("   ")
        assert "The query encountered an error" in result
        assert "Technical details:    " in result

    def test_single_character_gets_generic(self):
        result = translate_polars_error("x")
        assert "The query encountered an error" in result

    def test_none_available_columns_default(self):
        """available_columns=None should not cause errors."""
        raw = 'Column "foo" not found'
        result = translate_polars_error(raw, available_columns=None)
        assert "Column 'foo' doesn't exist" in result
        assert "Available columns" not in result


# ---------------------------------------------------------------------------
# Very long error messages
# ---------------------------------------------------------------------------


class TestLongErrorMessages:
    """Ensure long messages are handled without truncation or crash."""

    def test_long_error_preserves_technical_details(self):
        """The raw message is always appended as-is, even when very long."""
        raw = "syntax error " + "x" * 5000
        result = translate_polars_error(raw)
        assert f"Technical details: {raw}" in result

    def test_long_column_name(self):
        col_name = "a" * 500
        raw = f'Column "{col_name}" not found'
        result = translate_polars_error(raw)
        assert f"Column '{col_name}' doesn't exist" in result

    def test_many_available_columns(self):
        columns = [f"col_{i}" for i in range(200)]
        raw = 'Column "missing" not found'
        result = translate_polars_error(raw, available_columns=columns)
        assert "col_0" in result
        assert "col_199" in result

    def test_long_error_still_matches_pattern(self):
        """A pattern keyword buried in a long message still matches."""
        prefix = "Some context: " + "z" * 2000 + " "
        raw = prefix + "ILIKE is not supported"
        result = translate_polars_error(raw)
        assert "doesn't support ILIKE" in result


# ---------------------------------------------------------------------------
# Pattern priority: overlapping matches
# ---------------------------------------------------------------------------


class TestPatternPriority:
    """Verify that earlier patterns take priority over later ones."""

    def test_column_not_found_before_function_not_found(self):
        """Pattern 1 (column not found) should beat pattern 7/12 (function not found)."""
        raw = 'Column "function" not found in table'
        result = translate_polars_error(raw)
        assert "doesn't exist" in result
        # Should NOT trigger the function pattern
        assert "Function not supported" not in result

    def test_ilike_before_like_type_error(self):
        """Pattern 2 (ilike) should beat pattern 20 (like type error).

        A message with both 'ilike' and 'cannot apply' should hit pattern 2 first.
        """
        raw = "cannot apply ILIKE operator"
        result = translate_polars_error(raw)
        assert "doesn't support ILIKE" in result
        assert "LIKE can only be used with text" not in result

    def test_type_mismatch_before_join_error(self):
        """Pattern 3 (type mismatch) before pattern 17 (join).

        Message with 'cannot compare' and 'join' + 'column' keywords.
        """
        raw = "cannot compare join column types"
        result = translate_polars_error(raw)
        assert "Type mismatch error" in result

    def test_syntax_error_before_window_function(self):
        """Pattern 5 (syntax) should beat pattern 23 (window function).

        A syntax error mentioning 'window' and 'over' should still hit pattern 5.
        """
        raw = "SQL parser error: unexpected token near window OVER"
        result = translate_polars_error(raw)
        assert "SQL syntax error" in result

    def test_function_not_found_pattern7_vs_pattern12(self):
        """Pattern 7 (function not found via regex) should fire before
        pattern 12 (unknown function) since it appears first in the code.

        Both patterns match 'function ... not found'.
        """
        raw = "function 'DATE_TRUNC' not found in registry"
        result = translate_polars_error(raw)
        # Pattern 7 fires first
        assert "Function not supported in Polars SQL" in result

    def test_interval_before_strftime(self):
        """Pattern 9 (interval) before pattern 24 (strftime/date format).

        A message with both 'interval' and 'date format' should hit pattern 9.
        """
        raw = "interval date format not supported"
        result = translate_polars_error(raw)
        assert "doesn't support INTERVAL" in result

    def test_overflow_before_union(self):
        """Pattern 11 (overflow) before pattern 27 (union).

        A message with 'overflow' and 'union'+'column' should hit pattern 11.
        """
        raw = "overflow in union column computation"
        result = translate_polars_error(raw)
        assert "Numeric overflow" in result

    def test_division_by_zero_before_timeout(self):
        """Pattern 6 (division by zero) before pattern 16 (timeout/resource)."""
        raw = "divide by zero: resource exhausted"
        result = translate_polars_error(raw)
        assert "Division by zero" in result


# ---------------------------------------------------------------------------
# Pattern 7: function not found (regex branch)
# ---------------------------------------------------------------------------


class TestFunctionNotFoundRegex:
    """Test the regex branch of pattern 7 that the base tests don't exercise.

    The base tests only test the 'invalidoperationerror' branch.
    """

    def test_function_regex_match(self):
        raw = "function 'MY_FUNC' not found"
        result = translate_polars_error(raw)
        assert "Function not supported in Polars SQL" in result

    def test_function_regex_with_spacing(self):
        raw = "function    CUSTOM_AGG    not found in context"
        result = translate_polars_error(raw)
        assert "Function not supported" in result


# ---------------------------------------------------------------------------
# Pattern 18: GROUP BY position — operator precedence edge case
# ---------------------------------------------------------------------------


class TestGroupByPositionEdgeCases:
    """Pattern 18 has a subtle operator precedence issue.

    The condition is:
        re.search(r"group\\s+by\\s+position...", msg_lower) or \\
        "group by column" in msg_lower and "out of range" in msg_lower

    Due to Python precedence, the 'and' binds tighter than 'or', so
    the second branch is: ("group by column" in msg_lower AND "out of range" in msg_lower).
    """

    def test_group_by_position_regex(self):
        raw = "GROUP BY position 3 is not in select list"
        result = translate_polars_error(raw)
        assert "GROUP BY position number is out of range" in result

    def test_group_by_column_out_of_range(self):
        raw = "group by column index out of range"
        result = translate_polars_error(raw)
        assert "GROUP BY position number is out of range" in result

    def test_group_by_column_without_out_of_range(self):
        """Only 'group by column' without 'out of range' should NOT match pattern 18.

        Due to operator precedence, 'and' binds first, so this should
        fall through past pattern 18.
        """
        raw = "group by column error in expression"
        result = translate_polars_error(raw)
        # This message has 'group' but not 'must appear in group by',
        # and doesn't fully match pattern 18. It should fall through.
        # It won't match pattern 8 either (no "must appear in group by").
        # It will likely hit the generic fallback.
        assert "GROUP BY position number is out of range" not in result


# ---------------------------------------------------------------------------
# Return format consistency
# ---------------------------------------------------------------------------


class TestReturnFormat:
    """Verify the consistent 'friendly\\n\\nTechnical details: raw' format."""

    def test_format_has_two_newlines(self):
        raw = "divide by zero"
        result = translate_polars_error(raw)
        assert "\n\n" in result

    def test_technical_details_always_at_end(self):
        raw = "ILIKE is not valid"
        result = translate_polars_error(raw)
        assert result.endswith(f"Technical details: {raw}")

    def test_friendly_message_before_technical(self):
        raw = "syntax error at position 5"
        result = translate_polars_error(raw)
        parts = result.split("\n\nTechnical details: ")
        assert len(parts) == 2
        friendly = parts[0]
        technical = parts[1]
        assert len(friendly) > 0
        assert technical == raw

    def test_empty_returns_no_technical_details(self):
        """Empty string short-circuits, no 'Technical details' appended."""
        result = translate_polars_error("")
        assert "Technical details" not in result


# ---------------------------------------------------------------------------
# _match_error_pattern direct tests
# ---------------------------------------------------------------------------


class TestMatchErrorPatternDirect:
    """Test the internal _match_error_pattern function directly."""

    def test_always_returns_string(self):
        """_match_error_pattern always returns a string, never None."""
        result = _match_error_pattern("totally unknown gibberish 12345")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_generic_fallback_text(self):
        result = _match_error_pattern("xyzzy plugh nothing matches")
        assert "The query encountered an error" in result

    def test_column_not_found_with_columns(self):
        result = _match_error_pattern(
            'Column "age" not found',
            available_columns=["name", "id", "email"],
        )
        assert "Available columns: name, id, email" in result

    def test_column_not_found_without_columns(self):
        result = _match_error_pattern('Column "age" not found')
        assert "doesn't exist" in result
        assert "Available columns" not in result


# ---------------------------------------------------------------------------
# Unicode and special characters
# ---------------------------------------------------------------------------


class TestSpecialCharacters:
    """Error messages with unicode or special characters."""

    def test_unicode_column_name(self):
        raw = 'Column "\u00e9v\u00e9nement" not found'
        result = translate_polars_error(raw)
        assert "Column '\u00e9v\u00e9nement' doesn't exist" in result

    def test_error_with_newlines_in_raw(self):
        raw = "syntax error\nat line 3\ncolumn 5"
        result = translate_polars_error(raw)
        assert "SQL syntax error" in result
        assert f"Technical details: {raw}" in result

    def test_error_with_tabs(self):
        raw = "divide by zero\tin\texpression"
        result = translate_polars_error(raw)
        assert "Division by zero" in result


# ---------------------------------------------------------------------------
# Case sensitivity
# ---------------------------------------------------------------------------


class TestCaseSensitivity:
    """Verify all patterns match case-insensitively."""

    def test_ilike_uppercase(self):
        raw = "ILIKE OPERATOR NOT SUPPORTED"
        result = translate_polars_error(raw)
        assert "doesn't support ILIKE" in result

    def test_ilike_mixed_case(self):
        raw = "ILike is unsupported in this SQL dialect"
        result = translate_polars_error(raw)
        assert "doesn't support ILIKE" in result

    def test_cannot_compare_uppercase(self):
        raw = "CANNOT COMPARE types Int64 and Utf8"
        result = translate_polars_error(raw)
        assert "Type mismatch" in result

    def test_table_not_found_uppercase(self):
        raw = "TABLE 'users' NOT FOUND"
        result = translate_polars_error(raw)
        assert "Table not found" in result

    def test_divide_by_zero_mixed_case(self):
        raw = "Divide By Zero in column computation"
        result = translate_polars_error(raw)
        assert "Division by zero" in result

    def test_distinct_on_uppercase(self):
        raw = "DISTINCT ON (id) is not supported in Polars SQL"
        result = translate_polars_error(raw)
        assert "DISTINCT ON is not supported" in result


# ---------------------------------------------------------------------------
# Column not found: regex vs class-name branch
# ---------------------------------------------------------------------------


class TestColumnNotFoundBranches:
    """Pattern 1 has two entry points: regex match and class name match."""

    def test_regex_extracts_column_name(self):
        raw = 'Column "my_col" not found in dataset'
        result = translate_polars_error(raw)
        assert "Column 'my_col'" in result

    def test_class_name_uses_unknown(self):
        """ColumnNotFoundError without a quoted column name uses 'unknown'."""
        raw = "ColumnNotFoundError: the specified column does not exist"
        result = translate_polars_error(raw)
        assert "Column 'unknown'" in result

    def test_regex_with_available_columns(self):
        raw = 'Column "price" not found'
        result = translate_polars_error(
            raw, available_columns=["cost", "quantity", "total"]
        )
        assert "Column 'price'" in result
        assert "cost, quantity, total" in result

    def test_class_name_with_available_columns(self):
        raw = "ColumnNotFoundError: missing col"
        result = translate_polars_error(
            raw, available_columns=["x", "y"]
        )
        assert "Available columns: x, y" in result

    def test_column_name_with_spaces(self):
        raw = 'Column "first name" not found'
        result = translate_polars_error(raw)
        assert "Column 'first name'" in result

    def test_empty_available_columns_list(self):
        """Empty list is falsy, so no 'Available columns' line should appear."""
        raw = 'Column "id" not found'
        result = translate_polars_error(raw, available_columns=[])
        assert "doesn't exist" in result
        assert "Available columns" not in result


# ---------------------------------------------------------------------------
# Patterns that require multiple keywords
# ---------------------------------------------------------------------------


class TestMultiKeywordPatterns:
    """Patterns requiring multiple keywords should not match on a single keyword."""

    def test_like_without_cannot_apply_or_invalid_type(self):
        """Pattern 20 requires 'like' AND ('cannot apply' OR 'invalid type').
        'like' alone should not match pattern 20."""
        raw = "like operator used successfully"
        result = translate_polars_error(raw)
        # 'like' alone doesn't have 'cannot apply' or 'invalid type'
        # But it might match rlike pattern (13). Let's check.
        # Actually "rlike" is not in "like operator used successfully"
        # and "like" by itself doesn't match pattern 20.
        assert "LIKE can only be used" not in result

    def test_having_without_aggregate_or_group(self):
        """Pattern 26 requires 'having' AND ('aggregate' OR 'group' OR 'not allowed').
        'having' alone should not match."""
        raw = "having trouble with this query"
        result = translate_polars_error(raw)
        assert "HAVING clause error" not in result

    def test_null_without_concat_or_pipe_or_arithmetic(self):
        """Pattern 25 requires 'null' AND ('concat' or '||' or 'arithmetic').
        'null' alone should not match pattern 25."""
        raw = "null value found in dataset"
        result = translate_polars_error(raw)
        assert "NULL value in expression" not in result

    def test_window_without_partition_over_frame(self):
        """Pattern 23 requires 'window' AND ('partition' or 'over' or 'frame').
        'window' alone should not match pattern 23."""
        raw = "window size is too large"
        result = translate_polars_error(raw)
        assert "Window function error" not in result

    def test_union_without_column_mismatch_number(self):
        """Pattern 27 requires 'union' AND ('column' or 'mismatch' or 'number').
        'union' alone should not match pattern 27."""
        raw = "union operation completed"
        result = translate_polars_error(raw)
        assert "UNION error" not in result

    def test_join_without_column_or_key(self):
        """Pattern 17 requires 'join' AND ('column' or 'key').
        'join' alone should not match pattern 17."""
        raw = "join operation completed with warnings"
        result = translate_polars_error(raw)
        assert "JOIN error" not in result
