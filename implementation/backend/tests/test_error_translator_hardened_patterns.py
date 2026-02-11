"""Tests for hardened error translator patterns.

Tests the fixes and new patterns added to harden the Polars SQL error
translator against real-world Polars error messages. Each test uses the
actual error string format produced by Polars to ensure the translator
catches real errors, not just hypothetical phrasings.

Covers:
- Pattern 1  fix: "unable to find column" (real Polars ColumnNotFoundError format)
- Pattern 4  fix: "relation ... was not found" (real Polars table-not-found)
- Pattern 7  fix: "unsupported function" (real Polars function errors)
- Pattern 14 fix: "conversion from `str` to `i32` failed" (real CAST failure)
- Pattern 18 fix: "GROUP BY ordinal value must refer to a valid column"
- Pattern 19 fix: "duplicate output name" (real Polars DuplicateError)
- Pattern 20 fix: "expected String type, got" (real LIKE-on-int error)
- Pattern 21 fix: "derived tables must have aliases" (real subquery error)
- Pattern 36 new: "statement type is not supported" (INSERT/UPDATE/DELETE/DDL)
- Pattern 37 new: "non-numeric arguments for LIMIT/OFFSET"
- Pattern 38 new: "'is_in' cannot check for" (IN clause type mismatch)
- Pattern 39 new: "multiple tables in FROM clause" (implicit join)
- Pattern 40 new: TOP clause not supported
- Pattern 41 new: unsupported datatype in CAST
- Pattern 42 new: sort expressions length mismatch
- Pattern 43 new: HAVING clause not valid outside GROUP BY
- Pattern 44 new: UNION requires equal number of columns
"""

from __future__ import annotations

from app.workers.error_translator import translate_polars_error


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assert_friendly(result: str, expected_snippet: str, raw_msg: str) -> None:
    """Assert the translated result contains the friendly snippet and raw msg."""
    assert expected_snippet in result, (
        f"Expected '{expected_snippet}' in result, got:\n{result}"
    )
    assert f"Technical details: {raw_msg}" in result


# ---------------------------------------------------------------------------
# Pattern 1 fix: real Polars "unable to find column" format
# ---------------------------------------------------------------------------


class TestColumnNotFoundRealFormat:
    """Pattern 1: the actual Polars ColumnNotFoundError message uses
    'unable to find column "X"; valid columns: [...]' not
    'Column "X" not found'.
    """

    def test_real_polars_column_not_found(self):
        """The exact error format produced by Polars."""
        raw = 'unable to find column "nonexistent"; valid columns: ["a"]'
        result = translate_polars_error(raw)
        _assert_friendly(result, "Column 'nonexistent' doesn't exist", raw)

    def test_real_polars_column_not_found_with_available(self):
        """With available_columns provided, should list them."""
        raw = 'unable to find column "price"; valid columns: ["cost", "qty"]'
        result = translate_polars_error(raw, available_columns=["cost", "qty"])
        _assert_friendly(result, "Available columns: cost, qty", raw)
        assert "Column 'price'" in result

    def test_real_polars_column_not_found_extracts_name(self):
        """Column name should be correctly extracted from the new format."""
        raw = 'unable to find column "my_special_col"; valid columns: ["a", "b"]'
        result = translate_polars_error(raw)
        assert "Column 'my_special_col'" in result

    def test_old_format_still_works(self):
        """The old 'Column "X" not found' format should still be matched."""
        raw = 'Column "foo_bar" not found in table'
        result = translate_polars_error(raw)
        _assert_friendly(result, "Column 'foo_bar' doesn't exist", raw)

    def test_sql_execution_error_prefix(self):
        """Error messages arrive prefixed with 'SQL execution error: '."""
        raw = 'SQL execution error: unable to find column "test"; valid columns: ["a"]'
        result = translate_polars_error(raw)
        assert "Column 'test' doesn't exist" in result


# ---------------------------------------------------------------------------
# Pattern 4 fix: real Polars "relation ... was not found"
# ---------------------------------------------------------------------------


