"""Tests for data_worker helper functions.

Covers: _is_csv_file, _is_tsv_file, _is_select, _has_limit, _collect_sample_values
"""
from __future__ import annotations

import polars as pl
import pytest

from app.workers.data_worker import (
    _collect_sample_values,
    _has_limit,
    _is_csv_file,
    _is_select,
    _is_tsv_file,
)


# ---------------------------------------------------------------------------
# _is_csv_file
# ---------------------------------------------------------------------------


class TestIsCsvFile:
    """Tests for _is_csv_file helper."""

    def test_csv_extension(self):
        assert _is_csv_file("data.csv") is True

    def test_csv_gz_extension(self):
        assert _is_csv_file("data.csv.gz") is True

    def test_tsv_counted_as_csv(self):
        """TSV files are a subset of CSV-like files, so _is_csv_file returns True."""
        assert _is_csv_file("data.tsv") is True

    def test_csv_uppercase(self):
        assert _is_csv_file("DATA.CSV") is True

    def test_csv_mixed_case(self):
        assert _is_csv_file("Report.Csv") is True

    def test_csv_gz_mixed_case(self):
        assert _is_csv_file("archive.CSV.GZ") is True

    def test_tsv_mixed_case(self):
        assert _is_csv_file("Export.TSV") is True

    def test_parquet_returns_false(self):
        assert _is_csv_file("data.parquet") is False

    def test_json_returns_false(self):
        assert _is_csv_file("data.json") is False

    def test_xlsx_returns_false(self):
        assert _is_csv_file("report.xlsx") is False

    def test_no_extension_returns_false(self):
        assert _is_csv_file("datafile") is False

    def test_url_with_csv(self):
        assert _is_csv_file("https://example.com/files/report.csv") is True

    def test_url_with_csv_gz(self):
        assert _is_csv_file("https://example.com/data/archive.csv.gz") is True

    def test_url_with_query_params(self):
        """Query params after .csv are stripped — URL path is checked."""
        assert _is_csv_file("https://example.com/data.csv?token=abc") is True

    def test_url_with_fragment(self):
        assert _is_csv_file("https://example.com/data.csv#section") is True

    def test_empty_string(self):
        assert _is_csv_file("") is False

    def test_local_path_csv(self):
        assert _is_csv_file("/tmp/uploads/my_data.csv") is True

    def test_local_path_csv_gz(self):
        assert _is_csv_file("/tmp/uploads/compressed.csv.gz") is True

    def test_csv_in_directory_name_not_at_end(self):
        assert _is_csv_file("/data.csv/file.parquet") is False

    def test_csv_bak_returns_false(self):
        """A .csv.bak extension should not match."""
        assert _is_csv_file("data.csv.bak") is False


# ---------------------------------------------------------------------------
# _is_tsv_file
# ---------------------------------------------------------------------------


class TestIsTsvFile:
    """Tests for _is_tsv_file helper."""

    def test_tsv_extension(self):
        assert _is_tsv_file("data.tsv") is True

    def test_tsv_uppercase(self):
        assert _is_tsv_file("DATA.TSV") is True

    def test_tsv_mixed_case(self):
        assert _is_tsv_file("Report.Tsv") is True

    def test_csv_returns_false(self):
        assert _is_tsv_file("data.csv") is False

    def test_csv_gz_returns_false(self):
        assert _is_tsv_file("data.csv.gz") is False

    def test_parquet_returns_false(self):
        assert _is_tsv_file("data.parquet") is False

    def test_txt_returns_false(self):
        assert _is_tsv_file("data.txt") is False

    def test_empty_string(self):
        assert _is_tsv_file("") is False

    def test_url_with_tsv(self):
        assert _is_tsv_file("https://example.com/export.tsv") is True

    def test_url_with_csv(self):
        assert _is_tsv_file("https://example.com/export.csv") is False

    def test_local_path_tsv(self):
        assert _is_tsv_file("/tmp/data/tab_separated.tsv") is True


# ---------------------------------------------------------------------------
# _is_select
# ---------------------------------------------------------------------------


