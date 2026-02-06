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
