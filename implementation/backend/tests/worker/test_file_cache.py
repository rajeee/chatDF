"""Tests for file_cache module.

Covers: _suffix_for_url, _cache_key, _cache_path, _ensure_cache_dir,
        get_cached, clear_cache, cache_stats, _cleanup_stale_temps, _evict_lru

All tests use a temporary directory patched as CACHE_DIR to avoid
touching the real cache on disk.
"""

from __future__ import annotations

import hashlib
import os
import time
from unittest.mock import patch

import pytest

from app.workers import file_cache
from app.workers.file_cache import (
    _cache_key,
    _cache_path,
    _cleanup_stale_temps,
    _ensure_cache_dir,
    _evict_lru,
    _suffix_for_url,
    cache_stats,
    clear_cache,
    get_cached,
)


# ---------------------------------------------------------------------------
# Fixture: redirect CACHE_DIR to a temporary directory for every test
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _use_tmp_cache_dir(tmp_path):
    """Patch CACHE_DIR to a fresh tmp_path for each test."""
    cache_dir = str(tmp_path / "cache")
    with patch.object(file_cache, "CACHE_DIR", cache_dir):
        yield cache_dir


@pytest.fixture
def cache_dir(_use_tmp_cache_dir):
    """Return the patched CACHE_DIR string and ensure it exists."""
    os.makedirs(_use_tmp_cache_dir, exist_ok=True)
    return _use_tmp_cache_dir


# ---------------------------------------------------------------------------
# 1. _suffix_for_url
# ---------------------------------------------------------------------------


class TestSuffixForUrl:
    """Tests for _suffix_for_url helper."""

    def test_parquet_default(self):
        """URLs without CSV/TSV markers default to .parquet."""
        assert _suffix_for_url("https://example.com/data.parquet") == ".parquet"

    def test_parquet_for_unknown_extension(self):
        """Unrecognised extension falls back to .parquet."""
        assert _suffix_for_url("https://example.com/data.json") == ".parquet"

    def test_csv_extension(self):
        """Explicit .csv extension maps to .csv."""
        assert _suffix_for_url("https://example.com/data.csv") == ".csv"

    def test_csv_in_url_path(self):
        """'.csv' appearing anywhere in the URL produces .csv."""
        assert _suffix_for_url("https://example.com/export.csv?token=abc") == ".csv"

    def test_tsv_extension(self):
        """Explicit .tsv extension maps to .tsv."""
        assert _suffix_for_url("https://example.com/data.tsv") == ".tsv"

    def test_tsv_in_url_path(self):
        """'.tsv' appearing anywhere in the URL produces .tsv."""
        assert _suffix_for_url("https://example.com/export.tsv?v=1") == ".tsv"

    def test_csv_gz_compressed(self):
        """Compressed .csv.gz URLs produce .csv.gz suffix."""
        assert _suffix_for_url("https://example.com/archive.csv.gz") == ".csv.gz"

    def test_csv_gz_uppercase(self):
        """Case-insensitive detection of .csv.gz."""
        assert _suffix_for_url("https://example.com/ARCHIVE.CSV.GZ") == ".csv.gz"

    def test_csv_before_tsv_priority(self):
        """When both .csv and .tsv appear, .csv wins (checked first after .csv.gz)."""
        # The function checks csv before tsv
        assert _suffix_for_url("https://example.com/data.csv.tsv") == ".csv"

    def test_empty_url_defaults_parquet(self):
        """Empty URL defaults to .parquet."""
        assert _suffix_for_url("") == ".parquet"


# ---------------------------------------------------------------------------
# 2. _cache_key
# ---------------------------------------------------------------------------


class TestCacheKey:
    """Tests for _cache_key helper."""

    def test_deterministic(self):
        """Same URL always produces the same key."""
        url = "https://example.com/data.parquet"
        assert _cache_key(url) == _cache_key(url)

    def test_is_sha256_hex(self):
        """Key is a 64-character hex SHA-256 digest."""
        key = _cache_key("https://example.com/data.parquet")
        assert len(key) == 64
        assert all(c in "0123456789abcdef" for c in key)

    def test_matches_manual_sha256(self):
        """Key matches a manually computed SHA-256."""
        url = "https://example.com/data.parquet"
        expected = hashlib.sha256(url.encode("utf-8")).hexdigest()
        assert _cache_key(url) == expected

    def test_different_urls_produce_different_keys(self):
        """Distinct URLs produce distinct cache keys."""
        key1 = _cache_key("https://example.com/a.parquet")
        key2 = _cache_key("https://example.com/b.parquet")
        assert key1 != key2

    def test_url_encoding_matters(self):
        """Trailing slash changes the key."""
        key1 = _cache_key("https://example.com/data")
        key2 = _cache_key("https://example.com/data/")
        assert key1 != key2