class TestIsSelect:
    """Tests for _is_select SQL helper."""

    def test_simple_select(self):
        assert _is_select("SELECT * FROM t") is True

    def test_with_cte(self):
        assert _is_select("WITH cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_insert_returns_false(self):
        assert _is_select("INSERT INTO t VALUES (1)") is False

    def test_create_table_returns_false(self):
        assert _is_select("CREATE TABLE t (id INT)") is False

    def test_drop_table_returns_false(self):
        assert _is_select("DROP TABLE t") is False

    def test_delete_returns_false(self):
        assert _is_select("DELETE FROM t WHERE id = 1") is False

    def test_update_returns_false(self):
        assert _is_select("UPDATE t SET name = 'x' WHERE id = 1") is False

    def test_parenthesized_select(self):
        assert _is_select("(SELECT * FROM t)") is True

    def test_multiple_leading_parentheses(self):
        assert _is_select("((SELECT * FROM t))") is True

    def test_leading_whitespace(self):
        assert _is_select("   SELECT * FROM t") is True

    def test_leading_newlines_and_tabs(self):
        assert _is_select("\n\t  SELECT * FROM t") is True

    def test_select_lowercase(self):
        assert _is_select("select * from t") is True

    def test_select_mixed_case(self):
        assert _is_select("Select id From t") is True

    def test_with_mixed_case(self):
        assert _is_select("WiTh cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_with_recursive(self):
        assert _is_select("WITH RECURSIVE cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_alter_table_returns_false(self):
        assert _is_select("ALTER TABLE t ADD COLUMN x INT") is False

    def test_truncate_returns_false(self):
        assert _is_select("TRUNCATE TABLE t") is False

    def test_empty_string(self):
        assert _is_select("") is False

    def test_only_whitespace(self):
        assert _is_select("   \n\t  ") is False

    def test_explain_select(self):
        """EXPLAIN does not start with SELECT or WITH."""
        assert _is_select("EXPLAIN SELECT * FROM t") is False

    def test_create_table_as_select(self):
        """CREATE TABLE AS SELECT starts with CREATE."""
        assert _is_select("CREATE TABLE t AS SELECT 1") is False

    def test_paren_with_space_before_select(self):
        """Space between ( and SELECT means lstrip('(') leaves ' SELECT', which
        does not startswith SELECT after upper()."""
        assert _is_select("  ( SELECT * FROM t )") is False


# ---------------------------------------------------------------------------
# _has_limit
# ---------------------------------------------------------------------------


class TestHasLimit:
    """Tests for _has_limit SQL helper."""

    def test_limit_present(self):
        assert _has_limit("SELECT * FROM t LIMIT 10") is True

    def test_no_limit(self):
        assert _has_limit("SELECT * FROM t") is False

    def test_limit_at_end_with_semicolon(self):
        assert _has_limit("SELECT id, name FROM t\nLIMIT 100;") is True

    def test_limit_with_offset(self):
        assert _has_limit("SELECT * FROM t LIMIT 10 OFFSET 20") is True

    def test_limit_in_subquery(self):
        sql = "SELECT * FROM (SELECT * FROM t LIMIT 50) sub"
        assert _has_limit(sql) is True

    def test_limit_in_cte(self):
        sql = "WITH cte AS (SELECT * FROM t LIMIT 5) SELECT * FROM cte"
        assert _has_limit(sql) is True

    def test_limit_after_union(self):
        sql = "SELECT 1 UNION ALL SELECT 2 LIMIT 10"
        assert _has_limit(sql) is True

    # --- Case insensitivity ---

    def test_limit_lowercase(self):
        assert _has_limit("select * from t limit 20") is True

    def test_limit_mixed_case(self):
        assert _has_limit("SELECT * FROM t Limit 50") is True

    # --- LIMIT inside string literals (should NOT match) ---

    def test_limit_inside_single_quoted_string(self):
        assert _has_limit("SELECT * FROM t WHERE name = 'LIMIT 10'") is False

    def test_limit_inside_double_quoted_identifier(self):
        assert _has_limit('SELECT "LIMIT" FROM t') is False

    def test_limit_as_double_quoted_alias(self):
        assert _has_limit('SELECT count(*) AS "LIMIT" FROM t') is False

    # --- LIMIT inside comments (should NOT match) ---

    def test_limit_in_single_line_comment(self):
        assert _has_limit("SELECT * FROM t -- LIMIT 10") is False

    def test_limit_in_block_comment(self):
        assert _has_limit("SELECT * FROM t /* LIMIT 10 */") is False

    def test_limit_in_multiline_block_comment(self):
        sql = "SELECT * FROM t /* some\nLIMIT 10\ncomment */"
        assert _has_limit(sql) is False

    # --- Real LIMIT with fake LIMIT in strings/comments ---

    def test_real_limit_after_comment_limit(self):
        sql = "SELECT * FROM t /* LIMIT 5 */ LIMIT 20"
        assert _has_limit(sql) is True

    def test_real_limit_with_string_limit(self):
        sql = "SELECT * FROM t WHERE x = 'no LIMIT here' LIMIT 100"
        assert _has_limit(sql) is True

    def test_real_limit_after_both_fakes(self):
        sql = "SELECT * FROM t WHERE x = 'LIMIT 5' /* LIMIT 10 */ LIMIT 20"
        assert _has_limit(sql) is True

    # --- Word boundary checks ---

    def test_limit_as_substring_unlimited(self):
        """'unlimited' contains 'limit' but word boundary prevents match."""
        assert _has_limit("SELECT * FROM unlimited_table") is False

    def test_limit_as_substring_delimited(self):
        assert _has_limit("SELECT * FROM delimited") is False

    def test_limited_table_name(self):
        assert _has_limit("SELECT * FROM limited_table") is False

    # --- Edge cases ---

    def test_empty_string(self):
        assert _has_limit("") is False

    def test_only_whitespace(self):
        assert _has_limit("   \n\t  ") is False

    def test_only_comment(self):
        assert _has_limit("-- LIMIT 10") is False

    def test_only_block_comment(self):
        assert _has_limit("/* LIMIT 10 */") is False

    def test_multiline_sql_with_limit(self):
        sql = "SELECT *\nFROM t\nLIMIT 10"
        assert _has_limit(sql) is True

    def test_complex_cte_with_limit(self):
        sql = """
        WITH cte AS (
            SELECT id, name FROM users WHERE active = 1
        ),
        counts AS (
            SELECT id, COUNT(*) AS cnt FROM orders GROUP BY id
        )
        SELECT cte.name, counts.cnt
        FROM cte JOIN counts ON cte.id = counts.id
        ORDER BY counts.cnt DESC
        LIMIT 25
        """
        assert _has_limit(sql) is True

    def test_complex_cte_without_limit(self):
        sql = """
        WITH cte AS (
            SELECT id, name FROM users WHERE active = 1
        )
        SELECT cte.name FROM cte ORDER BY cte.name
        """
        assert _has_limit(sql) is False


# ---------------------------------------------------------------------------
# _collect_sample_values
# ---------------------------------------------------------------------------


class TestCollectSampleValues:
    """Tests for _collect_sample_values with Polars LazyFrames."""

    def test_normal_case_returns_sample_values(self):
        """Basic case: string column with distinct values."""
        df = pl.DataFrame({"city": ["Paris", "London", "Tokyo"]})
        lf = df.lazy()
        columns = [{"name": "city", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        assert len(result) == 1
        assert "sample_values" in result[0]
        assert set(result[0]["sample_values"]) == {"Paris", "London", "Tokyo"}

    def test_numeric_column(self):
        """Numeric columns also produce string sample values."""
        df = pl.DataFrame({"score": [10, 20, 30]})
        lf = df.lazy()
        columns = [{"name": "score", "type": "Int64"}]

        result = _collect_sample_values(lf, columns)

        assert len(result[0]["sample_values"]) == 3
        for sv in result[0]["sample_values"]:
            assert isinstance(sv, str)

    def test_multiple_columns(self):
        """Multiple columns of different types all get sample_values."""
        df = pl.DataFrame({
            "id": [1, 2, 3],
            "name": ["a", "b", "c"],
            "val": [1.1, 2.2, 3.3],
        })
        lf = df.lazy()
        columns = [
            {"name": "id", "type": "Int64"},
            {"name": "name", "type": "Utf8"},
            {"name": "val", "type": "Float64"},
        ]

        result = _collect_sample_values(lf, columns)

        assert len(result) == 3
        for col_info in result:
            assert "sample_values" in col_info
            assert len(col_info["sample_values"]) == 3

    # --- All-NULL column ---

    def test_all_null_column(self):
        """A column that is entirely null produces empty sample_values."""
        df = pl.DataFrame({"x": pl.Series([None, None, None], dtype=pl.Utf8)})
        lf = df.lazy()
        columns = [{"name": "x", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        assert result[0]["sample_values"] == []

    def test_mixed_null_and_values(self):
        """Only non-null values appear in samples."""
        df = pl.DataFrame({"mix": pl.Series([None, "hello", None, "world", None], dtype=pl.Utf8)})
        lf = df.lazy()
        columns = [{"name": "mix", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        samples = result[0]["sample_values"]
        assert "None" not in samples
        assert set(samples) <= {"hello", "world"}

    # --- Truncation of long values ---

    def test_long_values_truncated_at_80_chars(self):
        """Sample values longer than 80 chars are truncated to 77 chars + '...'."""
        long_val = "x" * 200
        df = pl.DataFrame({"long_col": [long_val]})
        lf = df.lazy()
        columns = [{"name": "long_col", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        sample = result[0]["sample_values"][0]
        assert len(sample) == 80
        assert sample.endswith("...")
        assert sample[:77] == "x" * 77

    def test_value_exactly_80_chars_not_truncated(self):
        """A value that is exactly 80 chars should NOT be truncated."""
        val_80 = "a" * 80
        df = pl.DataFrame({"col": [val_80]})
        lf = df.lazy()
        columns = [{"name": "col", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        sample = result[0]["sample_values"][0]
        assert len(sample) == 80
        assert sample == val_80

    def test_value_81_chars_is_truncated(self):
        """A value that is 81 chars should be truncated."""
        val_81 = "b" * 81
        df = pl.DataFrame({"col": [val_81]})
        lf = df.lazy()
        columns = [{"name": "col", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        sample = result[0]["sample_values"][0]
        assert len(sample) == 80
        assert sample.endswith("...")

    # --- Empty dataframe ---

    def test_empty_dataframe(self):
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

    # --- max_samples parameter ---

    def test_default_max_samples_is_five(self):
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

    def test_max_samples_greater_than_unique_values(self):
        """When fewer unique values exist than max_samples, return all of them."""
        df = pl.DataFrame({"vals": ["a", "b"]})
        lf = df.lazy()
        columns = [{"name": "vals", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns, max_samples=10)

        assert len(result[0]["sample_values"]) == 2

    # --- Exception handling ---

    def test_nonexistent_column_gets_empty_samples(self):
        """If a column name in the list doesn't exist in the frame, sample_values is []."""
        df = pl.DataFrame({"real_col": [1, 2, 3]})
        lf = df.lazy()
        columns = [{"name": "nonexistent", "type": "Int64"}]

        result = _collect_sample_values(lf, columns)

        assert result[0]["sample_values"] == []

    def test_outer_exception_adds_empty_samples(self):
        """If the lazy frame fails to collect entirely, all columns get empty sample_values."""
        # Create an intentionally broken lazy frame by using a non-existent file
        # We can simulate this by passing a non-LazyFrame object that will raise on .head().collect()
        columns = [
            {"name": "a", "type": "Int64"},
            {"name": "b", "type": "Utf8"},
        ]

        # Pass None as lazy_frame; calling .head(100).collect() will raise
        result = _collect_sample_values(None, columns)

        for col_info in result:
            assert col_info["sample_values"] == []

    # --- Various data types ---

    def test_boolean_column(self):
        """Boolean column sample values are string representations."""
        df = pl.DataFrame({"flag": [True, False, True]})
        lf = df.lazy()
        columns = [{"name": "flag", "type": "Boolean"}]

        result = _collect_sample_values(lf, columns)

        assert set(result[0]["sample_values"]) <= {"True", "False"}

    def test_date_column(self):
        """Date column sample values are string representations."""
        from datetime import date

        df = pl.DataFrame({"dt": [date(2024, 1, 1), date(2024, 6, 15)]})
        lf = df.lazy()
        columns = [{"name": "dt", "type": "Date"}]

        result = _collect_sample_values(lf, columns)

        assert len(result[0]["sample_values"]) == 2
        for sv in result[0]["sample_values"]:
            assert isinstance(sv, str)
            assert "2024" in sv

    def test_binary_column(self):
        """Binary columns produce string representations of bytes."""
        df = pl.DataFrame({"bin_col": [b"\x00\x01", b"\xff\xfe", b"\xab"]})
        lf = df.lazy()
        columns = [{"name": "bin_col", "type": "Binary"}]

        result = _collect_sample_values(lf, columns)

        assert "sample_values" in result[0]
        for sv in result[0]["sample_values"]:
            assert isinstance(sv, str)

    def test_duplicate_values_are_deduplicated(self):
        """Duplicate values in the column result in unique sample values."""
        df = pl.DataFrame({"col": ["a", "a", "b", "b", "c", "c"]})
        lf = df.lazy()
        columns = [{"name": "col", "type": "Utf8"}]

        result = _collect_sample_values(lf, columns)

        samples = result[0]["sample_values"]
        assert len(samples) == len(set(samples))
        assert set(samples) == {"a", "b", "c"}

    def test_columns_list_is_mutated_in_place(self):
        """The function modifies the input columns list and also returns it."""
        df = pl.DataFrame({"x": [1, 2]})
        lf = df.lazy()
        columns = [{"name": "x", "type": "Int64"}]

        result = _collect_sample_values(lf, columns)

        assert result is columns
        assert "sample_values" in columns[0]
