"""Tests for URL safety validation (SSRF prevention).

Tests the _validate_url_safety function in data_worker.py which
prevents loading datasets from private/internal networks.
"""

from __future__ import annotations
import os
from unittest.mock import patch

import pytest

from app.workers.data_worker import _validate_url_safety


@pytest.fixture(autouse=True)
def _disable_allow_private_urls():
    """Temporarily unset CHATDF_ALLOW_PRIVATE_URLS so SSRF checks are active."""
    old = os.environ.pop("CHATDF_ALLOW_PRIVATE_URLS", None)
    yield
    if old is not None:
        os.environ["CHATDF_ALLOW_PRIVATE_URLS"] = old


class TestUrlSchemeValidation:
    """Only http and https schemes should be allowed."""

    def test_http_allowed(self):
        result = _validate_url_safety("http://example.com/data.parquet")
        assert result is None

    def test_https_allowed(self):
        result = _validate_url_safety("https://example.com/data.parquet")
        assert result is None

    def test_file_url_allowed(self):
        """file:// URLs are for uploaded files and should pass."""
        result = _validate_url_safety("file:///tmp/data.parquet")
        assert result is None

    def test_ftp_rejected(self):
        result = _validate_url_safety("ftp://example.com/data.parquet")
        assert result is not None
        assert result["valid"] is False
        assert "ftp" in result["error"].lower()

    def test_javascript_rejected(self):
        result = _validate_url_safety("javascript:alert(1)")
        assert result is not None
        assert result["valid"] is False

    def test_data_uri_rejected(self):
        result = _validate_url_safety("data:text/csv,a,b,c")
        assert result is not None
        assert result["valid"] is False


class TestHostnameValidation:
    """URLs must have a valid hostname."""

    def test_no_hostname_rejected(self):
        result = _validate_url_safety("http:///path/to/file")
        assert result is not None
        assert result["valid"] is False
        assert "hostname" in result["error"].lower()


class TestPrivateIpRejection:
    """Private and internal IP addresses should be rejected."""

    @patch("socket.gethostbyname")
    def test_loopback_rejected(self, mock_dns):
        mock_dns.return_value = "127.0.0.1"
        result = _validate_url_safety("http://localhost/data.parquet")
        assert result is not None
        assert result["valid"] is False
        assert "internal" in result["error"].lower() or "private" in result["error"].lower()

    @patch("socket.gethostbyname")
    def test_private_10_rejected(self, mock_dns):
        mock_dns.return_value = "10.0.0.1"
        result = _validate_url_safety("http://internal-server/data.parquet")
        assert result is not None
        assert result["valid"] is False

    @patch("socket.gethostbyname")
    def test_private_172_rejected(self, mock_dns):
        mock_dns.return_value = "172.16.0.1"
        result = _validate_url_safety("http://internal-server/data.parquet")
        assert result is not None
        assert result["valid"] is False

    @patch("socket.gethostbyname")
    def test_private_192_rejected(self, mock_dns):
        mock_dns.return_value = "192.168.1.1"
        result = _validate_url_safety("http://home-server/data.parquet")
        assert result is not None
        assert result["valid"] is False

    @patch("socket.gethostbyname")
    def test_link_local_rejected(self, mock_dns):
        mock_dns.return_value = "169.254.0.1"
        result = _validate_url_safety("http://link-local/data.parquet")
        assert result is not None
        assert result["valid"] is False

    @patch("socket.gethostbyname")
    def test_public_ip_allowed(self, mock_dns):
        mock_dns.return_value = "93.184.216.34"
        result = _validate_url_safety("http://example.com/data.parquet")
        assert result is None

    @patch("socket.gethostbyname")
    def test_dns_failure_passes_through(self, mock_dns):
        """If DNS resolution fails, let the download handle it."""
        import socket
        mock_dns.side_effect = socket.gaierror("DNS lookup failed")
        result = _validate_url_safety("http://nonexistent.example.com/data.parquet")
        assert result is None  # passes through, download will fail later


class TestFetchAndValidateIntegration:
    """Integration test: fetch_and_validate should call URL safety check."""

    @patch("socket.gethostbyname")
    def test_fetch_and_validate_rejects_private_ip(self, mock_dns):
        from app.workers.data_worker import fetch_and_validate
        mock_dns.return_value = "10.0.0.1"
        result = fetch_and_validate("http://internal-server/data.parquet")
        assert result["valid"] is False
        assert "internal" in result["error"].lower() or "private" in result["error"].lower()
