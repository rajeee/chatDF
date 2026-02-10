"""Tests for new error translator patterns 28-35.

Covers: LEFT/RIGHT not supported, Boolean type, empty result,
schema mismatch, CONCAT not found, DATE_TRUNC, LCASE/UCASE,
nested aggregates.

Note on pattern ordering
------------------------
The error translator matches patterns top-to-bottom.  Several earlier
patterns are broad enough to intercept messages intended for later
patterns.  In particular:

- Pattern 7 matches ``re.search(r"function\\s.*not\\s+found", ...)``
  so any message like "function X not found" will be caught there
  *before* reaching patterns 28, 32, etc.
- Pattern 3 matches "cannot compare" or "type mismatch", which can
  intercept Boolean-related messages before pattern 29.

The tests below use error strings that are specific enough to reach
the intended pattern without being intercepted by earlier ones.
"""

from __future__ import annotations

from app.workers.error_translator import translate_polars_error


# ---------------------------------------------------------------------------
# Pattern 28: LEFT/RIGHT function not available
# ---------------------------------------------------------------------------


class TestLeftRightNotSupported:
    """Pattern 28: LEFT/RIGHT function not available.

    Pattern 28 checks: ("left" in msg_lower or "right" in msg_lower)
    and "not found" in msg_lower.

    Messages containing "function X not found" are intercepted by
    Pattern 7's regex, so we craft messages that include "left"/"right"
    and "not found" without matching ``function\\s.*not\\s+found``.
    """

    def test_left_not_found(self):
        """Message with 'left' and 'not found' that skips Pattern 7."""
        result = translate_polars_error("left not found in SQL context")
        assert "LEFT()" in result
        assert "SUBSTRING" in result

    def test_right_not_found(self):
        result = translate_polars_error("right not found in SQL context")
        assert "RIGHT()" in result
        assert "SUBSTRING" in result

    def test_left_with_function_keyword_hits_pattern_7(self):
        """'function left not found' is intercepted by Pattern 7.

        This documents the pattern priority: Pattern 7's regex fires
        before Pattern 28 can be reached.
        """
        result = translate_polars_error("function left not found")
        assert "Function not supported in Polars SQL" in result
        # Pattern 28 output should NOT appear
        assert "LEFT() and RIGHT()" not in result

    def test_left_case_insensitive(self):
        result = translate_polars_error("LEFT Not Found in registry")
        assert "SUBSTRING" in result

    def test_right_length_example(self):
        """Verify the friendly message includes the RIGHT replacement example."""
        result = translate_polars_error("right not found for column extraction")
        assert "LENGTH(col)" in result


# ---------------------------------------------------------------------------
# Pattern 29: Boolean type error
# ---------------------------------------------------------------------------


class TestBooleanTypeError:
    """Pattern 29: Boolean type misuse.

    Pattern 29 checks: "boolean" in msg_lower and
    ("compare" or "cast" or "type" in msg_lower).

    "cannot compare" triggers Pattern 3 first, so we avoid that phrase.
    """

    def test_boolean_cast(self):
        """'boolean' + 'cast' reaches Pattern 29 (no earlier pattern catches 'cast')."""
        result = translate_polars_error("cannot cast integer to boolean")
        assert "true/false" in result

    def test_boolean_type(self):
        """'boolean' + 'type' (without 'cannot compare' or 'type mismatch')."""
        result = translate_polars_error("boolean type error in expression")
        assert "true/false" in result

    def test_boolean_compare_hits_pattern_3(self):
        """'boolean type cannot compare' triggers Pattern 3 first.

        Documents the priority: 'cannot compare' matches Pattern 3
        before Pattern 29 can fire.
        """
        result = translate_polars_error("boolean type cannot compare with integer")
        assert "Type mismatch error" in result
        # Pattern 29 should NOT be the match
        assert "true/false" not in result

    def test_boolean_cast_with_type(self):
        """Message with 'boolean', 'cast', and 'type' keywords."""
        result = translate_polars_error("failed to cast value to boolean type")
        assert "true/false" in result
        assert "col = true" in result


# ---------------------------------------------------------------------------
# Pattern 30: Empty result / no rows
# ---------------------------------------------------------------------------


class TestEmptyResult:
    """Pattern 30: Empty result / no rows.

    Checks: "empty" in msg_lower and ("dataframe" or "result" in msg_lower).
    """

    def test_empty_dataframe(self):
        result = translate_polars_error("empty dataframe returned")
        assert "no results" in result

    def test_empty_result_set(self):
        result = translate_polars_error("empty result set from query")
        assert "no results" in result

    def test_broadening_suggestion(self):
        """Friendly message should suggest broadening the WHERE clause."""
        result = translate_polars_error("empty dataframe after filtering")
        assert "WHERE" in result

    def test_empty_alone_no_match(self):
        """'empty' without 'dataframe' or 'result' should not match Pattern 30."""
        result = translate_polars_error("empty string in column")
        assert "no results" not in result


# ---------------------------------------------------------------------------
# Pattern 31: Schema mismatch on UNION/JOIN
# ---------------------------------------------------------------------------


