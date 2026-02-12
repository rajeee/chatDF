"""Tests for data_worker helper functions."""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.workers.data_worker import (
    _is_csv_file,
    _is_tsv_file,
    _has_limit,
    _is_select,
    _validate_url_safety,
)


# ---------------------------------------------------------------------------
# _is_csv_file
# ---------------------------------------------------------------------------

class TestIsCsvFile:
    def test_csv_extension(self):
        assert _is_csv_file("data.csv") is True

    def test_csv_gz_extension(self):
        assert _is_csv_file("data.csv.gz") is True

    def test_tsv_extension(self):
        assert _is_csv_file("data.tsv") is True

    def test_parquet_extension(self):
        assert _is_csv_file("data.parquet") is False

    def test_json_extension(self):
        assert _is_csv_file("data.json") is False

    def test_csv_mixed_case(self):
        assert _is_csv_file("DATA.CSV") is True

    def test_csv_gz_mixed_case(self):
        assert _is_csv_file("archive.CSV.GZ") is True

    def test_url_with_csv(self):
        assert _is_csv_file("https://example.com/files/report.csv") is True


# ---------------------------------------------------------------------------
# _is_tsv_file
# ---------------------------------------------------------------------------

class TestIsTsvFile:
    def test_tsv_extension(self):
        assert _is_tsv_file("data.tsv") is True

    def test_csv_extension(self):
        assert _is_tsv_file("data.csv") is False

    def test_parquet_extension(self):
        assert _is_tsv_file("data.parquet") is False

    def test_tsv_mixed_case(self):
        assert _is_tsv_file("DATA.TSV") is True


# ---------------------------------------------------------------------------
# _has_limit
# ---------------------------------------------------------------------------

class TestHasLimit:
    def test_limit_present(self):
        assert _has_limit("SELECT * FROM t LIMIT 10") is True

    def test_no_limit(self):
        assert _has_limit("SELECT * FROM t") is False

    def test_limit_inside_string_literal(self):
        assert _has_limit("SELECT * FROM t WHERE name = 'LIMIT 10'") is False

    def test_limit_in_single_line_comment(self):
        assert _has_limit("SELECT * FROM t -- LIMIT 10") is False

    def test_limit_in_block_comment(self):
        assert _has_limit("SELECT * FROM t /* LIMIT 10 */") is False

    def test_cte_with_limit(self):
        sql = "WITH cte AS (SELECT * FROM t LIMIT 5) SELECT * FROM cte"
        assert _has_limit(sql) is True

    def test_limit_at_end(self):
        assert _has_limit("SELECT id, name FROM t\nLIMIT 100;") is True

    def test_subquery_with_limit(self):
        sql = "SELECT * FROM (SELECT * FROM t LIMIT 50) sub"
        assert _has_limit(sql) is True

    def test_limit_lowercase(self):
        assert _has_limit("select * from t limit 20") is True

    def test_limit_in_double_quoted_identifier(self):
        assert _has_limit('SELECT "LIMIT" FROM t') is False


# ---------------------------------------------------------------------------
# _is_select
# ---------------------------------------------------------------------------

class TestIsSelect:
    def test_select(self):
        assert _is_select("SELECT * FROM t") is True

    def test_with_select(self):
        assert _is_select("WITH cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_insert(self):
        assert _is_select("INSERT INTO t VALUES (1)") is False

    def test_update(self):
        assert _is_select("UPDATE t SET x = 1") is False

    def test_delete(self):
        assert _is_select("DELETE FROM t") is False

    def test_create_table(self):
        assert _is_select("CREATE TABLE t (id INT)") is False

    def test_drop_table(self):
        assert _is_select("DROP TABLE t") is False

    def test_mixed_case_select(self):
        assert _is_select("select * from t") is True

    def test_leading_whitespace(self):
        assert _is_select("  SELECT 1") is True


# ---------------------------------------------------------------------------
# _validate_url_safety
# ---------------------------------------------------------------------------

class TestValidateUrlSafety:
    """Test URL safety validation with CHATDF_ALLOW_PRIVATE_URLS cleared."""

    @pytest.fixture(autouse=True)
    def _clear_allow_private(self, monkeypatch):
        """Ensure private-URL rejection is active for every test in this class."""
        monkeypatch.delenv("CHATDF_ALLOW_PRIVATE_URLS", raising=False)

    def test_valid_https_url(self):
        # Patch DNS so it resolves to a public IP
        with patch("socket.gethostbyname", return_value="93.184.216.34"):
            assert _validate_url_safety("https://example.com/data.csv") is None

    def test_valid_http_url(self):
        with patch("socket.gethostbyname", return_value="93.184.216.34"):
            assert _validate_url_safety("http://example.com/data.csv") is None

    def test_ftp_rejected(self):
        result = _validate_url_safety("ftp://example.com/data.csv")
        assert result is not None
        assert result["valid"] is False
        assert "Unsupported URL scheme" in result["error"]

    def test_private_ip_10x_rejected(self):
        with patch("socket.gethostbyname", return_value="10.0.0.1"):
            result = _validate_url_safety("https://internal.corp/data.csv")
            assert result is not None
            assert result["valid"] is False
            assert "private" in result["error"].lower() or "internal" in result["error"].lower()

    def test_loopback_127x_rejected(self):
        with patch("socket.gethostbyname", return_value="127.0.0.1"):
            result = _validate_url_safety("https://localhost/data.csv")
            assert result is not None
            assert result["valid"] is False

    def test_private_ip_172_16_rejected(self):
        with patch("socket.gethostbyname", return_value="172.16.0.1"):
            result = _validate_url_safety("https://internal.example.com/data.csv")
            assert result is not None
            assert result["valid"] is False

    def test_private_ip_192_168_rejected(self):
        with patch("socket.gethostbyname", return_value="192.168.1.1"):
            result = _validate_url_safety("https://router.local/data.csv")
            assert result is not None
            assert result["valid"] is False

    def test_file_url_allowed(self):
        assert _validate_url_safety("file:///tmp/data.csv") is None

    def test_no_hostname_rejected(self):
        result = _validate_url_safety("https:///no-host")
        assert result is not None
        assert result["valid"] is False
        assert "hostname" in result["error"].lower()

    def test_normal_public_hostname(self):
        with patch("socket.gethostbyname", return_value="151.101.1.67"):
            assert _validate_url_safety("https://data.gov/file.parquet") is None