class TestRelationNotFound:
    """Pattern 4: Polars says 'relation X was not found' not 'table X not found'."""

    def test_real_polars_relation_not_found(self):
        raw = "relation 'nonexistent' was not found"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Table not found", raw)

    def test_real_polars_relation_not_found_no_quotes(self):
        raw = "relation mytable was not found"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Table not found", raw)

    def test_old_table_not_found_still_works(self):
        raw = "table 'sales' not found"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Table not found", raw)

    def test_dataset_name_suggestion(self):
        raw = "relation 'users_table' was not found"
        result = translate_polars_error(raw)
        assert "dataset name as shown in the schema" in result


# ---------------------------------------------------------------------------
# Pattern 7 fix: real Polars "unsupported function" format
# ---------------------------------------------------------------------------


class TestUnsupportedFunction:
    """Pattern 7: Polars says 'unsupported function X', not 'function X not found'."""

    def test_real_polars_unsupported_function_len(self):
        raw = "unsupported function 'len'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_lcase(self):
        """LCASE is caught by pattern 34 first (lower priority for pattern 7).
        But "unsupported function 'lcase'" has 'lcase' which matches pattern 34,
        however pattern 7 comes first with the unsupported function regex."""
        raw = "unsupported function 'lcase'"
        result = translate_polars_error(raw)
        # Pattern 7 fires first because it's checked before pattern 34
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_dateadd(self):
        raw = "unsupported function 'dateadd'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_string_agg(self):
        raw = "unsupported function 'string_agg'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_group_concat(self):
        raw = "unsupported function 'group_concat'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_now(self):
        raw = "unsupported function 'now'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_year(self):
        raw = "unsupported function 'year'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_nvl(self):
        raw = "unsupported function 'nvl'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_polars_unsupported_function_datediff(self):
        raw = "unsupported function 'datediff'"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_old_function_not_found_still_works(self):
        raw = "function 'MY_FUNC' not found"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)


# ---------------------------------------------------------------------------
# Pattern 14 fix: real Polars CAST failure format
# ---------------------------------------------------------------------------