class TestSchemaMismatch:
    """Pattern 31: Schema mismatch.

    Checks: "schema" in msg_lower and ("mismatch" or "differ" in msg_lower).
    """

    def test_schema_mismatch(self):
        result = translate_polars_error("schema mismatch between tables")
        assert "Schema mismatch" in result
        assert "CAST()" in result

    def test_schema_differ(self):
        result = translate_polars_error("schemas differ in column types")
        assert "Schema mismatch" in result

    def test_schema_alone_no_match(self):
        """'schema' without 'mismatch' or 'differ' should not match Pattern 31."""
        result = translate_polars_error("schema loaded successfully")
        assert "Schema mismatch" not in result


# ---------------------------------------------------------------------------
# Pattern 32: CONCAT function not available
# ---------------------------------------------------------------------------


class TestConcatNotFound:
    """Pattern 32: CONCAT function not available.

    Checks: "concat" in msg_lower and "not found" in msg_lower.

    Note: "function concat not found" matches Pattern 7 first via the
    ``function\\s.*not\\s+found`` regex.  Messages that have "concat"
    and "not found" without "function <name> not found" will reach 32,
    but they may also be intercepted by Pattern 25 (null+concat) or
    Pattern 12 (function+not found).  We craft messages carefully.
    """

    def test_concat_not_found(self):
        """'concat' + 'not found' without triggering Pattern 7 or 12.

        Pattern 12 checks: ("function" in msg_lower and "not found") or
        "unknown function". Avoid the word 'function' entirely.
        """
        result = translate_polars_error("concat not found in SQL dialect")
        assert "CONCAT()" in result
        assert "||" in result

    def test_concat_function_hits_pattern_7(self):
        """'function concat not found' is caught by Pattern 7."""
        result = translate_polars_error("function concat not found")
        assert "Function not supported in Polars SQL" in result

    def test_concat_operator_suggestion(self):
        """Verify the || operator suggestion is present."""
        result = translate_polars_error("concat operator not found in registry")
        assert "||" in result
        assert "col1 || ' ' || col2" in result


# ---------------------------------------------------------------------------
# Pattern 33: DATE_TRUNC not available
# ---------------------------------------------------------------------------


class TestDateTrunc:
    """Pattern 33: DATE_TRUNC not available.

    Checks: "date_trunc" in msg_lower.

    Note: the message must NOT match Pattern 7 or Pattern 12 first.
    "date_trunc is not a valid function" -- Pattern 7 regex is
    ``function\\s.*not\\s+found``, which requires "function" then
    "not found". This message has neither, so Pattern 33 fires.
    """

    def test_date_trunc_error(self):
        result = translate_polars_error("date_trunc is not a valid operation")
        assert "DATE_TRUNC" in result
        assert "strftime()" in result

    def test_date_trunc_uppercase(self):
        result = translate_polars_error("DATE_TRUNC not available in this SQL dialect")
        assert "strftime()" in result

    def test_date_trunc_month_example(self):
        """Verify the friendly message includes month truncation example."""
        result = translate_polars_error("date_trunc('month', col) failed")
        assert "strftime('%Y-%m', date_col)" in result

    def test_date_trunc_year_example(self):
        """Verify the friendly message includes year truncation example."""
        result = translate_polars_error("date_trunc error in query")
        assert "strftime('%Y', date_col)" in result


# ---------------------------------------------------------------------------
# Pattern 34: LCASE / UCASE not available
# ---------------------------------------------------------------------------


class TestLcaseUcase:
    """Pattern 34: LCASE/UCASE not available.

    Checks: "lcase" in msg_lower or "ucase" in msg_lower.
    """

    def test_lcase(self):
        result = translate_polars_error("lcase not recognized in SQL")
        assert "LOWER()" in result

    def test_ucase(self):
        result = translate_polars_error("ucase not recognized in SQL")
        assert "UPPER()" in result

    def test_lcase_uppercase_input(self):
        """Pattern uses msg_lower, so LCASE in any case should match."""
        result = translate_polars_error("LCASE is not supported")
        assert "LOWER()" in result

    def test_ucase_uppercase_input(self):
        result = translate_polars_error("UCASE is not supported")
        assert "UPPER()" in result

    def test_lcase_ucase_combined_message(self):
        """Both LCASE and UCASE mentioned -- pattern still fires."""
        result = translate_polars_error("lcase and ucase are not available")
        assert "LCASE()/UCASE()" in result


# ---------------------------------------------------------------------------
# Pattern 35: Nested aggregate functions not allowed
# ---------------------------------------------------------------------------


class TestNestedAggregate:
    """Pattern 35: Nested aggregate functions not allowed.

    Checks: "nested" in msg_lower and ("aggregate" or "agg" in msg_lower).
    """

    def test_nested_aggregate(self):
        result = translate_polars_error("nested aggregate not allowed in expression")
        assert "Nested aggregate" in result
        assert "subquery" in result or "CTE" in result

    def test_nested_agg_variant(self):
        result = translate_polars_error("nested agg expression error")
        assert "Nested aggregate" in result

    def test_nested_alone_no_match(self):
        """'nested' without 'aggregate' or 'agg' should not match Pattern 35."""
        result = translate_polars_error("nested subquery syntax error")
        # 'subquery' + 'must have' not present, so Pattern 21 won't fire either.
        # 'syntax error' triggers Pattern 5.
        assert "Nested aggregate" not in result

    def test_subquery_cte_suggestion(self):
        """Verify the friendly message suggests a CTE-based workaround.

        Avoid 'detected' which contains the substring 'cte' and would
        trigger Pattern 21 (CTE/subquery naming error) first.
        """
        result = translate_polars_error("nested aggregate found in query")
        assert "WITH sub AS" in result
