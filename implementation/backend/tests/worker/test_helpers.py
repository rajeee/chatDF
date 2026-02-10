"""Tests for data_worker private helper functions.

Covers: _is_csv_file, _is_tsv_file, _has_limit, _is_select, _resolve_url
"""

from __future__ import annotations

import pytest

from app.workers.data_worker import (
    _has_limit,
    _is_csv_file,
    _is_select,
    _is_tsv_file,
    _resolve_url,
)


# ---------------------------------------------------------------------------
# _is_csv_file
# ---------------------------------------------------------------------------


class TestIsCsvFile:
    """Tests for _is_csv_file helper."""

    def test_csv_extension(self):
        assert _is_csv_file("data.csv") is True

    def test_csv_uppercase(self):
        assert _is_csv_file("DATA.CSV") is True

    def test_csv_mixed_case(self):
        assert _is_csv_file("Report.Csv") is True

    def test_csv_gz_extension(self):
        assert _is_csv_file("data.csv.gz") is True

    def test_csv_gz_uppercase(self):
        assert _is_csv_file("DATA.CSV.GZ") is True

    def test_tsv_extension(self):
        assert _is_csv_file("data.tsv") is True

    def test_tsv_uppercase(self):
        assert _is_csv_file("DATA.TSV") is True

    def test_parquet_returns_false(self):
        assert _is_csv_file("data.parquet") is False

    def test_txt_returns_false(self):
        assert _is_csv_file("data.txt") is False

    def test_json_returns_false(self):
        assert _is_csv_file("data.json") is False

    def test_xlsx_returns_false(self):
        assert _is_csv_file("report.xlsx") is False

    def test_no_extension_returns_false(self):
        assert _is_csv_file("datafile") is False

    def test_full_url_csv(self):
        assert _is_csv_file("https://example.com/datasets/sales.csv") is True

    def test_full_url_csv_gz(self):
        assert _is_csv_file("https://example.com/data/archive.csv.gz") is True

    def test_full_url_tsv(self):
        assert _is_csv_file("http://example.com/data/export.tsv") is True

    def test_full_url_parquet(self):
        assert _is_csv_file("https://example.com/data/table.parquet") is False

    def test_url_with_query_params_after_csv(self):
        # The function checks endswith, so query params break the match
        assert _is_csv_file("https://example.com/data.csv?token=abc") is False

    def test_url_with_fragment_after_csv(self):
        assert _is_csv_file("https://example.com/data.csv#section") is False

    def test_local_path_csv(self):
        assert _is_csv_file("/tmp/uploads/my_data.csv") is True

    def test_local_path_csv_gz(self):
        assert _is_csv_file("/tmp/uploads/compressed.csv.gz") is True

    def test_local_path_parquet(self):
        assert _is_csv_file("/tmp/uploads/table.parquet") is False

    def test_empty_string(self):
        assert _is_csv_file("") is False

    def test_dot_csv_in_directory_name(self):
        # csv in path but not at end
        assert _is_csv_file("/data.csv/file.parquet") is False

    def test_csv_with_double_extension(self):
        # e.g. data.csv.bak — should be False
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

    def test_full_url_tsv(self):
        assert _is_tsv_file("https://example.com/export.tsv") is True

    def test_full_url_csv(self):
        assert _is_tsv_file("https://example.com/export.csv") is False

    def test_empty_string(self):
        assert _is_tsv_file("") is False

    def test_local_path_tsv(self):
        assert _is_tsv_file("/tmp/data/tab_separated.tsv") is True


# ---------------------------------------------------------------------------
# _has_limit
# ---------------------------------------------------------------------------


class TestHasLimit:
    """Tests for _has_limit SQL helper."""

    def test_simple_limit(self):
        assert _has_limit("SELECT * FROM t LIMIT 10") is True

    def test_no_limit(self):
        assert _has_limit("SELECT * FROM t") is False

    def test_limit_lowercase(self):
        assert _has_limit("select * from t limit 10") is True

    def test_limit_mixed_case(self):
        assert _has_limit("SELECT * FROM t Limit 50") is True

    def test_limit_inside_single_quoted_string(self):
        # LIMIT appears only inside a string literal — should be stripped
        assert _has_limit("SELECT * FROM t WHERE name = 'LIMIT 10'") is False

    def test_limit_inside_double_quoted_identifier(self):
        # LIMIT as part of a quoted identifier name — should be stripped
        assert _has_limit('SELECT "LIMIT" FROM t') is False

    def test_limit_in_line_comment(self):
        assert _has_limit("SELECT * FROM t -- LIMIT 10") is False

    def test_limit_in_block_comment(self):
        assert _has_limit("SELECT * FROM t /* LIMIT 10 */") is False

    def test_limit_in_multiline_block_comment(self):
        sql = "SELECT * FROM t /* some\nLIMIT 10\ncomment */"
        assert _has_limit(sql) is False

    def test_real_limit_plus_comment_limit(self):
        # One real LIMIT and one in a comment — should detect the real one
        sql = "SELECT * FROM t /* LIMIT 5 */ LIMIT 20"
        assert _has_limit(sql) is True

    def test_real_limit_with_string_limit(self):
        sql = "SELECT * FROM t WHERE x = 'no LIMIT here' LIMIT 100"
        assert _has_limit(sql) is True

    def test_empty_string(self):
        assert _has_limit("") is False

    def test_only_whitespace(self):
        assert _has_limit("   \n\t  ") is False

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

    def test_limit_as_substring_not_word(self):
        # "limited" contains "limit" but \bLIMIT\b should not match it
        assert _has_limit("SELECT * FROM limited_table") is False

    def test_limit_with_offset(self):
        assert _has_limit("SELECT * FROM t LIMIT 10 OFFSET 20") is True

    def test_limit_at_very_end_with_semicolon(self):
        assert _has_limit("SELECT * FROM t LIMIT 10;") is True

    def test_limit_in_subquery(self):
        sql = "SELECT * FROM (SELECT * FROM t LIMIT 5) sub"
        assert _has_limit(sql) is True

    def test_only_comment(self):
        assert _has_limit("-- LIMIT 10") is False

    def test_only_block_comment(self):
        assert _has_limit("/* LIMIT 10 */") is False


