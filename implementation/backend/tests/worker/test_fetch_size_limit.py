"""Tests for fetch_and_validate file size limit."""
import unittest
from unittest.mock import patch, MagicMock
from app.workers.data_worker import fetch_and_validate


class TestFetchSizeLimit(unittest.TestCase):
    """Verify that fetch_and_validate rejects oversized remote files."""

    @patch("app.workers.data_worker._validate_url_safety", return_value=None)
    @patch("app.workers.data_worker.urllib.request.urlopen")
    @patch("app.workers.data_worker.urllib.request.Request")
    def test_rejects_file_over_500mb(self, mock_req_cls, mock_urlopen, _mock_safety):
        """Files larger than 500 MB should be rejected early."""
        mock_resp = MagicMock()
        mock_resp.headers.get.return_value = str(600 * 1024 * 1024)  # 600 MB
        mock_urlopen.return_value = mock_resp

        result = fetch_and_validate("https://example.com/large.parquet")
        assert result["valid"] is False
        assert "too large" in result["error"]
        assert "500 MB" in result["error"]
        assert result["error_type"] == "validation"

    @patch("app.workers.data_worker._validate_url_safety", return_value=None)
    @patch("app.workers.data_worker.urllib.request.urlopen")
    @patch("app.workers.data_worker.urllib.request.Request")
    def test_accepts_file_under_500mb(self, mock_req_cls, mock_urlopen, _mock_safety):
        """Files under 500 MB should pass size check and proceed to magic bytes."""
        # HEAD response
        mock_head_resp = MagicMock()
        mock_head_resp.headers.get.return_value = str(100 * 1024 * 1024)  # 100 MB

        # GET response for magic bytes
        mock_get_resp = MagicMock()
        mock_get_resp.read.return_value = b"PAR1"
        mock_get_resp.__enter__ = lambda s: s
        mock_get_resp.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [mock_head_resp, mock_get_resp]

        result = fetch_and_validate("https://example.com/small.parquet")
        assert result["valid"] is True

    @patch("app.workers.data_worker._validate_url_safety", return_value=None)
    @patch("app.workers.data_worker.urllib.request.urlopen")
    @patch("app.workers.data_worker.urllib.request.Request")
    def test_allows_unknown_size(self, mock_req_cls, mock_urlopen, _mock_safety):
        """If Content-Length is missing, should proceed (size unknown)."""
        # HEAD response with no Content-Length
        mock_head_resp = MagicMock()
        mock_head_resp.headers.get.return_value = None

        # GET response for magic bytes
        mock_get_resp = MagicMock()
        mock_get_resp.read.return_value = b"PAR1"
        mock_get_resp.__enter__ = lambda s: s
        mock_get_resp.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [mock_head_resp, mock_get_resp]

        result = fetch_and_validate("https://example.com/unknown.parquet")
        assert result["valid"] is True

    @patch("app.workers.data_worker._validate_url_safety", return_value=None)
    @patch("app.workers.data_worker.urllib.request.urlopen")
    @patch("app.workers.data_worker.urllib.request.Request")
    def test_rejects_exactly_500mb(self, mock_req_cls, mock_urlopen, _mock_safety):
        """Files exactly at the 500 MB boundary should still pass (only > 500 MB rejected)."""
        mock_head_resp = MagicMock()
        mock_head_resp.headers.get.return_value = str(500 * 1024 * 1024)  # Exactly 500 MB

        # GET response for magic bytes
        mock_get_resp = MagicMock()
        mock_get_resp.read.return_value = b"PAR1"
        mock_get_resp.__enter__ = lambda s: s
        mock_get_resp.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [mock_head_resp, mock_get_resp]

        result = fetch_and_validate("https://example.com/exact500.parquet")
        assert result["valid"] is True


if __name__ == "__main__":
    unittest.main()
