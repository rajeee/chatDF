"""Schema extraction tests.

Tests: worker/test.md#SCHEMA-1
"""

from __future__ import annotations

import pytest

from app.workers.data_worker import extract_schema


class TestSchemaExtraction:
    """SCHEMA-1: Schema extraction via Polars scan_parquet."""

    def test_extract_schema_simple(self, simple_parquet_url):
        """Extract schema from simple.parquet: 10 rows, 3 columns."""
        result = extract_schema(simple_parquet_url)

        # Should not be an error
        assert "error_type" not in result

        # Check columns
        columns = result["columns"]
        assert len(columns) == 3

        # Column names and types
        col_names = [c["name"] for c in columns]
        assert "id" in col_names
        assert "name" in col_names
        assert "value" in col_names

        # Check types are strings
        for col in columns:
            assert isinstance(col["type"], str)
            assert len(col["type"]) > 0

        # Row count
        assert result["row_count"] == 10

    def test_extract_schema_empty_parquet(self, empty_parquet_url):
        """Edge case: Empty parquet (0 rows) still returns columns and row_count=0."""
        result = extract_schema(empty_parquet_url)

        assert "error_type" not in result
        assert result["row_count"] == 0
        assert len(result["columns"]) == 2

    def test_extract_schema_wide_parquet(self, wide_parquet_url):
        """Edge case: Wide parquet (100 columns) returns all columns."""
        result = extract_schema(wide_parquet_url)

        assert "error_type" not in result
        assert len(result["columns"]) == 100
        assert result["row_count"] == 5

    def test_extract_schema_large_parquet(self, large_parquet_url):
        """Large parquet (2000 rows) returns correct row count."""
        result = extract_schema(large_parquet_url)

        assert "error_type" not in result
        assert result["row_count"] == 2000
        assert len(result["columns"]) == 2

    def test_extract_schema_invalid_url(self, parquet_server):
        """Invalid URL returns structured error."""
        result = extract_schema(f"{parquet_server}/nonexistent.parquet")

        assert "error_type" in result
        assert result["error_type"] in ("network", "validation")
        assert "message" in result


class TestColumnStatsInSchema:
    """Column statistics are computed during schema extraction."""

    def test_simple_parquet_has_column_stats(self, simple_parquet_url):
        """Every column in simple.parquet should have a column_stats dict."""
        result = extract_schema(simple_parquet_url)
        assert "error_type" not in result

        for col in result["columns"]:
            assert "column_stats" in col, f"Missing column_stats for {col['name']}"
            assert isinstance(col["column_stats"], dict)

    def test_numeric_column_has_min_max(self, simple_parquet_url):
        """Numeric columns (id, value) should have min and max in stats."""
        result = extract_schema(simple_parquet_url)
        columns = {c["name"]: c for c in result["columns"]}

        # 'id' is Int64, values 0..9
        id_stats = columns["id"]["column_stats"]
        assert "min" in id_stats
        assert "max" in id_stats
        assert id_stats["min"] == 0
        assert id_stats["max"] == 9

        # 'value' is Float64, values 0.0, 1.5, ..., 13.5
        val_stats = columns["value"]["column_stats"]
        assert "min" in val_stats
        assert "max" in val_stats
        assert val_stats["min"] == 0.0
        assert val_stats["max"] == 13.5

    def test_string_column_has_unique_count(self, simple_parquet_url):
        """String column 'name' should have unique_count in stats."""
        result = extract_schema(simple_parquet_url)
        columns = {c["name"]: c for c in result["columns"]}

        name_stats = columns["name"]["column_stats"]
        assert "unique_count" in name_stats
        assert name_stats["unique_count"] == 10  # 10 unique item_0..item_9

    def test_null_count_present_when_nulls_exist(self, nulls_parquet_url):
        """Columns with nulls should report null_count in stats."""
        result = extract_schema(nulls_parquet_url)
        columns = {c["name"]: c for c in result["columns"]}

        # 'score' has 2 nulls
        score_stats = columns["score"]["column_stats"]
        assert "null_count" in score_stats
        assert score_stats["null_count"] == 2

        # 'label' has 2 nulls
        label_stats = columns["label"]["column_stats"]
        assert "null_count" in label_stats
        assert label_stats["null_count"] == 2

    def test_no_null_count_when_no_nulls(self, simple_parquet_url):
        """Columns without nulls should NOT have null_count in stats."""
        result = extract_schema(simple_parquet_url)
        columns = {c["name"]: c for c in result["columns"]}

        # 'id' has no nulls
        id_stats = columns["id"]["column_stats"]
        assert "null_count" not in id_stats

    def test_empty_parquet_has_column_stats(self, empty_parquet_url):
        """Empty parquet columns should still have column_stats (may be empty)."""
        result = extract_schema(empty_parquet_url)
        assert "error_type" not in result

        for col in result["columns"]:
            assert "column_stats" in col

    def test_column_stats_serializable(self, nulls_parquet_url):
        """Column stats should be JSON-serializable (stored in schema_json)."""
        import json

        result = extract_schema(nulls_parquet_url)
        # The full columns list must round-trip through JSON
        serialized = json.dumps(result["columns"])
        deserialized = json.loads(serialized)
        assert len(deserialized) == len(result["columns"])
        for col in deserialized:
            assert "column_stats" in col
