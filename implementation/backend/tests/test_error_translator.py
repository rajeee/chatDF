"""Tests for the Polars SQL error translator.

Covers:
- All known error pattern matches (patterns 1-17)
- Generic fallback for unrecognised errors
- User-friendly message formatting with technical details
- Case-insensitivity of pattern matching
- Column-not-found enrichment with available columns
"""

from __future__ import annotations

from app.workers.error_translator import translate_polars_error


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assert_friendly(result: str, expected_snippet: str, raw_msg: str) -> None:
    """Assert the translated result contains the friendly snippet and raw msg."""
    assert expected_snippet in result
    assert f"Technical details: {raw_msg}" in result


# ---------------------------------------------------------------------------
# Existing patterns (1-8)
# ---------------------------------------------------------------------------


class TestColumnNotFound:
    """Pattern 1: column not found."""

    def test_basic_column_not_found(self):
        raw = 'Column "foo_bar" not found in table'
        result = translate_polars_error(raw)
        _assert_friendly(result, "Column 'foo_bar' doesn't exist", raw)

    def test_column_not_found_with_available_columns(self):
        raw = 'Column "age" not found'
        result = translate_polars_error(raw, available_columns=["name", "id"])
        _assert_friendly(result, "Available columns: name, id", raw)

    def test_column_not_found_error_class(self):
        raw = "ColumnNotFoundError: something went wrong"
        result = translate_polars_error(raw)
        _assert_friendly(result, "doesn't exist", raw)


class TestILike:
    """Pattern 2: ILIKE not supported."""

    def test_ilike_error(self):
        raw = "ILIKE is not supported in this context"
        result = translate_polars_error(raw)
        _assert_friendly(result, "doesn't support ILIKE", raw)


class TestTypeMismatch:
    """Pattern 3: type mismatch."""

    def test_cannot_compare(self):
        raw = "cannot compare Utf8 with Int64"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Type mismatch error", raw)

    def test_type_mismatch(self):
        raw = "Type mismatch in expression"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CAST()", raw)


class TestTableNotFound:
    """Pattern 4: table not found."""

    def test_table_not_found(self):
        raw = "table 'sales' not found"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Table not found", raw)


class TestSyntaxError:
    """Pattern 5: syntax / parser error."""

    def test_sql_parser_error(self):
        raw = "SQL parser error: Expected SELECT but got INSERT"
        result = translate_polars_error(raw)
        _assert_friendly(result, "SQL syntax error", raw)

    def test_syntax_error(self):
        raw = "syntax error at or near SELECT"
        result = translate_polars_error(raw)
        _assert_friendly(result, "missing commas", raw)


class TestDivisionByZero:
    """Pattern 6: division by zero."""

    def test_divide_by_zero(self):
        raw = "divide by zero"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Division by zero", raw)

    def test_division_by_zero(self):
        raw = "ArithmeticError: division by zero encountered"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CASE WHEN", raw)


class TestFunctionNotSupported:
    """Pattern 7: function not found (broad catch)."""

    def test_invalidoperationerror(self):
        raw = "InvalidOperationError: operation not valid"
        result = translate_polars_error(raw)
        _assert_friendly(result, "not supported in Polars SQL", raw)


class TestGroupBy:
    """Pattern 8: aggregation without GROUP BY."""

    def test_must_appear_in_group_by(self):
        raw = 'column "name" must appear in GROUP BY clause'
        result = translate_polars_error(raw)
        _assert_friendly(result, "must appear in GROUP BY", raw)


# ---------------------------------------------------------------------------
# New patterns (9-15)
# ---------------------------------------------------------------------------


class TestInterval:
    """Pattern 9: INTERVAL not supported."""

    def test_interval_lowercase(self):
        raw = "interval expression is not supported"
        result = translate_polars_error(raw)
        _assert_friendly(result, "doesn't support INTERVAL", raw)

    def test_interval_uppercase(self):
        raw = "INTERVAL '1 day' is not supported in Polars SQL"
        result = translate_polars_error(raw)
        _assert_friendly(result, "strftime()", raw)

    def test_interval_mixed_case(self):
        raw = "Error: Interval type not implemented"
        result = translate_polars_error(raw)
        _assert_friendly(result, "date arithmetic", raw)


class TestAmbiguousColumn:
    """Pattern 10: ambiguous column reference."""

    def test_ambiguous_reference(self):
        raw = 'column reference "id" is ambiguous'
        result = translate_polars_error(raw)
        _assert_friendly(result, "Ambiguous column reference", raw)

    def test_ambiguous_uppercase(self):
        raw = "Ambiguous column name in join"
        result = translate_polars_error(raw)
        _assert_friendly(result, "table1.column_name", raw)


class TestOverflow:
    """Pattern 11: numeric overflow."""

    def test_integer_overflow(self):
        raw = "integer overflow when computing sum"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Numeric overflow", raw)

    def test_overflow_generic(self):
        raw = "ComputeError: overflow in multiplication"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CAST(col AS BIGINT)", raw)


class TestNoSuchFunction:
    """Pattern 12: unknown function (specific variant)."""

    def test_unknown_function(self):
        raw = "unknown function: LCASE"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not available", raw)

    def test_unknown_function_suggests_alternatives(self):
        raw = "unknown function: SUBSTR"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LENGTH() not LEN()", raw)