# ---------------------------------------------------------------------------
# 3. _cache_path
# ---------------------------------------------------------------------------


class TestCachePath:
    """Tests for _cache_path helper."""

    def test_includes_hash(self):
        """Cache path contains the SHA-256 hash."""
        url = "https://example.com/data.parquet"
        path = _cache_path(url)
        expected_hash = _cache_key(url)
        assert expected_hash in path

    def test_correct_suffix_parquet(self):
        """Cache path ends with .parquet for a parquet URL."""
        path = _cache_path("https://example.com/data.parquet")
        assert path.endswith(".parquet")

    def test_correct_suffix_csv(self):
        """Cache path ends with .csv for a CSV URL."""
        path = _cache_path("https://example.com/data.csv")
        assert path.endswith(".csv")

    def test_correct_suffix_tsv(self):
        """Cache path ends with .tsv for a TSV URL."""
        path = _cache_path("https://example.com/data.tsv")
        assert path.endswith(".tsv")

    def test_correct_suffix_csv_gz(self):
        """Cache path ends with .csv.gz for a compressed CSV URL."""
        path = _cache_path("https://example.com/data.csv.gz")
        assert path.endswith(".csv.gz")

    def test_path_in_cache_dir(self):
        """Cache path is inside CACHE_DIR."""
        path = _cache_path("https://example.com/data.parquet")
        assert path.startswith(file_cache.CACHE_DIR)

    def test_path_structure(self):
        """Cache path is CACHE_DIR / hash + suffix."""
        url = "https://example.com/data.csv"
        path = _cache_path(url)
        expected = os.path.join(file_cache.CACHE_DIR, _cache_key(url) + ".csv")
        assert path == expected


# ---------------------------------------------------------------------------
# 4. _ensure_cache_dir
# ---------------------------------------------------------------------------


class TestEnsureCacheDir:
    """Tests for _ensure_cache_dir helper."""

    def test_creates_directory_when_missing(self):
        """Cache directory is created if it does not exist."""
        assert not os.path.isdir(file_cache.CACHE_DIR)
        _ensure_cache_dir()
        assert os.path.isdir(file_cache.CACHE_DIR)

    def test_idempotent_when_exists(self):
        """Calling _ensure_cache_dir twice does not raise."""
        _ensure_cache_dir()
        _ensure_cache_dir()
        assert os.path.isdir(file_cache.CACHE_DIR)


# ---------------------------------------------------------------------------
# 5. get_cached: miss
# ---------------------------------------------------------------------------


class TestGetCachedMiss:
    """get_cached returns None for a missing file."""

    def test_returns_none_for_missing(self, cache_dir):
        """get_cached returns None when the file is not in the cache."""
        result = get_cached("https://example.com/nonexistent.parquet")
        assert result is None


# ---------------------------------------------------------------------------
# 6. get_cached: hit
# ---------------------------------------------------------------------------


class TestGetCachedHit:
    """get_cached returns path when file exists."""

    def test_returns_path_for_existing_file(self, cache_dir):
        """get_cached returns the file path when the cached file exists."""
        url = "https://example.com/data.parquet"
        path = _cache_path(url)
        # Create the file
        with open(path, "wb") as f:
            f.write(b"fake parquet data")

        result = get_cached(url)
        assert result == path
        assert os.path.isfile(result)


# ---------------------------------------------------------------------------
# 7. get_cached: touches access time
# ---------------------------------------------------------------------------


class TestGetCachedTouchesAtime:
    """get_cached touches the access time on cache hit."""

    def test_updates_access_time(self, cache_dir):
        """get_cached updates the file's modification time (utime)."""
        url = "https://example.com/data.parquet"
        path = _cache_path(url)
        with open(path, "wb") as f:
            f.write(b"data")

        # Set old access/modification times
        old_time = time.time() - 3600
        os.utime(path, (old_time, old_time))

        # Verify the old time was set
        stat_before = os.stat(path)
        assert stat_before.st_mtime == pytest.approx(old_time, abs=2)

        # Access via get_cached
        get_cached(url)

        stat_after = os.stat(path)
        # utime(path, None) sets both atime and mtime to current time
        assert stat_after.st_mtime > old_time + 3500


# ---------------------------------------------------------------------------
# 8. clear_cache: removes all cached files
# ---------------------------------------------------------------------------


class TestClearCacheRemovesFiles:
    """clear_cache removes all files from the cache directory."""

    def test_removes_all_files(self, cache_dir):
        """All files in the cache directory are removed."""
        # Create several files
        for i in range(5):
            path = os.path.join(cache_dir, f"file_{i}.parquet")
            with open(path, "wb") as f:
                f.write(b"x" * 100)

        assert len(os.listdir(cache_dir)) == 5

        clear_cache()

        assert len(os.listdir(cache_dir)) == 0


