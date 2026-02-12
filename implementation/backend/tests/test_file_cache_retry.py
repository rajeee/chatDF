"""Tests for file_cache download retry logic."""
import os
import urllib.error
from unittest.mock import patch, MagicMock
import pytest

from app.workers.file_cache import download_and_cache, CACHE_DIR, _cache_path


@pytest.fixture(autouse=True)
def clean_cache(tmp_path, monkeypatch):
    """Use a temp directory for cache during tests."""
    monkeypatch.setattr("app.workers.file_cache.CACHE_DIR", str(tmp_path))
    monkeypatch.setattr("app.workers.file_cache.MAX_FILE_BYTES", 10 * 1024 * 1024)
    yield


class TestDownloadRetry:
    """Tests for download retry with exponential backoff."""

    def test_succeeds_on_first_attempt(self, tmp_path, monkeypatch):
        """Download succeeds on first try — no retry needed."""
        monkeypatch.setattr("app.workers.file_cache.CACHE_DIR", str(tmp_path))
        content = b"PAR1" + b"\x00" * 100

        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read = MagicMock(side_effect=[content, b""])
        mock_resp.headers = {"Content-Length": str(len(content))}

        with patch("app.workers.file_cache.urllib.request.urlopen", return_value=mock_resp) as mock_open:
            result = download_and_cache("https://example.com/data.parquet")
            assert os.path.isfile(result)
            # HEAD + 1 download call = 2 calls
            assert mock_open.call_count == 2

    def test_retries_on_transient_error(self, tmp_path, monkeypatch):
        """Download retries on URLError and succeeds on second attempt."""
        monkeypatch.setattr("app.workers.file_cache.CACHE_DIR", str(tmp_path))
        content = b"PAR1" + b"\x00" * 100

        good_resp = MagicMock()
        good_resp.__enter__ = MagicMock(return_value=good_resp)
        good_resp.__exit__ = MagicMock(return_value=False)
        good_resp.read = MagicMock(side_effect=[content, b""])
        good_resp.headers = {"Content-Length": str(len(content))}

        head_resp = MagicMock()
        head_resp.__enter__ = MagicMock(return_value=head_resp)
        head_resp.__exit__ = MagicMock(return_value=False)
        head_resp.headers = {"Content-Length": str(len(content))}

        call_count = 0
        def side_effect(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return head_resp  # HEAD request
            elif call_count == 2:
                raise urllib.error.URLError("Connection refused")  # 1st download attempt fails
            else:
                return good_resp  # 2nd download attempt succeeds

        with patch("app.workers.file_cache.urllib.request.urlopen", side_effect=side_effect):
            with patch("time.sleep") as mock_sleep:
                result = download_and_cache("https://example.com/retry.parquet")
                assert os.path.isfile(result)

    def test_no_retry_on_size_limit(self, tmp_path, monkeypatch):
        """ValueError from size limit is NOT retried."""
        monkeypatch.setattr("app.workers.file_cache.CACHE_DIR", str(tmp_path))
        monkeypatch.setattr("app.workers.file_cache.MAX_FILE_BYTES", 10)  # Tiny limit

        content = b"PAR1" + b"\x00" * 100  # Exceeds 10 bytes

        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read = MagicMock(side_effect=[content, b""])

        head_resp = MagicMock()
        head_resp.__enter__ = MagicMock(return_value=head_resp)
        head_resp.__exit__ = MagicMock(return_value=False)
        head_resp.headers = {}  # No Content-Length to skip HEAD check

        call_count = 0
        def side_effect(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return head_resp
            return mock_resp

        with patch("app.workers.file_cache.urllib.request.urlopen", side_effect=side_effect):
            with pytest.raises(ValueError, match="size limit"):
                download_and_cache("https://example.com/big.parquet")

    def test_exhausts_retries_raises(self, tmp_path, monkeypatch):
        """After 3 failed attempts, raises the last error."""
        monkeypatch.setattr("app.workers.file_cache.CACHE_DIR", str(tmp_path))

        head_resp = MagicMock()
        head_resp.__enter__ = MagicMock(return_value=head_resp)
        head_resp.__exit__ = MagicMock(return_value=False)
        head_resp.headers = {}

        call_count = 0
        def side_effect(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return head_resp
            raise urllib.error.URLError("Connection refused")

        with patch("app.workers.file_cache.urllib.request.urlopen", side_effect=side_effect):
            with patch("time.sleep"):
                with pytest.raises(urllib.error.URLError):
                    download_and_cache("https://example.com/fail.parquet")