class TestRegexp:
    """Pattern 13: REGEXP / RLIKE not supported."""

    def test_regex(self):
        raw = "regex patterns are not supported"
        result = translate_polars_error(raw)
        _assert_friendly(result, "not supported in Polars SQL", raw)

    def test_rlike(self):
        raw = "RLIKE operator is not available"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIKE with % and _", raw)

    def test_regexp(self):
        raw = "REGEXP is not a valid operator"
        result = translate_polars_error(raw)
        _assert_friendly(result, "wildcards instead", raw)


class TestStringToNumberConversion:
    """Pattern 14: string to number conversion failure."""

    def test_could_not_parse(self):
        raw = "could not parse '12abc' as integer"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Could not convert string to number", raw)

    def test_conversion_string(self):
        raw = "conversion error: cannot convert string to numeric"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CAST(column AS FLOAT)", raw)

    def test_conversion_without_string_no_match(self):
        """'conversion' alone (without 'string') should NOT match pattern 14."""
        raw = "conversion failed for date"
        result = translate_polars_error(raw)
        # Should fall through to generic fallback (not pattern 14)
        _assert_friendly(result, "The query encountered an error", raw)
        assert "Could not convert string" not in result


class TestDistinctOn:
    """Pattern 15: DISTINCT ON not supported."""

    def test_distinct_on(self):
        raw = "DISTINCT ON is not supported"
        result = translate_polars_error(raw)
        _assert_friendly(result, "DISTINCT ON is not supported in Polars SQL", raw)

    def test_distinct_on_lowercase(self):
        raw = "distinct on columns not available in Polars"
        result = translate_polars_error(raw)
        _assert_friendly(result, "ROW_NUMBER() OVER", raw)


# ---------------------------------------------------------------------------
# New patterns (16-17)
# ---------------------------------------------------------------------------


class TestTimeout:
    """Pattern 16: query timeout / resource exhaustion."""

    def test_timeout(self):
        raw = "Query execution timeout after 30s"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Query timed out or ran out of memory", raw)

    def test_out_of_memory(self):
        raw = "ComputeError: out of memory during aggregation"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIMIT clause", raw)

    def test_resource_exhaustion(self):
        raw = "resource limit exceeded during query execution"
        result = translate_polars_error(raw)
        _assert_friendly(result, "selecting fewer columns", raw)


class TestJoinError:
    """Pattern 17: JOIN errors."""

    def test_join_column_error(self):
        raw = "join failed: column 'user_id' not found in right table"
        result = translate_polars_error(raw)
        _assert_friendly(result, "JOIN error", raw)

    def test_join_key_mismatch(self):
        raw = "join key types do not match: Int64 vs Utf8"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CAST() if types differ", raw)

    def test_join_without_column_or_key_no_match(self):
        """'join' alone (without 'column' or 'key') should NOT match pattern 17."""
        raw = "join operation completed with warnings"
        result = translate_polars_error(raw)
        # Should hit the generic fallback, not the JOIN pattern
        _assert_friendly(result, "The query encountered an error", raw)


# ---------------------------------------------------------------------------
# Generic fallback / edge-case behaviour
# ---------------------------------------------------------------------------


class TestGenericFallback:
    """Unrecognised errors get a helpful generic message."""

    def test_unknown_error_gets_generic_message(self):
        raw = "some completely unknown polars error xyz"
        result = translate_polars_error(raw)
        _assert_friendly(result, "The query encountered an error", raw)

    def test_generic_fallback_mentions_common_fixes(self):
        raw = "an obscure internal error nobody has ever seen"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LOWER() instead of ILIKE", raw)
        _assert_friendly(result, "strftime() instead of DATE_TRUNC", raw)

    def test_empty_string(self):
        result = translate_polars_error("")
        assert result == ""


# ---------------------------------------------------------------------------
# New patterns (18-22)
# ---------------------------------------------------------------------------


class TestGroupByOutOfRange:
    """Pattern 18: GROUP BY position out of range."""

    def test_group_by_position_out_of_range(self):
        raw = "group by position 5 is not in select list"
        result = translate_polars_error(raw)
        _assert_friendly(result, "GROUP BY position number is out of range", raw)


class TestDuplicateColumn:
    """Pattern 19: duplicate column name."""

    def test_duplicate_column(self):
        raw = "duplicate column name 'id' in result set"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Duplicate column name", raw)


class TestLikeTypeError:
    """Pattern 20: LIKE on non-string column."""

    def test_like_cannot_apply(self):
        raw = "cannot apply LIKE operator to Int64 column"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIKE can only be used with text columns", raw)

    def test_like_invalid_type(self):
        raw = "LIKE: invalid type for comparison"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CAST(column AS VARCHAR)", raw)


class TestSubqueryCTE:
    """Pattern 21: subquery/CTE errors."""

    def test_cte_error(self):
        raw = "CTE name 'x' is already defined"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CTE error", raw)

    def test_subquery_must_have_alias(self):
        raw = "subquery in FROM must have an alias"
        result = translate_polars_error(raw)
        _assert_friendly(result, "subquery has an alias", raw)


class TestOrderByNotInSelect:
    """Pattern 22: ORDER BY column not in SELECT."""

    def test_order_by_not_in_select(self):
        raw = "ORDER BY column 'age' not in SELECT list"
        result = translate_polars_error(raw)
        _assert_friendly(result, "ORDER BY column not found in SELECT", raw)