# ---------------------------------------------------------------------------
# 9. clear_cache: returns count
# ---------------------------------------------------------------------------


class TestClearCacheReturnsCount:
    """clear_cache returns the number of files removed."""

    def test_returns_count_of_removed_files(self, cache_dir):
        """Return value equals the number of files that were removed."""
        for i in range(3):
            path = os.path.join(cache_dir, f"file_{i}.parquet")
            with open(path, "wb") as f:
                f.write(b"x")

        count = clear_cache()
        assert count == 3

    def test_returns_zero_when_empty(self, cache_dir):
        """Returns 0 when the cache directory is empty."""
        count = clear_cache()
        assert count == 0

    def test_returns_zero_when_dir_missing(self):
        """Returns 0 when the cache directory does not exist."""
        count = clear_cache()
        assert count == 0


# ---------------------------------------------------------------------------
# 10. cache_stats: structure with defaults
# ---------------------------------------------------------------------------


class TestCacheStatsStructure:
    """cache_stats returns the correct structure."""

    def test_returns_expected_keys(self):
        """cache_stats dict has all required keys."""
        stats = cache_stats()
        assert "file_count" in stats
        assert "total_size_bytes" in stats
        assert "cache_dir" in stats
        assert "max_cache_bytes" in stats
        assert "max_file_bytes" in stats

    def test_defaults_when_dir_missing(self):
        """Returns zeros when the cache directory does not exist."""
        stats = cache_stats()
        assert stats["file_count"] == 0
        assert stats["total_size_bytes"] == 0

    def test_cache_dir_matches(self):
        """Reported cache_dir matches the current CACHE_DIR."""
        stats = cache_stats()
        assert stats["cache_dir"] == file_cache.CACHE_DIR

    def test_max_cache_bytes_is_int(self):
        """max_cache_bytes is an integer."""
        stats = cache_stats()
        assert isinstance(stats["max_cache_bytes"], int)

    def test_max_file_bytes_is_int(self):
        """max_file_bytes is an integer."""
        stats = cache_stats()
        assert isinstance(stats["max_file_bytes"], int)


# ---------------------------------------------------------------------------
# 11. cache_stats: counts files and sizes
# ---------------------------------------------------------------------------


class TestCacheStatsCountsFiles:
    """cache_stats correctly counts files and sums their sizes."""

    def test_counts_files(self, cache_dir):
        """file_count reflects the number of files."""
        for i in range(4):
            path = os.path.join(cache_dir, f"file_{i}.parquet")
            with open(path, "wb") as f:
                f.write(b"x" * (i + 1) * 10)

        stats = cache_stats()
        assert stats["file_count"] == 4

    def test_sums_sizes(self, cache_dir):
        """total_size_bytes equals the sum of all file sizes."""
        sizes = [100, 200, 300]
        for i, size in enumerate(sizes):
            path = os.path.join(cache_dir, f"file_{i}.parquet")
            with open(path, "wb") as f:
                f.write(b"x" * size)

        stats = cache_stats()
        assert stats["total_size_bytes"] == sum(sizes)

    def test_empty_dir(self, cache_dir):
        """Empty directory reports zero files and zero bytes."""
        stats = cache_stats()
        assert stats["file_count"] == 0
        assert stats["total_size_bytes"] == 0


# ---------------------------------------------------------------------------
# 12. _cleanup_stale_temps: removes old .download_ files
# ---------------------------------------------------------------------------


