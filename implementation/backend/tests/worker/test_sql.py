"""SQL query execution tests.

Tests: worker/test.md#SQL-1 through SQL-5
"""

from __future__ import annotations

import pytest

from app.workers.data_worker import execute_query


class TestDatasetRegistration:
    """SQL-1: Datasets registered as named tables."""

    def test_single_table_query(self, sample_datasets):
        """Single dataset registered and queryable by table name."""
        result = execute_query("SELECT * FROM table1", sample_datasets)

        assert "error_type" not in result
        assert "rows" in result
        assert "columns" in result
        assert "total_rows" in result
        assert len(result["rows"]) == 10
        assert result["total_rows"] == 10

    def test_two_table_query(self, two_table_datasets):
        """Two datasets registered and both queryable."""
        # Query each table individually
        result1 = execute_query("SELECT COUNT(*) AS cnt FROM table1", two_table_datasets)
        assert "error_type" not in result1
        assert result1["rows"][0]["cnt"] == 10

        result2 = execute_query("SELECT COUNT(*) AS cnt FROM table2", two_table_datasets)
        assert "error_type" not in result2
        assert result2["rows"][0]["cnt"] == 2000


class TestSQLExecution:
    """SQL-2: SQL query execution returns correct results."""

    def test_select_with_where_clause(self, sample_datasets):
        """WHERE clause filters correctly."""
        result = execute_query("SELECT name FROM table1 WHERE id > 5", sample_datasets)

        assert "error_type" not in result
        # ids 6,7,8,9 => 4 rows
        assert len(result["rows"]) == 4
        assert result["total_rows"] == 4
        # Each row should have a 'name' key
        for row in result["rows"]:
            assert "name" in row

    def test_select_with_aggregation(self, sample_datasets):
        """Aggregation queries work."""
        result = execute_query("SELECT COUNT(*) AS cnt, AVG(value) AS avg_val FROM table1", sample_datasets)

        assert "error_type" not in result
        assert len(result["rows"]) == 1
        assert result["rows"][0]["cnt"] == 10

    def test_result_columns_returned(self, sample_datasets):
        """Result includes column names."""
        result = execute_query("SELECT id, name FROM table1 LIMIT 2", sample_datasets)

        assert "error_type" not in result
        assert "id" in result["columns"]
        assert "name" in result["columns"]

    def test_result_rows_are_dicts(self, sample_datasets):
        """Result rows are list of dicts."""
        result = execute_query("SELECT * FROM table1 LIMIT 1", sample_datasets)

        assert "error_type" not in result
        assert isinstance(result["rows"], list)
        assert isinstance(result["rows"][0], dict)


class TestResultRowLimit:
    """SQL-3: Result row limit of 1000."""

    def test_limit_1000_rows(self, large_datasets):
        """Query returning >1000 rows is truncated to 1000."""
        result = execute_query("SELECT * FROM big_table", large_datasets)

        assert "error_type" not in result
        assert len(result["rows"]) == 1000
        assert result["total_rows"] == 2000

    def test_under_limit_not_truncated(self, sample_datasets):
        """Query returning <1000 rows is not truncated."""
        result = execute_query("SELECT * FROM table1", sample_datasets)

        assert "error_type" not in result
        assert len(result["rows"]) == 10
        assert result["total_rows"] == 10


class TestSQLErrors:
    """SQL-4, SQL-5: SQL error handling."""

    def test_syntax_error(self, sample_datasets):
        """SQL-4: Invalid SQL returns structured error with error_type='sql'."""
        result = execute_query("SELEC * FROM table1", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result

    def test_missing_column_reference(self, sample_datasets):
        """SQL-5: Missing column returns structured error with error_type='sql'."""
        result = execute_query("SELECT nonexistent_col FROM table1", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result

    def test_missing_table_reference(self, sample_datasets):
        """Missing table returns structured error."""
        result = execute_query("SELECT * FROM no_such_table", sample_datasets)

        assert result["error_type"] == "sql"
        assert "message" in result
