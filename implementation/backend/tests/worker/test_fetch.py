"""Fetch and validation tests.

Tests: worker/test.md#FETCH-1, FETCH-2
"""

from __future__ import annotations

import functools
import http.server
import threading
import time
from unittest.mock import patch

import pytest

from app.workers.data_worker import fetch_and_validate


class TestParquetMagicNumber:
    """FETCH-1: Parquet magic number (PAR1) validation."""

    def test_valid_parquet_file(self, simple_parquet_url):
        """Valid parquet file passes validation."""
        result = fetch_and_validate(simple_parquet_url)
        assert result["valid"] is True
        assert result.get("error") is None

    def test_invalid_file_not_parquet(self, not_parquet_url):
        """Non-parquet file fails validation with appropriate error."""
        result = fetch_and_validate(not_parquet_url)
        assert result["valid"] is False
        assert "not a valid parquet file" in result["error"].lower()

    def test_empty_parquet_still_valid(self, empty_parquet_url):
        """Empty parquet (0 rows) is still a valid parquet file."""
        result = fetch_and_validate(empty_parquet_url)
        assert result["valid"] is True


class TestHeadRequestAccessibility:
    """FETCH-2: HEAD request URL accessibility check."""

    def test_accessible_url_returns_valid(self, simple_parquet_url):
        """URL responding with 200 is accessible."""
        result = fetch_and_validate(simple_parquet_url)
        assert result["valid"] is True

    def test_404_url_fails(self, parquet_server):
        """URL returning 404 fails validation."""
        result = fetch_and_validate(f"{parquet_server}/nonexistent.parquet")
        assert result["valid"] is False
        assert result["error"] is not None
        assert "error" in result["error"].lower() or "not" in result["error"].lower()

    def test_unreachable_host_fails(self):
        """URL with unresolvable host fails with network error."""
        result = fetch_and_validate("http://this-host-definitely-does-not-exist-xyz.invalid/file.parquet")
        assert result["valid"] is False
        assert result["error_type"] == "network"

    def test_connection_timeout_fails(self):
        """URL that doesn't respond within timeout fails."""
        # Use a non-routable IP to trigger a connection timeout
        # 192.0.2.1 is TEST-NET-1 (RFC 5737), should not be routable
        result = fetch_and_validate("http://192.0.2.1:12345/file.parquet")
        assert result["valid"] is False
        assert result["error_type"] == "network"
