"""Tests for error translator patterns 45-48.

Covers:
- Pattern 45: INTERSECT/EXCEPT set operations not supported
- Pattern 46: CROSS JOIN syntax not supported
- Pattern 47: ALTER/CREATE/DROP TABLE DDL statements not supported
- Pattern 48: STRUCT/JSON field access not supported

Note on pattern ordering
------------------------
These patterns are placed near the end of the matcher (just before the
generic fallback).  Earlier patterns can intercept messages that happen
to contain triggering keywords.  Tests are crafted to reach the intended
pattern without being intercepted by earlier ones.
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
# Pattern 45: INTERSECT/EXCEPT not supported
# ---------------------------------------------------------------------------


class TestIntersectExcept:
    """Pattern 45: INTERSECT and EXCEPT set operations."""

    def test_intersect_error(self):
        raw = "INTERSECT is not supported in Polars SQL"
        result = translate_polars_error(raw)
        _assert_friendly(result, "INTERSECT and EXCEPT set operations are not supported", raw)

    def test_except_error(self):
        raw = "EXCEPT clause is not available"
        result = translate_polars_error(raw)
        _assert_friendly(result, "INTERSECT and EXCEPT set operations are not supported", raw)

    def test_intersect_lowercase(self):
        raw = "intersect operation failed"
        result = translate_polars_error(raw)
        _assert_friendly(result, "INTERSECT and EXCEPT", raw)

    def test_except_lowercase(self):
        raw = "except set operation not implemented"
        result = translate_polars_error(raw)
        _assert_friendly(result, "LEFT JOIN with IS NULL", raw)

    def test_intersect_suggests_left_join(self):
        """Verify the friendly message suggests LEFT JOIN alternative."""
        raw = "intersect query not supported"
        result = translate_polars_error(raw)
        assert "LEFT JOIN with IS NULL" in result
        assert "NOT EXISTS" in result

    def test_except_suggests_left_join(self):
        raw = "except query not supported"
        result = translate_polars_error(raw)
        assert "LEFT JOIN with IS NULL" in result

    def test_intersect_mixed_case(self):
        raw = "Intersect All is not supported in this SQL dialect"
        result = translate_polars_error(raw)
        _assert_friendly(result, "INTERSECT and EXCEPT", raw)

    def test_except_mixed_case(self):
        raw = "Except is not a valid set operation here"
        result = translate_polars_error(raw)
        _assert_friendly(result, "INTERSECT and EXCEPT", raw)


# ---------------------------------------------------------------------------
# Pattern 46: CROSS JOIN warning
# ---------------------------------------------------------------------------


class TestCrossJoin:
    """Pattern 46: CROSS JOIN syntax not supported."""

    def test_cross_join_error(self):
        raw = "CROSS JOIN is not supported in Polars SQL"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CROSS JOIN syntax may not be supported", raw)

    def test_cross_join_lowercase(self):
        raw = "cross join operation failed"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CROSS JOIN syntax may not be supported", raw)

    def test_cross_join_suggests_alternative(self):
        """Verify the friendly message suggests using ON 1=1."""
        raw = "cross join is not available in Polars SQL"
        result = translate_polars_error(raw)
        assert "ON 1=1" in result

    def test_cross_join_mixed_case(self):
        raw = "Cross Join not available in this context"
        result = translate_polars_error(raw)
        _assert_friendly(result, "CROSS JOIN syntax", raw)

    def test_cross_join_suggests_restructure(self):
        """Verify the friendly message suggests restructuring."""
        raw = "CROSS JOIN failed during execution"
        result = translate_polars_error(raw)
        assert "restructure your query" in result

    def test_join_without_cross_no_match(self):
        """'join' alone (without 'cross join') should NOT match pattern 46.

        This tests that the pattern requires "cross join" as a phrase.
        Note: 'join' + 'column' would match Pattern 17 instead.
        """
        raw = "join operation completed with warnings"
        result = translate_polars_error(raw)
        assert "CROSS JOIN" not in result


# ---------------------------------------------------------------------------
# Pattern 47: ALTER/CREATE/DROP TABLE (DDL statements)
# ---------------------------------------------------------------------------


class TestDDLStatements:
    """Pattern 47: ALTER TABLE, CREATE TABLE, DROP TABLE not supported.

    Note: Pattern 36 catches "statement type is not supported" which is
    the real Polars error for DDL.  Pattern 47 is a safety net for error
    messages that mention these DDL keywords directly (e.g., from a
    pre-parser or custom error).
    """

    def test_alter_table(self):
        raw = "ALTER TABLE users ADD COLUMN email VARCHAR"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Data definition statements (CREATE, ALTER, DROP) are not supported", raw)

    def test_create_table(self):
        raw = "CREATE TABLE new_data (id INT, name VARCHAR)"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Data definition statements (CREATE, ALTER, DROP)", raw)

    def test_drop_table(self):
        raw = "DROP TABLE old_data CASCADE"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Data definition statements (CREATE, ALTER, DROP)", raw)

    def test_alter_table_lowercase(self):
        raw = "alter table not supported in read-only mode"
        result = translate_polars_error(raw)
        _assert_friendly(result, "read-only access to datasets", raw)

    def test_create_table_lowercase(self):
        raw = "create table is not allowed in Polars SQL"
        result = translate_polars_error(raw)
        _assert_friendly(result, "read-only access to datasets", raw)

    def test_drop_table_lowercase(self):
        raw = "drop table command is not permitted"
        result = translate_polars_error(raw)
        _assert_friendly(result, "read-only access to datasets", raw)

    def test_ddl_mentions_read_only(self):
        """Verify all DDL messages mention read-only access."""
        for ddl in ["alter table x", "create table y", "drop table z"]:
            result = translate_polars_error(ddl)
            assert "read-only access" in result, f"Missing 'read-only' for: {ddl}"

    def test_create_without_table_no_match(self):
        """'create' alone (without 'table') should NOT match pattern 47."""
        raw = "create index failed"
        result = translate_polars_error(raw)
        assert "Data definition statements" not in result

    def test_statement_type_not_supported_hits_pattern_36(self):
        """The real Polars DDL error hits Pattern 36 first, not Pattern 47."""
        raw = "statement type is not supported:\nAlterTable(AlterTable { ... })"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Only SELECT queries are supported", raw)
        assert "Data definition statements" not in result


# ---------------------------------------------------------------------------
# Pattern 48: STRUCT/JSON field access
# ---------------------------------------------------------------------------


class TestStructJsonAccess:
    """Pattern 48: STRUCT/JSON field access not supported.

    Checks: "struct" in msg_lower AND ("field" or "access" in msg_lower).
    """

    def test_struct_field_error(self):
        raw = "cannot access struct field 'name' in column data"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Accessing struct/JSON fields directly in SQL is not supported", raw)

    def test_struct_access_error(self):
        raw = "struct access is not supported in Polars SQL context"
        result = translate_polars_error(raw)
        _assert_friendly(result, "Accessing struct/JSON fields directly in SQL", raw)

    def test_struct_field_lowercase(self):
        raw = "struct field extraction not available"
        result = translate_polars_error(raw)
        _assert_friendly(result, "struct/JSON fields", raw)

    def test_struct_access_mixed_case(self):
        raw = "Struct Access error: cannot extract nested value"
        result = translate_polars_error(raw)
        _assert_friendly(result, "struct/JSON fields", raw)

    def test_struct_suggests_application_parsing(self):
        """Verify the friendly message suggests parsing in the application."""
        raw = "struct field 'address.city' not accessible"
        result = translate_polars_error(raw)
        assert "selecting the column and parsing it" in result

    def test_struct_without_field_or_access_no_match(self):
        """'struct' alone (without 'field' or 'access') should NOT match pattern 48."""
        raw = "struct type not recognized in schema"
        result = translate_polars_error(raw)
        assert "struct/JSON fields" not in result

    def test_struct_field_uppercase(self):
        raw = "STRUCT FIELD 'metadata.key' cannot be read"
        result = translate_polars_error(raw)
        _assert_friendly(result, "struct/JSON fields", raw)


# ---------------------------------------------------------------------------
# Edge cases for patterns 45-48
# ---------------------------------------------------------------------------


class TestNewPatternEdgeCases:
    """Edge cases for patterns 45-48."""

    def test_intersect_in_longer_message(self):
        """INTERSECT keyword buried in a longer error message."""
        raw = "SQL execution error: the INTERSECT operation is not implemented yet in Polars"
        result = translate_polars_error(raw)
        assert "INTERSECT and EXCEPT" in result

    def test_except_in_longer_message(self):
        raw = "query failed: EXCEPT ALL is not a supported set operation"
        result = translate_polars_error(raw)
        assert "INTERSECT and EXCEPT" in result

    def test_cross_join_in_complex_error(self):
        """CROSS JOIN in a multi-line error message."""
        raw = (
            "query compilation failed:\n"
            "CROSS JOIN not supported for these table types\n"
            "at position 42"
        )
        result = translate_polars_error(raw)
        assert "CROSS JOIN syntax" in result

    def test_alter_table_in_complex_error(self):
        raw = "parse error: alter table not recognized as valid SQL"
        result = translate_polars_error(raw)
        assert "Data definition statements" in result

    def test_struct_field_in_complex_error(self):
        """Struct field error with Polars-style resolved plan."""
        raw = (
            "struct field 'user.email' not accessible\n\n"
            "Resolved plan until failure:\n"
            "\t---> FAILED HERE <---"
        )
        result = translate_polars_error(raw)
        assert "struct/JSON fields" in result

    def test_no_raw_polars_internals_leaked(self):
        """Friendly messages should not contain raw Polars type names."""
        for raw in [
            "intersect operation error",
            "cross join failed",
            "alter table denied",
            "struct field missing",
        ]:
            result = translate_polars_error(raw)
            friendly_part = result.split("\n\nTechnical details:")[0]
            for internal in ["i64", "f32", "LazyFrame", "DataFrame", "Series"]:
                assert internal not in friendly_part, (
                    f"Friendly message leaked Polars internal '{internal}' "
                    f"for input '{raw}': {friendly_part}"
                )
