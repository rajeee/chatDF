"""Column profiling tests.

Tests profile_columns worker function for correct stats computation.
"""

from __future__ import annotations

import pytest

from app.workers.data_worker import profile_columns


class TestProfileColumns:
    """Tests for profile_columns worker function."""

    def test_profile_simple_parquet(self, simple_parquet_url):
        """Profile simple.parquet: 10 rows, 3 columns (id, name, value)."""
        result = profile_columns(simple_parquet_url)

        assert "error" not in result
        assert "profiles" in result

        profiles = result["profiles"]
        assert len(profiles) == 3

        # Build a lookup by name
        by_name = {p["name"]: p for p in profiles}

        # id column: integers 0..9
        id_prof = by_name["id"]
        assert id_prof["null_count"] == 0
        assert id_prof["null_percent"] == 0.0
        assert id_prof["unique_count"] == 10
        assert id_prof["min"] == 0
        assert id_prof["max"] == 9
        assert id_prof["mean"] == 4.5

        # name column: strings "item_0".."item_9"
        name_prof = by_name["name"]
        assert name_prof["null_count"] == 0
        assert name_prof["null_percent"] == 0.0
        assert name_prof["unique_count"] == 10
        assert "min_length" in name_prof
        assert "max_length" in name_prof
        assert name_prof["min_length"] >= 6  # "item_0" = 6 chars
        assert name_prof["max_length"] >= 6

        # value column: floats
        val_prof = by_name["value"]
        assert val_prof["null_count"] == 0
        assert val_prof["unique_count"] == 10
        assert val_prof["min"] == 0.0
        assert val_prof["max"] == 13.5  # 9 * 1.5
        assert isinstance(val_prof["mean"], float)

    def test_profile_handles_nulls(self, nulls_parquet_url):
        """Profile a dataset with null values in numeric and string columns."""
        result = profile_columns(nulls_parquet_url)

        assert "error" not in result
        profiles = result["profiles"]
        by_name = {p["name"]: p for p in profiles}

        # id column: no nulls
        assert by_name["id"]["null_count"] == 0
        assert by_name["id"]["null_percent"] == 0.0

        # score column: 2 nulls out of 5
        score_prof = by_name["score"]
        assert score_prof["null_count"] == 2
        assert score_prof["null_percent"] == 40.0
        assert score_prof["min"] == 10.0
        assert score_prof["max"] == 50.0

        # label column: 2 nulls out of 5, string lengths from non-null values
        label_prof = by_name["label"]
        assert label_prof["null_count"] == 2
        assert label_prof["null_percent"] == 40.0
        assert label_prof["min_length"] == 1  # "a"
        assert label_prof["max_length"] == 4  # "dddd"

    def test_profile_empty_dataset(self, empty_parquet_url):
        """Profile an empty parquet file (0 rows)."""
        result = profile_columns(empty_parquet_url)

        assert "error" not in result
        profiles = result["profiles"]
        assert len(profiles) == 2

        for profile in profiles:
            assert profile["null_count"] == 0
            assert profile["null_percent"] == 0.0
            assert profile["unique_count"] == 0

    def test_profile_returns_error_for_invalid_url(self, parquet_server):
        """Invalid URL returns an error dict."""
        result = profile_columns(f"{parquet_server}/nonexistent.parquet")

        assert "error" in result
        assert isinstance(result["error"], str)
