"""Edge-case tests for data_worker functions.

Covers:
- extract_schema() with empty parquet (0 rows)
- extract_schema() with a URL that returns 404
- execute_query() with empty SQL, non-existent table, syntax errors, very long SQL
- _has_limit() and _is_select() helper edge cases
- _collect_sample_values() with binary and null columns
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import polars as pl
import pytest

from app.workers.data_worker import (
    _collect_sample_values,
    _has_limit,
    _is_select,
    execute_query,
    extract_schema,
)


# ---------------------------------------------------------------------------
# extract_schema edge cases
# ---------------------------------------------------------------------------


class TestExtractSchemaEmptyParquet:
    """extract_schema() with an empty parquet file (0 rows)."""

    def test_empty_parquet_returns_columns_and_zero_rows(self, empty_parquet_url):
        """An empty parquet file still returns column metadata and row_count=0."""
        result = extract_schema(empty_parquet_url)

        assert "error_type" not in result
        assert result["row_count"] == 0
        assert len(result["columns"]) == 2  # a (Int64), b (Utf8)

    def test_empty_parquet_columns_have_names_and_types(self, empty_parquet_url):
        """Columns from an empty parquet have valid name and type fields."""
        result = extract_schema(empty_parquet_url)

        assert "error_type" not in result
        col_names = {c["name"] for c in result["columns"]}
        assert "a" in col_names
        assert "b" in col_names
        for col in result["columns"]:
            assert isinstance(col["type"], str)
            assert len(col["type"]) > 0

    def test_empty_parquet_sample_values_are_empty_lists(self, empty_parquet_url):
        """With 0 rows, sample_values for every column should be an empty list."""
        result = extract_schema(empty_parquet_url)

        assert "error_type" not in result
        for col in result["columns"]:
            assert col.get("sample_values") == []

    def test_empty_local_parquet(self, parquet_dir):
        """extract_schema with a file:// URI for an empty parquet works."""
        url = f"file://{parquet_dir}/empty.parquet"
        result = extract_schema(url)

        assert "error_type" not in result
        assert result["row_count"] == 0
        assert len(result["columns"]) == 2


class TestExtractSchema404:
    """extract_schema() with a URL that returns a 404 error."""

    def test_nonexistent_url_returns_error(self, parquet_server):
        """A 404 URL returns a structured error dict."""
        result = extract_schema(f"{parquet_server}/does_not_exist.parquet")

        assert "error_type" in result
        assert result["error_type"] in ("network", "validation")
        assert "message" in result

    def test_nonexistent_file_url_returns_error(self):
        """A file:// URI pointing to a missing file returns an error."""
        result = extract_schema("file:///tmp/nonexistent_chatdf_test_file.parquet")

        assert "error_type" in result
        assert "message" in result


# ---------------------------------------------------------------------------
# execute_query edge cases
# ---------------------------------------------------------------------------