class TestCleanupStaleTempsRemovesOld:
    """_cleanup_stale_temps removes .download_ files older than STALE_TEMP_MAX_AGE."""

    def test_removes_old_temp_files(self, cache_dir):
        """Temp files older than STALE_TEMP_MAX_AGE are deleted."""
        old_temp = os.path.join(cache_dir, ".download_abc123.parquet")
        with open(old_temp, "wb") as f:
            f.write(b"stale temp data")

        # Set modification time to 2 hours ago (exceeds default 3600s)
        old_time = time.time() - 7200
        os.utime(old_temp, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == 1
        assert not os.path.exists(old_temp)

    def test_removes_multiple_stale_temps(self, cache_dir):
        """Multiple stale temp files are all removed."""
        for i in range(3):
            path = os.path.join(cache_dir, f".download_stale_{i}.csv")
            with open(path, "wb") as f:
                f.write(b"data")
            old_time = time.time() - 7200
            os.utime(path, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == 3

    def test_returns_zero_when_no_stale(self, cache_dir):
        """Returns 0 when there are no stale temp files."""
        removed = _cleanup_stale_temps()
        assert removed == 0


# ---------------------------------------------------------------------------
# 13. _cleanup_stale_temps: keeps recent .download_ files
# ---------------------------------------------------------------------------


class TestCleanupStaleTempsKeepsRecent:
    """_cleanup_stale_temps keeps .download_ files newer than STALE_TEMP_MAX_AGE."""

    def test_keeps_recent_temp_files(self, cache_dir):
        """Recently created temp files are not removed."""
        recent_temp = os.path.join(cache_dir, ".download_recent.parquet")
        with open(recent_temp, "wb") as f:
            f.write(b"active download")

        # File was just created, so mtime is current -- should be kept
        removed = _cleanup_stale_temps()
        assert removed == 0
        assert os.path.exists(recent_temp)

    def test_mixed_old_and_new(self, cache_dir):
        """Only old temp files are removed; recent ones are kept."""
        old_path = os.path.join(cache_dir, ".download_old.csv")
        with open(old_path, "wb") as f:
            f.write(b"old")
        os.utime(old_path, (time.time() - 7200, time.time() - 7200))

        new_path = os.path.join(cache_dir, ".download_new.csv")
        with open(new_path, "wb") as f:
            f.write(b"new")

        removed = _cleanup_stale_temps()
        assert removed == 1
        assert not os.path.exists(old_path)
        assert os.path.exists(new_path)

    def test_ignores_non_download_files(self, cache_dir):
        """Files that don't start with .download_ are ignored."""
        regular_file = os.path.join(cache_dir, "regular_file.parquet")
        with open(regular_file, "wb") as f:
            f.write(b"data")
        old_time = time.time() - 7200
        os.utime(regular_file, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == 0
        assert os.path.exists(regular_file)


# ---------------------------------------------------------------------------
# 14. _evict_lru: evicts oldest files when over size limit
# ---------------------------------------------------------------------------


class TestEvictLru:
    """_evict_lru evicts least-recently-used files when cache exceeds MAX_CACHE_BYTES."""

    def test_evicts_oldest_files(self, cache_dir):
        """Oldest accessed files are evicted first when over the size limit."""
        # Set a small MAX_CACHE_BYTES to trigger eviction
        with patch.object(file_cache, "MAX_CACHE_BYTES", 300):
            # Create 5 files of 100 bytes each (total 500 > limit 300)
            paths = []
            for i in range(5):
                path = os.path.join(cache_dir, f"file_{i}.parquet")
                with open(path, "wb") as f:
                    f.write(b"x" * 100)
                # Set ascending access times so file_0 is oldest
                atime = time.time() - (500 - i * 100)
                os.utime(path, (atime, atime))
                paths.append(path)

            _evict_lru()

            # Total was 500, limit is 300, so need to remove at least 200 bytes = 2 files
            # The 2 oldest (file_0, file_1) should be evicted
            assert not os.path.exists(paths[0]), "Oldest file should be evicted"
            assert not os.path.exists(paths[1]), "Second oldest file should be evicted"

            # At least 3 files should remain
            remaining = [p for p in paths if os.path.exists(p)]
            assert len(remaining) >= 3

    def test_no_eviction_when_under_limit(self, cache_dir):
        """No files are evicted when total size is under the limit."""
        with patch.object(file_cache, "MAX_CACHE_BYTES", 10000):
            for i in range(3):
                path = os.path.join(cache_dir, f"file_{i}.parquet")
                with open(path, "wb") as f:
                    f.write(b"x" * 100)

            _evict_lru()

            # All files should remain
            remaining = os.listdir(cache_dir)
            assert len(remaining) == 3

    def test_eviction_stops_at_limit(self, cache_dir):
        """Eviction stops once total size drops to or below the limit."""
        with patch.object(file_cache, "MAX_CACHE_BYTES", 200):
            # Create 4 files of 100 bytes each (total 400)
            for i in range(4):
                path = os.path.join(cache_dir, f"file_{i}.parquet")
                with open(path, "wb") as f:
                    f.write(b"x" * 100)
                atime = time.time() - (400 - i * 100)
                os.utime(path, (atime, atime))

            _evict_lru()

            # Need to evict 200 bytes = 2 files, keeping 2
            remaining = [f for f in os.listdir(cache_dir) if not f.startswith(".download_")]
            assert len(remaining) == 2

    def test_eviction_with_empty_dir(self, cache_dir):
        """Eviction on an empty directory does nothing."""
        with patch.object(file_cache, "MAX_CACHE_BYTES", 0):
            _evict_lru()  # Should not raise
            assert len(os.listdir(cache_dir)) == 0

    def test_eviction_when_dir_missing(self):
        """Eviction when cache directory doesn't exist does not raise."""
        with patch.object(file_cache, "MAX_CACHE_BYTES", 0):
            _evict_lru()  # Should not raise