# ---------------------------------------------------------------------------
# _is_select
# ---------------------------------------------------------------------------


class TestIsSelect:
    """Tests for _is_select SQL helper."""

    def test_simple_select(self):
        assert _is_select("SELECT * FROM t") is True

    def test_select_lowercase(self):
        assert _is_select("select * from t") is True

    def test_select_mixed_case(self):
        assert _is_select("Select id From t") is True

    def test_with_cte(self):
        assert _is_select("WITH cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_with_lowercase(self):
        assert _is_select("with cte as (select 1) select * from cte") is True

    def test_leading_whitespace(self):
        assert _is_select("   SELECT * FROM t") is True

    def test_leading_newlines_and_tabs(self):
        assert _is_select("\n\t  SELECT * FROM t") is True

    def test_leading_parenthesis(self):
        assert _is_select("(SELECT * FROM t)") is True

    def test_multiple_leading_parentheses(self):
        assert _is_select("((SELECT * FROM t))") is True

    def test_leading_parens_with_spaces(self):
        # strip() removes outer whitespace, lstrip("(") removes "(", but
        # the space between "(" and "SELECT" remains, so startswith fails.
        assert _is_select("  ( SELECT * FROM t )") is False

    def test_paren_immediately_before_select(self):
        # No space between ( and SELECT — works correctly
        assert _is_select("  (SELECT * FROM t)") is True

    def test_insert_returns_false(self):
        assert _is_select("INSERT INTO t VALUES (1, 2)") is False

    def test_create_table_returns_false(self):
        assert _is_select("CREATE TABLE t (id INT)") is False

    def test_drop_table_returns_false(self):
        assert _is_select("DROP TABLE t") is False

    def test_delete_returns_false(self):
        assert _is_select("DELETE FROM t WHERE id = 1") is False

    def test_update_returns_false(self):
        assert _is_select("UPDATE t SET name = 'x' WHERE id = 1") is False

    def test_alter_table_returns_false(self):
        assert _is_select("ALTER TABLE t ADD COLUMN x INT") is False

    def test_truncate_returns_false(self):
        assert _is_select("TRUNCATE TABLE t") is False

    def test_empty_string(self):
        # After strip and lstrip, empty string — startswith returns False
        assert _is_select("") is False

    def test_only_whitespace(self):
        assert _is_select("   \n\t  ") is False

    def test_select_into(self):
        # SELECT INTO starts with SELECT, so it returns True
        assert _is_select("SELECT * INTO new_table FROM t") is True

    def test_explain_select(self):
        # EXPLAIN does not start with SELECT or WITH
        assert _is_select("EXPLAIN SELECT * FROM t") is False


# ---------------------------------------------------------------------------
# _resolve_url
# ---------------------------------------------------------------------------


class TestResolveUrl:
    """Tests for _resolve_url helper."""

    def test_file_uri_local_path(self):
        path, is_local = _resolve_url("file:///tmp/data.parquet")
        assert path == "/tmp/data.parquet"
        assert is_local is True

    def test_file_uri_nested_path(self):
        path, is_local = _resolve_url("file:///home/user/uploads/sales.csv")
        assert path == "/home/user/uploads/sales.csv"
        assert is_local is True

    def test_file_uri_with_spaces(self):
        path, is_local = _resolve_url("file:///tmp/my data/file.parquet")
        assert path == "/tmp/my data/file.parquet"
        assert is_local is True

    def test_https_url_unchanged(self):
        url = "https://example.com/data.parquet"
        result, is_local = _resolve_url(url)
        assert result == url
        assert is_local is False

    def test_http_url_unchanged(self):
        url = "http://example.com/data.csv"
        result, is_local = _resolve_url(url)
        assert result == url
        assert is_local is False

    def test_https_url_with_query_params(self):
        url = "https://example.com/data.parquet?token=abc123"
        result, is_local = _resolve_url(url)
        assert result == url
        assert is_local is False

    def test_file_uri_strips_exactly_file_prefix(self):
        # file:// is 7 characters; file:///tmp should yield /tmp
        path, is_local = _resolve_url("file:///tmp")
        assert path == "/tmp"
        assert is_local is True

    def test_non_file_non_http_url(self):
        # Something unusual like s3:// — returned unchanged, not local
        url = "s3://bucket/key.parquet"
        result, is_local = _resolve_url(url)
        assert result == url
        assert is_local is False

    def test_ftp_url_unchanged(self):
        url = "ftp://files.example.com/data.csv"
        result, is_local = _resolve_url(url)
        assert result == url
        assert is_local is False

    def test_file_uri_csv_gz(self):
        path, is_local = _resolve_url("file:///data/archive.csv.gz")
        assert path == "/data/archive.csv.gz"
        assert is_local is True

    def test_returns_tuple(self):
        result = _resolve_url("https://example.com/data.parquet")
        assert isinstance(result, tuple)
        assert len(result) == 2