class TestExecuteQueryEmptySQL:
    """execute_query() with an empty SQL string."""

    def test_empty_string_returns_error(self, sample_datasets):
        """An empty SQL string results in an error."""
        result = execute_query("", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result
        assert "execution_time_ms" in result

    def test_whitespace_only_returns_error(self, sample_datasets):
        """Whitespace-only SQL results in an error."""
        result = execute_query("   \n\t  ", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result


class TestExecuteQueryNonExistentTable:
    """execute_query() with SQL that references a non-existent table."""

    def test_missing_table_returns_sql_error(self, sample_datasets):
        """Querying a table not in the registered datasets returns error_type='sql'."""
        result = execute_query("SELECT * FROM imaginary_table", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result

    def test_missing_table_error_message_is_descriptive(self, sample_datasets):
        """The error message mentions the missing table."""
        result = execute_query("SELECT * FROM imaginary_table", sample_datasets)

        assert "imaginary_table" in result.get("details", "") or "imaginary_table" in result.get("message", "")

    def test_join_on_missing_table(self, sample_datasets):
        """A JOIN referencing a non-existent table returns an error."""
        result = execute_query(
            "SELECT * FROM table1 JOIN ghost_table ON table1.id = ghost_table.id",
            sample_datasets,
        )

        assert result["error_type"] == "sql"


class TestExecuteQuerySyntaxError:
    """execute_query() with SQL that has a syntax error."""

    def test_typo_keyword_returns_error(self, sample_datasets):
        """A keyword typo (SELEC instead of SELECT) returns an error."""
        result = execute_query("SELEC * FROM table1", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result

    def test_unclosed_parenthesis_returns_error(self, sample_datasets):
        """Unclosed parenthesis causes an error."""
        result = execute_query("SELECT * FROM (SELECT id FROM table1", sample_datasets)

        assert result["error_type"] == "sql"

    def test_dangling_comma_returns_error(self, sample_datasets):
        """A trailing comma in the column list is a syntax error (or Polars tolerates it)."""
        result = execute_query("SELECT id, FROM table1", sample_datasets)

        # Polars may tolerate trailing commas in some versions — accept either outcome
        if "error_type" in result:
            assert result["error_type"] == "sql"
        else:
            assert "rows" in result

    def test_double_where_returns_error(self, sample_datasets):
        """Duplicate WHERE clause is a syntax error."""
        result = execute_query("SELECT * FROM table1 WHERE WHERE id = 1", sample_datasets)

        assert result["error_type"] == "sql"


class TestExecuteQueryLongSQL:
    """execute_query() with moderately long SQL.

    NOTE: Previous version used 2000-condition OR chains and 2500-column
    SELECTs which caused Polars to allocate 9.5 GB and trigger OOM on the
    11 GB VPS.  Reduced to ~100 conditions / ~100 columns — still validates
    "long SQL" handling without blowing up memory.
    """

    def test_long_sql_with_many_conditions(self, sample_datasets):
        """A query with a long WHERE chain still executes."""
        conditions = " OR ".join(f"id = {i}" for i in range(100))
        sql = f"SELECT * FROM table1 WHERE {conditions}"
        assert len(sql) > 500

        result = execute_query(sql, sample_datasets)

        assert "error_type" not in result
        assert "rows" in result
        assert result["total_rows"] == 10

    def test_long_sql_with_many_aliased_columns(self, sample_datasets):
        """A query selecting many aliased columns works."""
        cols = ", ".join(f"id AS id_{i}" for i in range(100))
        sql = f"SELECT {cols} FROM table1 LIMIT 1"

        result = execute_query(sql, sample_datasets)

        assert "error_type" not in result
        assert len(result["rows"]) == 1

    def test_long_sql_execution_time_is_tracked(self, sample_datasets):
        """Long SQL still tracks execution_time_ms."""
        conditions = " OR ".join(f"id = {i}" for i in range(100))
        sql = f"SELECT * FROM table1 WHERE {conditions}"

        result = execute_query(sql, sample_datasets)

        assert "execution_time_ms" in result
        assert isinstance(result["execution_time_ms"], float)
        assert result["execution_time_ms"] >= 0

    def test_long_invalid_sql_returns_error(self, sample_datasets):
        """Long but syntactically invalid SQL still returns error properly."""
        garbage = "x " * 500
        sql = f"SELECT {garbage} FROM table1"

        result = execute_query(sql, sample_datasets)

        assert result["error_type"] == "sql"
        assert "execution_time_ms" in result


# ---------------------------------------------------------------------------
# _has_limit and _is_select edge cases
# ---------------------------------------------------------------------------


class TestHasLimitEdgeCases:
    """Additional edge cases for _has_limit()."""

    def test_limit_in_nested_subquery(self):
        """LIMIT inside a nested subquery is still detected."""
        sql = "SELECT * FROM (SELECT * FROM (SELECT 1 LIMIT 5) a) b"
        assert _has_limit(sql) is True

    def test_limit_after_union(self):
        """LIMIT after a UNION is detected."""
        sql = "SELECT 1 UNION ALL SELECT 2 LIMIT 10"
        assert _has_limit(sql) is True

    def test_no_limit_in_union(self):
        """A UNION without LIMIT returns False."""
        sql = "SELECT 1 UNION ALL SELECT 2"
        assert _has_limit(sql) is False

    def test_limit_in_single_quoted_string_with_escapes(self):
        """LIMIT inside a string with escaped quotes is stripped correctly."""
        sql = "SELECT * FROM t WHERE name = 'it''s a LIMIT'"
        assert _has_limit(sql) is False

    def test_limit_in_double_quoted_column_alias(self):
        """LIMIT used as a double-quoted column alias is stripped."""
        sql = 'SELECT count(*) AS "LIMIT" FROM t'
        assert _has_limit(sql) is False

    def test_real_limit_after_fake_ones(self):
        """A real LIMIT is found even when preceded by LIMIT in strings and comments."""
        sql = "SELECT * FROM t WHERE x = 'LIMIT 5' /* LIMIT 10 */ LIMIT 20"
        assert _has_limit(sql) is True

    def test_limit_keyword_boundary_unlimited(self):
        """The word 'UNLIMITED' should not match."""
        sql = "SELECT * FROM unlimited_data"
        assert _has_limit(sql) is False

    def test_limit_keyword_boundary_delimited(self):
        """The word 'delimited' should not match."""
        sql = "SELECT * FROM delimited"
        assert _has_limit(sql) is False

    def test_only_semicolon(self):
        """A single semicolon has no LIMIT."""
        assert _has_limit(";") is False

    def test_multiline_sql_with_limit(self):
        """LIMIT on its own line is detected."""
        sql = "SELECT *\nFROM t\nLIMIT 10"
        assert _has_limit(sql) is True


class TestIsSelectEdgeCases:
    """Additional edge cases for _is_select()."""

    def test_only_parentheses(self):
        """A string of only parentheses is not a SELECT."""
        assert _is_select("((()))") is False

    def test_select_with_leading_bom(self):
        """SELECT with a BOM character is not detected (BOM does not strip)."""
        assert _is_select("\ufeffSELECT 1") is False

    def test_with_recursive_cte(self):
        """WITH RECURSIVE is treated as a SELECT (starts with WITH)."""
        assert _is_select("WITH RECURSIVE cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_values_statement(self):
        """A VALUES statement is not a SELECT."""
        assert _is_select("VALUES (1, 2, 3)") is False

    def test_show_tables(self):
        """SHOW TABLES is not a SELECT."""
        assert _is_select("SHOW TABLES") is False

    def test_select_after_semicolon(self):
        """Multiple statements where the first is not a SELECT returns False."""
        assert _is_select("DROP TABLE t; SELECT * FROM t") is False

    def test_case_insensitive_with(self):
        """WITH in mixed case is still detected."""
        assert _is_select("WiTh cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_create_table_as_select(self):
        """CREATE TABLE AS SELECT starts with CREATE, returns False."""
        assert _is_select("CREATE TABLE t AS SELECT 1") is False

    def test_whitespace_before_parenthesized_select(self):
        """Leading whitespace plus parenthesized SELECT works."""
        assert _is_select("  (SELECT 1)") is True


# ---------------------------------------------------------------------------
# _collect_sample_values edge cases
# ---------------------------------------------------------------------------


class TestCollectSampleValuesEdgeCases:
    """_collect_sample_values() with binary columns, all-null columns, etc."""

    def test_binary_column_sample_values(self):
        """Binary columns produce string representations of bytes."""
        df = pl.DataFrame({"bin_col": [b"\x00\x01\x02", b"\xff\xfe", b"\xab"]})
        lf = df.lazy()
        columns = [{"name": "bin_col", "type": "Binary"}]

        result = _collect_sample_values(lf, columns)

        assert len(result) == 1
        assert "sample_values" in result[0]
        # Should have up to 3 unique values (all rows are unique)
        assert len(result[0]["sample_values"]) <= 3
        # Each sample should be a string
        for sv in result[0]["sample_values"]:
            assert isinstance(sv, str)

    def test_all_null_column_sample_values(self):
        """A column that is entirely null produces empty sample_values."""
        df = pl.DataFrame({"null_col": pl.Series([None, None, None], dtype=pl.Utf8)})
        lf = df.lazy()
        columns = [{"name": "null_col", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        assert result[0]["sample_values"] == []

    def test_mixed_null_and_values(self):
        """A column with some nulls returns only non-null sample values."""
        df = pl.DataFrame({"mix": pl.Series([None, "hello", None, "world", None], dtype=pl.Utf8)})
        lf = df.lazy()
        columns = [{"name": "mix", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        assert "sample_values" in result[0]
        samples = result[0]["sample_values"]
        assert "None" not in samples
        assert len(samples) <= 2  # only "hello" and "world"
        assert set(samples) <= {"hello", "world"}

    def test_long_string_values_are_truncated(self):
        """Sample values longer than 80 chars are truncated with '...'."""
        long_val = "x" * 200
        df = pl.DataFrame({"long_col": [long_val]})
        lf = df.lazy()
        columns = [{"name": "long_col", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        assert len(result[0]["sample_values"]) == 1
        sample = result[0]["sample_values"][0]
        assert len(sample) == 80  # 77 chars + "..."
        assert sample.endswith("...")

    def test_max_samples_default_is_five(self):
        """By default, at most 5 unique sample values are returned."""
        df = pl.DataFrame({"vals": [f"item_{i}" for i in range(50)]})
        lf = df.lazy()
        columns = [{"name": "vals", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        assert len(result[0]["sample_values"]) == 5

    def test_custom_max_samples(self):
        """The max_samples parameter limits sample count."""
        df = pl.DataFrame({"vals": [f"item_{i}" for i in range(50)]})
        lf = df.lazy()
        columns = [{"name": "vals", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns, max_samples=3)

        assert len(result[0]["sample_values"]) == 3

    def test_multiple_columns_mixed_types(self):
        """Multiple columns of different types all get sample_values."""
        df = pl.DataFrame({
            "int_col": [1, 2, 3],
            "str_col": ["a", "b", "c"],
            "float_col": [1.1, 2.2, 3.3],
        })
        lf = df.lazy()
        columns = [
            {"name": "int_col", "type": "Int64"},
            {"name": "str_col", "type": "Utf8"},
            {"name": "float_col", "type": "Float64"},
        ]

        result = _collect_sample_values(lf, columns)

        assert len(result) == 3
        for col_info in result:
            assert "sample_values" in col_info
            assert len(col_info["sample_values"]) == 3

    def test_empty_dataframe_columns_get_empty_samples(self):
        """An empty DataFrame results in empty sample_values for all columns."""
        df = pl.DataFrame({
            "a": pl.Series([], dtype=pl.Int64),
            "b": pl.Series([], dtype=pl.Utf8),
        })
        lf = df.lazy()
        columns = [
            {"name": "a", "type": "Int64"},
            {"name": "b", "type": "Utf8"},
        ]

        result = _collect_sample_values(lf, columns)

        for col_info in result:
            assert col_info["sample_values"] == []

    def test_boolean_column_sample_values(self):
        """Boolean column sample values are represented as strings."""
        df = pl.DataFrame({"flag": [True, False, True]})
        lf = df.lazy()
        columns = [{"name": "flag", "type": "Boolean"}]

        result = _collect_sample_values(lf, columns)

        assert "sample_values" in result[0]
        assert set(result[0]["sample_values"]) <= {"True", "False"}

    def test_date_column_sample_values(self):
        """Date column sample values are string representations of dates."""
        from datetime import date

        df = pl.DataFrame({"dt": [date(2024, 1, 1), date(2024, 6, 15)]})
        lf = df.lazy()
        columns = [{"name": "dt", "type": "Date"}]

        result = _collect_sample_values(lf, columns)

        assert len(result[0]["sample_values"]) == 2
        for sv in result[0]["sample_values"]:
            assert isinstance(sv, str)
            assert "2024" in sv