class TestCastFailureRealFormat:
    """Pattern 14: real Polars CAST failure says
    'conversion from `str` to `i32` failed in column X for N out of M values'.
    """

    def test_real_polars_cast_str_to_int(self):
        raw = (
            "conversion from `str` to `i32` failed in column 'name' "
            "for 2 out of 2 values: [\"alice\", \"bob\"]"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Could not convert string to number", raw)

    def test_real_polars_cast_str_to_i64(self):
        raw = (
            "conversion from `str` to `i64` failed in column 's' "
            "for 1 out of 2 values: [\"abc\"]"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "CAST(column AS FLOAT)", raw)

    def test_real_polars_cast_str_to_f64(self):
        raw = (
            "conversion from `str` to `f64` failed in column 'val' "
            "for 3 out of 10 values: [\"N/A\", \"none\", \"-\"]"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Could not convert string to number", raw)

    def test_old_could_not_parse_still_works(self):
        raw = "could not parse '12abc' as integer"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Could not convert string to number", raw)


# ---------------------------------------------------------------------------
# Pattern 18 fix: real Polars GROUP BY ordinal format
# ---------------------------------------------------------------------------


class TestGroupByOrdinalRealFormat:
    """Pattern 18: Polars says 'GROUP BY ordinal value must refer to a valid column'."""

    def test_real_polars_group_by_ordinal(self):
        raw = "GROUP BY ordinal value must refer to a valid column; found 5"
        result = translate_polars_error(raw)
        _assert_friendly(result, "GROUP BY position number is out of range", raw)

    def test_real_polars_group_by_ordinal_lowercase(self):
        raw = "group by ordinal value must refer to a valid column; found 10"
        result = translate_polars_error(raw)
        _assert_friendly(result, "GROUP BY 1 refers to the first column", raw)

    def test_old_group_by_position_still_works(self):
        raw = "group by position 5 is not in select list"
        result = translate_polars_error(raw)
        _assert_friendly(result, "GROUP BY position number is out of range", raw)


# ---------------------------------------------------------------------------
# Pattern 19 fix: real Polars "duplicate output name"
# ---------------------------------------------------------------------------


class TestDuplicateOutputNameRealFormat:
    """Pattern 19: Polars says 'projections contained duplicate output name'."""

    def test_real_polars_duplicate_output_name(self):
        raw = (
            "projections contained duplicate output name 'a'. "
            "It's possible that multiple expressions are returning the same "
            "default column name."
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Duplicate column name in query results", raw)

    def test_real_polars_duplicate_output_name_alias(self):
        """Should suggest using aliases."""
        raw = "projections contained duplicate output name 'id'"
        result = translate_polars_error(raw)
        assert "aliases" in result
        assert "AS" in result

    def test_old_duplicate_column_still_works(self):
        raw = "duplicate column name 'id' in result set"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Duplicate column name", raw)


# ---------------------------------------------------------------------------
# Pattern 20 fix: real Polars "expected String type, got"
# ---------------------------------------------------------------------------


class TestExpectedStringTypeRealFormat:
    """Pattern 20: real Polars error for LIKE on non-string says
    'expected String type, got: i64'.
    """

    def test_real_polars_expected_string_type(self):
        raw = "expected String type, got: i64"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIKE can only be used with text columns", raw)

    def test_real_polars_expected_string_type_float(self):
        raw = "expected String type, got: f64"
        result = translate_polars_error(raw)
        assert "CAST(column AS VARCHAR)" in result

    def test_old_like_cannot_apply_still_works(self):
        raw = "cannot apply LIKE operator to Int64 column"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIKE can only be used with text columns", raw)


# ---------------------------------------------------------------------------
# Pattern 21 fix: real Polars "derived tables must have aliases"
# ---------------------------------------------------------------------------


class TestDerivedTableAliasRealFormat:
    """Pattern 21: Polars says 'derived tables must have aliases'."""

    def test_real_polars_derived_tables_must_have_aliases(self):
        raw = "derived tables must have aliases"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Subquery or CTE error", raw)

    def test_alias_example_in_message(self):
        raw = "derived tables must have aliases"
        result = translate_polars_error(raw)
        assert "AS subquery_name" in result

    def test_old_subquery_must_have_still_works(self):
        raw = "subquery in FROM must have an alias"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Subquery or CTE error", raw)


# ---------------------------------------------------------------------------
# Pattern 36 new: DML/DDL statement not supported
# ---------------------------------------------------------------------------


class TestStatementNotSupported:
    """Pattern 36: INSERT/UPDATE/DELETE/CREATE/ALTER/DROP."""

    def test_real_polars_insert_not_supported(self):
        raw = (
            "statement type is not supported:\n"
            "Insert(Insert { insert_token: TokenWithSpan ... })"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Only SELECT queries are supported", raw)

    def test_real_polars_update_not_supported(self):
        raw = (
            "statement type is not supported:\n"
            "Update(Update { update_token: TokenWithSpan ... })"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Only SELECT queries are supported", raw)

    def test_real_polars_delete_not_supported(self):
        raw = "statement type is not supported:\nDelete(Delete { ... })"
        result = translate_polars_error(raw)
        assert "INSERT, UPDATE, DELETE, CREATE, ALTER, or DROP" in result

    def test_real_polars_alter_table_not_supported(self):
        raw = "statement type is not supported:\nAlterTable(AlterTable { ... })"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Only SELECT queries are supported", raw)

    def test_message_mentions_select(self):
        raw = "statement type is not supported:\nDrop(Drop { ... })"
        result = translate_polars_error(raw)
        assert "Use SELECT queries to analyze and retrieve data" in result


# ---------------------------------------------------------------------------
# Pattern 37 new: LIMIT/OFFSET validation
# ---------------------------------------------------------------------------


class TestLimitOffsetValidation:
    """Pattern 37: non-numeric LIMIT/OFFSET."""

    def test_real_polars_limit_non_numeric(self):
        raw = "non-numeric arguments for LIMIT/OFFSET are not supported"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIMIT and OFFSET must be positive integers", raw)

    def test_real_polars_limit_validation_uppercase(self):
        raw = "Non-numeric arguments for LIMIT/OFFSET are not supported"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIMIT and OFFSET must be positive integers", raw)

    def test_example_usage(self):
        raw = "non-numeric arguments for LIMIT/OFFSET are not supported"
        result = translate_polars_error(raw)
        assert "LIMIT 10 OFFSET 20" in result


# ---------------------------------------------------------------------------
# Pattern 38 new: IN clause type mismatch
# ---------------------------------------------------------------------------


class TestInClauseTypeMismatch:
    """Pattern 38: 'is_in' cannot check for type mismatch."""

    def test_real_polars_is_in_type_mismatch(self):
        raw = "'is_in' cannot check for List(String) values in Int64 data"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Type mismatch in IN clause", raw)

    def test_cast_suggestion(self):
        raw = "'is_in' cannot check for List(Int64) values in String data"
        result = translate_polars_error(raw)
        assert "CAST()" in result

    def test_real_polars_is_in_with_resolved_plan(self):
        """Real Polars error includes a resolved plan after the message."""
        raw = (
            "'is_in' cannot check for List(String) values in Int64 data\n\n"
            "Resolved plan until failure:\n\n"
            "\t---> FAILED HERE RESOLVING 'sink' <---\n"
            "FILTER col(\"a\").is_in([Series])"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Type mismatch in IN clause", raw)


# ---------------------------------------------------------------------------
# Pattern 39 new: implicit join (multiple tables in FROM)
# ---------------------------------------------------------------------------


class TestMultipleTablesInFrom:
    """Pattern 39: comma-separated tables in FROM clause."""

    def test_real_polars_multiple_tables(self):
        raw = (
            "multiple tables in FROM clause are not currently supported "
            "(found 2); use explicit JOIN syntax instead"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "Comma-separated tables in FROM are not supported", raw)

    def test_join_syntax_suggestion(self):
        raw = (
            "multiple tables in FROM clause are not currently supported "
            "(found 3); use explicit JOIN syntax instead"
        )
        result = translate_polars_error(raw)
        assert "JOIN" in result
        assert "ON" in result


# ---------------------------------------------------------------------------
# Pattern 40 new: TOP N syntax
# ---------------------------------------------------------------------------


class TestTopClauseNotSupported:
    """Pattern 40: SQL Server TOP syntax."""

    def test_real_polars_top_not_supported(self):
        raw = "`TOP` clause is not supported; use `LIMIT` instead"
        result = translate_polars_error(raw)
        _assert_friendly(result, "TOP is not supported in Polars SQL", raw)

    def test_limit_alternative_mentioned(self):
        raw = "`TOP` clause is not supported; use `LIMIT` instead"
        result = translate_polars_error(raw)
        assert "LIMIT" in result
        assert "SELECT * FROM table LIMIT 10" in result


# ---------------------------------------------------------------------------
# Pattern 41 new: unsupported datatype in CAST
# ---------------------------------------------------------------------------


class TestUnsupportedDatatype:
    """Pattern 41: CAST to unsupported data type."""

    def test_real_polars_money_type(self):
        raw = 'datatype "MONEY" is not currently supported'
        result = translate_polars_error(raw)
        _assert_friendly(result, "Unsupported data type in CAST", raw)

    def test_standard_types_mentioned(self):
        raw = 'datatype "DECIMAL" is not currently supported'
        result = translate_polars_error(raw)
        assert "INTEGER" in result
        assert "FLOAT" in result
        assert "VARCHAR" in result

    def test_real_polars_datatype_not_supported_various(self):
        """Various unsupported types."""
        for dtype in ["MONEY", "TINYINT", "XML", "NVARCHAR"]:
            raw = f'datatype "{dtype}" is not currently supported'
            result = translate_polars_error(raw)
            assert "Unsupported data type in CAST" in result, (
                f"Failed for datatype {dtype}"
            )


# ---------------------------------------------------------------------------
# Pattern 42 new: sort expressions length mismatch
# ---------------------------------------------------------------------------


class TestSortExpressionsMismatch:
    """Pattern 42: ORDER BY with aggregate in non-aggregated query."""

    def test_real_polars_sort_length_mismatch(self):
        raw = (
            "sort expressions must have same length as DataFrame, "
            "got DataFrame height: 2 and Series length: 1"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "ORDER BY error", raw)

    def test_aggregate_suggestion(self):
        raw = "sort expressions must have same length as DataFrame"
        result = translate_polars_error(raw)
        assert "aggregate functions" in result
        assert "GROUP BY" in result


# ---------------------------------------------------------------------------
# Pattern 43 new: HAVING clause outside GROUP BY (Polars-specific)
# ---------------------------------------------------------------------------


class TestHavingOutsideGroupBy:
    """Pattern 43: HAVING clause not valid outside GROUP BY.

    Note: Pattern 26 also catches generic HAVING errors (having + group).
    Pattern 43 uses more specific phrasing to match the real Polars error.
    Since pattern 26 comes first and the real message contains 'having' and
    'group', pattern 26 will actually fire. Pattern 43 is a safety net for
    the specific Polars phrasing if pattern 26 didn't match.
    """

    def test_real_polars_having_outside_group_by_matches_pattern_26(self):
        """The real Polars error has 'having' and 'group', so pattern 26 fires."""
        raw = (
            "HAVING clause not valid outside of GROUP BY; found:\n"
            "Some(BinaryOp { ... })"
        )
        result = translate_polars_error(raw)
        # Pattern 26 fires first because it checks 'having' + 'group'
        _assert_friendly(result, "HAVING clause error", raw)


# ---------------------------------------------------------------------------
# Pattern 44 new: UNION requires equal column count (Polars-specific)
# ---------------------------------------------------------------------------


class TestUnionEqualColumnsRealFormat:
    """Pattern 44: the exact Polars UNION error message.

    Pattern 27 already catches this since the message has 'union' + 'number' + 'column'.
    Pattern 44 is a fallback with more specific phrasing and mentions UNION BY NAME.
    """

    def test_real_polars_union_column_mismatch_matches_pattern_27(self):
        """The real Polars error matches pattern 27 first."""
        raw = (
            "UNION requires equal number of columns in each table "
            "(use 'UNION BY NAME' to combine mismatched tables)"
        )
        result = translate_polars_error(raw)
        # Pattern 27 fires first
        _assert_friendly(result, "UNION error", raw)


# ---------------------------------------------------------------------------
# Real Polars error integration tests (exact error strings from Polars)
# ---------------------------------------------------------------------------


class TestRealPolarsErrors:
    """Integration tests using actual Polars error strings.

    These test the full flow: a real Polars error message in, friendly
    user message out. They validate that the translator handles real
    production errors correctly.
    """

    def test_real_type_mismatch_compare(self):
        raw = "cannot compare string with numeric type (i64)"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Type mismatch error", raw)

    def test_real_sql_parser_error(self):
        raw = (
            "sql parser error: Expected: an SQL statement, "
            "found: SELEKT at Line: 1, Column: 1"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "SQL syntax error", raw)

    def test_real_ambiguous_reference(self):
        raw = 'ambiguous reference to column "a" (use one of: t1.a, t2.a)'
        result = translate_polars_error(raw)
        _assert_friendly(result, "Ambiguous column reference", raw)

    def test_real_unsupported_function_date_trunc(self):
        """'unsupported function 'date_trunc'' -- pattern 7 fires first
        because 'unsupported function' is checked before 'date_trunc' in pattern 33."""
        raw = "unsupported function 'date_trunc'"
        result = translate_polars_error(raw)
        # Pattern 7 fires (unsupported function)
        _assert_friendly(result, "Function not supported in Polars SQL", raw)

    def test_real_like_on_integer_full_error(self):
        """The full LIKE-on-integer error with resolved plan."""
        raw = (
            'expected String type, got: i64\n\n'
            'Resolved plan until failure:\n\n'
            "\t---> FAILED HERE RESOLVING 'sink' <---\n"
            'FILTER col("a").str.contains(["^(?s).*1.*$"])\n'
            'FROM\n'
            '  DF ["a"]; PROJECT */1 COLUMNS'
        )
        result = translate_polars_error(raw)
        assert "LIKE can only be used with text columns" in result

    def test_real_having_syntax_error_full(self):
        """Full HAVING error with Polars AST dump."""
        raw = (
            "HAVING clause not valid outside of GROUP BY; found:\n"
            "Some(BinaryOp { left: Identifier(Ident { value: \"a\", "
            "quote_style: None }), op: Gt, right: Value(Number(\"1\", false)) })"
        )
        result = translate_polars_error(raw)
        # Pattern 26 fires because 'having' + 'group' are present
        _assert_friendly(result, "HAVING clause error", raw)

    def test_real_union_with_advice(self):
        """Real Polars UNION error includes the UNION BY NAME suggestion."""
        raw = (
            "UNION requires equal number of columns in each table "
            "(use 'UNION BY NAME' to combine mismatched tables)"
        )
        result = translate_polars_error(raw)
        _assert_friendly(result, "UNION error", raw)

    def test_real_between_type_mismatch(self):
        """BETWEEN with wrong types produces a 'cannot compare' error."""
        raw = "cannot compare string with numeric type (i32)"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Type mismatch error", raw)
        assert "CAST()" in result


# ---------------------------------------------------------------------------
# Edge cases for new patterns
# ---------------------------------------------------------------------------


class TestNewPatternEdgeCases:
    """Edge cases for the newly added patterns."""

    def test_statement_type_case_insensitive(self):
        raw = "STATEMENT TYPE IS NOT SUPPORTED:\nSomeAst{}"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Only SELECT queries are supported", raw)

    def test_limit_offset_mixed_case(self):
        raw = "Non-Numeric Arguments For LIMIT/OFFSET Are Not Supported"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LIMIT and OFFSET must be positive integers", raw)

    def test_is_in_check_without_cannot_no_match(self):
        """'is_in' without 'cannot check' should not match pattern 38."""
        raw = "is_in expression evaluated successfully"
        result = translate_polars_error(raw)
        assert "Type mismatch in IN clause" not in result

    def test_top_without_clause_and_limit_no_match(self):
        """'top' alone should not match pattern 40."""
        raw = "top value is 100"
        result = translate_polars_error(raw)
        assert "TOP is not supported" not in result

    def test_datatype_not_in_error_no_match(self):
        """Random use of 'datatype' should not match pattern 41."""
        raw = "datatype column is varchar"
        result = translate_polars_error(raw)
        assert "Unsupported data type" not in result

    def test_sort_expressions_without_same_length_no_match(self):
        """'sort expressions' alone should not match pattern 42."""
        raw = "sort expressions applied successfully"
        result = translate_polars_error(raw)
        assert "ORDER BY error" not in result

    def test_no_raw_polars_internals_leaked(self):
        """Friendly messages should never contain raw Polars type names
        like 'i64', 'f32', 'LazyFrame', etc. in the friendly part."""
        raw = "unsupported function 'datediff'"
        result = translate_polars_error(raw)
        friendly_part = result.split("\n\nTechnical details:")[0]
        for internal in ["i64", "f32", "LazyFrame", "DataFrame", "Series"]:
            assert internal not in friendly_part, (
                f"Friendly message leaked Polars internal '{internal}': {friendly_part}"
            )
