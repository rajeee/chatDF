"""Tests for file_cache stale temp file cleanup."""

from __future__ import annotations

import os
import time
from unittest.mock import patch

import pytest

from app.workers import file_cache
from app.workers.file_cache import (
    CACHE_DIR,
    _cleanup_stale_temps,
    _cache_path,
    _ensure_cache_dir,
    cache_stats,
    clear_cache,
    get_cached,
)


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Redirect cache to a temporary directory for test isolation."""
    cache_dir = str(tmp_path / "cache")
    monkeypatch.setattr(file_cache, "CACHE_DIR", cache_dir)
    os.makedirs(cache_dir, exist_ok=True)
    yield cache_dir


class TestCleanupStaleTemps:
    """Verify stale .download_ temp files are removed."""

    def test_removes_old_temp_files(self, isolated_cache):
        # Create a stale temp file
        stale = os.path.join(isolated_cache, ".download_abc123.parquet")
        with open(stale, "w") as f:
            f.write("stale data")
        # Set mtime to 2 hours ago
        old_time = time.time() - 7200
        os.utime(stale, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == 1
        assert not os.path.exists(stale)

    def test_keeps_recent_temp_files(self, isolated_cache):
        # Create a recent temp file
        recent = os.path.join(isolated_cache, ".download_recent.parquet")
        with open(recent, "w") as f:
            f.write("downloading")

        removed = _cleanup_stale_temps()
        assert removed == 0
        assert os.path.exists(recent)

    def test_ignores_non_temp_files(self, isolated_cache):
        # Create a normal cache file
        normal = os.path.join(isolated_cache, "abc123.parquet")
        with open(normal, "w") as f:
            f.write("data")
        old_time = time.time() - 7200
        os.utime(normal, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == 0
        assert os.path.exists(normal)

    def test_handles_empty_cache_dir(self, isolated_cache):
        # Clear out the directory
        for f in os.listdir(isolated_cache):
            os.unlink(os.path.join(isolated_cache, f))
        removed = _cleanup_stale_temps()
        assert removed == 0

    def test_handles_missing_cache_dir(self, isolated_cache, monkeypatch):
        monkeypatch.setattr(file_cache, "CACHE_DIR", "/nonexistent/path/cache")
        removed = _cleanup_stale_temps()
        assert removed == 0


class TestCacheStats:
    """Verify cache_stats returns correct information."""

    def test_empty_cache(self, isolated_cache):
        s = cache_stats()
        assert s["file_count"] == 0
        assert s["total_size_bytes"] == 0

    def test_with_files(self, isolated_cache):
        f1 = os.path.join(isolated_cache, "test1.parquet")
        with open(f1, "w") as f:
            f.write("x" * 100)
        s = cache_stats()
        assert s["file_count"] == 1
        assert s["total_size_bytes"] == 100


class TestGetCached:
    """Verify get_cached returns path for cached URLs."""

    def test_miss_returns_none(self, isolated_cache):
        result = get_cached("https://example.com/missing.parquet")
        assert result is None

    def test_hit_returns_path(self, isolated_cache):
        url = "https://example.com/data.parquet"
        # Manually create the cached file
        path = _cache_path(url)
        with open(path, "w") as f:
            f.write("data")
        result = get_cached(url)
        assert result == path


class TestClearCache:
    """Verify clear_cache removes all files."""

    def test_clears_all(self, isolated_cache):
        for i in range(3):
            with open(os.path.join(isolated_cache, f"file{i}.parquet"), "w") as f:
                f.write("data")
        count = clear_cache()
        assert count == 3
        assert len(os.listdir(isolated_cache)) == 0

    def test_clear_empty(self, isolated_cache):
        count = clear_cache()
        assert count == 0
