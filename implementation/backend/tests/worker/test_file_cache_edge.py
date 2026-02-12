"""Edge-case tests for file_cache module.

Supplements test_file_cache.py with deeper coverage of:
- _suffix_for_url with query params, fragments, tricky hostnames, unusual paths
- cache_stats on missing / empty / populated directories
- startup_cleanup orchestration (creates dir, cleans temps, runs eviction)
- _cleanup_stale_temps boundary conditions (exact threshold, empty dir, missing dir,
  subdirectories, non-file entries)
"""

from __future__ import annotations

import os
import time
from unittest.mock import patch

import pytest

from app.workers import file_cache
from app.workers.file_cache import (
    STALE_TEMP_MAX_AGE,
    _cleanup_stale_temps,
    _suffix_for_url,
    cache_stats,
    startup_cleanup,
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


# ===========================================================================
# 1. _suffix_for_url — edge cases
# ===========================================================================


class TestSuffixForUrlQueryParams:
    """_suffix_for_url with query parameters in the URL."""

    def test_parquet_with_query_params(self):
        """Query params after .parquet should still yield .parquet."""
        # No .csv or .tsv substring anywhere → falls through to .parquet
        assert _suffix_for_url("https://example.com/data.parquet?token=xyz") == ".parquet"

    def test_csv_with_query_params(self):
        """.csv before query string is detected via substring match."""
        assert _suffix_for_url("https://example.com/data.csv?token=xyz") == ".csv"

    def test_tsv_with_query_params(self):
        """.tsv before query string is detected via substring match."""
        assert _suffix_for_url("https://example.com/data.tsv?version=2") == ".tsv"

    def test_csv_gz_with_query_params(self):
        """csv.gz ending is NOT detected when query params follow."""
        # endswith(".csv.gz") fails because the URL ends with the query string;
        # but ".csv" in lower matches, so it returns .csv
        url = "https://example.com/data.csv.gz?token=abc"
        result = _suffix_for_url(url)
        assert result == ".csv"

    def test_query_param_value_contains_csv(self):
        """If only the query param value contains .csv, it still matches."""
        # ".csv" appears in the query string value → substring match triggers
        url = "https://example.com/data.parquet?format=.csv"
        assert _suffix_for_url(url) == ".csv"


class TestSuffixForUrlFragments:
    """_suffix_for_url with URL fragments."""

    def test_parquet_with_fragment(self):
        """Fragment after .parquet doesn't interfere."""
        assert _suffix_for_url("https://example.com/data.parquet#section") == ".parquet"

    def test_csv_with_fragment(self):
        """.csv in path is detected even with a trailing fragment."""
        assert _suffix_for_url("https://example.com/data.csv#row5") == ".csv"

    def test_fragment_contains_csv(self):
        """If only the fragment contains .csv, substring match triggers."""
        url = "https://example.com/data.parquet#.csv"
        assert _suffix_for_url(url) == ".csv"


class TestSuffixForUrlNoExtension:
    """_suffix_for_url when the URL has no recognizable file extension."""

    def test_no_extension_defaults_to_parquet(self):
        """URL with no file extension at all defaults to .parquet."""
        assert _suffix_for_url("https://example.com/data") == ".parquet"

    def test_numeric_path_defaults_to_parquet(self):
        """Numeric-only path segment defaults to .parquet."""
        assert _suffix_for_url("https://example.com/12345") == ".parquet"

    def test_slash_only_defaults_to_parquet(self):
        """Root URL path defaults to .parquet."""
        assert _suffix_for_url("https://example.com/") == ".parquet"

    def test_deeply_nested_path_no_extension(self):
        """Deeply nested path with no extension defaults to .parquet."""
        assert _suffix_for_url("https://example.com/a/b/c/d/e/f") == ".parquet"


class TestSuffixForUrlHostnameSubstring:
    """_suffix_for_url substring matching checks for '.csv' / '.tsv' (with dot)."""

    def test_csv_in_hostname_without_dot_no_match(self):
        """Hostname containing 'csv' but not '.csv' does NOT trigger match."""
        # "csvhost.com" contains "csv" but not ".csv" — defaults to .parquet
        url = "https://csvhost.com/data.parquet"
        assert _suffix_for_url(url) == ".parquet"

    def test_tsv_in_hostname_without_dot_no_match(self):
        """Hostname containing 'tsv' but not '.tsv' does NOT trigger match."""
        url = "https://tsvdata.com/data.parquet"
        assert _suffix_for_url(url) == ".parquet"

    def test_dot_csv_in_hostname_triggers_match(self):
        """Hostname containing '.csv' (with dot) DOES trigger match."""
        # "data.csv.example.com" contains ".csv"
        url = "https://data.csv.example.com/file.parquet"
        assert _suffix_for_url(url) == ".csv"

    def test_dot_tsv_in_hostname_triggers_match(self):
        """Hostname containing '.tsv' (with dot) DOES trigger match."""
        url = "https://data.tsv.example.com/file.parquet"
        assert _suffix_for_url(url) == ".tsv"


class TestSuffixForUrlCaseInsensitivity:
    """_suffix_for_url is case-insensitive."""

    def test_uppercase_csv(self):
        """Uppercase .CSV is detected."""
        assert _suffix_for_url("https://example.com/data.CSV") == ".csv"

    def test_mixed_case_csv_gz(self):
        """Mixed case .Csv.Gz is detected."""
        assert _suffix_for_url("https://example.com/data.Csv.Gz") == ".csv.gz"

    def test_uppercase_tsv(self):
        """Uppercase .TSV is detected."""
        assert _suffix_for_url("https://example.com/DATA.TSV") == ".tsv"

    def test_all_uppercase_url(self):
        """Fully uppercase URL is handled."""
        assert _suffix_for_url("HTTPS://EXAMPLE.COM/DATA.PARQUET") == ".parquet"


class TestSuffixForUrlPriorityOrder:
    """_suffix_for_url checks csv.gz, then csv, then tsv, then parquet."""

    def test_csv_gz_takes_priority_over_csv(self):
        """When URL ends with .csv.gz, it wins over .csv substring match."""
        assert _suffix_for_url("https://example.com/data.csv.gz") == ".csv.gz"

    def test_csv_takes_priority_over_tsv(self):
        """When both .csv and .tsv appear, .csv wins (checked first)."""
        assert _suffix_for_url("https://example.com/data.csv/export.tsv") == ".csv"

    def test_tsv_wins_over_parquet_when_no_csv(self):
        """.tsv wins over default .parquet when .csv is absent."""
        assert _suffix_for_url("https://example.com/data.tsv.parquet") == ".tsv"


class TestSuffixForUrlSpecialCharacters:
    """_suffix_for_url with URL-encoded and special characters."""

    def test_url_encoded_csv_not_matched(self):
        """URL-encoded '.csv' (%2Ecsv) is not matched (no literal '.csv')."""
        url = "https://example.com/data%2Ecsv"
        # "%2ecsv" after lowering — does contain ".csv"? No, it contains "%2ecsv".
        # But wait — %2E is the percent-encoding of '.'. After lower(): "%2ecsv"
        # ".csv" is NOT a substring of "%2ecsv", so this should default to .parquet
        assert _suffix_for_url(url) == ".parquet"

    def test_double_extension_csv_parquet(self):
        """File ending .csv.parquet has .csv in it, so returns .csv."""
        url = "https://example.com/data.csv.parquet"
        assert _suffix_for_url(url) == ".csv"

    def test_empty_string(self):
        """Empty string defaults to .parquet."""
        assert _suffix_for_url("") == ".parquet"

    def test_whitespace_only(self):
        """Whitespace-only string defaults to .parquet."""
        assert _suffix_for_url("   ") == ".parquet"


# ===========================================================================
# 2. cache_stats — edge cases
# ===========================================================================


class TestCacheStatsEdgeCases:
    """Edge cases for cache_stats."""

    def test_missing_cache_dir_returns_zeros(self):
        """When CACHE_DIR doesn't exist, returns zero counts gracefully."""
        stats = cache_stats()
        assert stats["file_count"] == 0
        assert stats["total_size_bytes"] == 0

    def test_cache_dir_value_matches_patched_dir(self):
        """Returned cache_dir matches whatever CACHE_DIR is patched to."""
        stats = cache_stats()
        assert stats["cache_dir"] == file_cache.CACHE_DIR

    def test_max_values_reflect_module_constants(self):
        """max_cache_bytes and max_file_bytes reflect the module-level values."""
        stats = cache_stats()
        assert stats["max_cache_bytes"] == file_cache.MAX_CACHE_BYTES
        assert stats["max_file_bytes"] == file_cache.MAX_FILE_BYTES

    def test_ignores_subdirectories(self, cache_dir):
        """Subdirectories inside CACHE_DIR are not counted as files."""
        subdir = os.path.join(cache_dir, "subdir")
        os.makedirs(subdir)
        # Also put a file inside the subdir (should not count)
        with open(os.path.join(subdir, "nested.parquet"), "wb") as f:
            f.write(b"nested data")

        stats = cache_stats()
        assert stats["file_count"] == 0
        assert stats["total_size_bytes"] == 0

    def test_counts_all_file_types(self, cache_dir):
        """Files of any extension are counted."""
        for name in ["a.parquet", "b.csv", "c.tsv", "d.csv.gz", ".download_tmp"]:
            with open(os.path.join(cache_dir, name), "wb") as f:
                f.write(b"x" * 50)

        stats = cache_stats()
        assert stats["file_count"] == 5
        assert stats["total_size_bytes"] == 250

    def test_zero_byte_files_counted(self, cache_dir):
        """Zero-byte files are counted in file_count but add nothing to size."""
        for i in range(3):
            with open(os.path.join(cache_dir, f"empty_{i}"), "wb"):
                pass  # 0-byte file

        stats = cache_stats()
        assert stats["file_count"] == 3
        assert stats["total_size_bytes"] == 0

    def test_single_large_file(self, cache_dir):
        """A single file reports correct size."""
        data = b"x" * 4096
        with open(os.path.join(cache_dir, "big.parquet"), "wb") as f:
            f.write(data)

        stats = cache_stats()
        assert stats["file_count"] == 1
        assert stats["total_size_bytes"] == 4096

    def test_patched_max_values(self, cache_dir):
        """Patching MAX_CACHE_BYTES/MAX_FILE_BYTES is reflected in stats."""
        with (
            patch.object(file_cache, "MAX_CACHE_BYTES", 999),
            patch.object(file_cache, "MAX_FILE_BYTES", 111),
        ):
            stats = cache_stats()
            assert stats["max_cache_bytes"] == 999
            assert stats["max_file_bytes"] == 111


# ===========================================================================
# 3. startup_cleanup — edge cases
# ===========================================================================


class TestStartupCleanupEdgeCases:
    """Edge cases for startup_cleanup."""

    def test_creates_cache_dir_when_missing(self):
        """startup_cleanup creates CACHE_DIR even if it doesn't exist."""
        assert not os.path.isdir(file_cache.CACHE_DIR)
        startup_cleanup()
        assert os.path.isdir(file_cache.CACHE_DIR)

    def test_returns_count_of_removed_temps(self, cache_dir):
        """Return value counts only removed stale temp files."""
        # Create 2 stale temp files
        for i in range(2):
            path = os.path.join(cache_dir, f".download_stale_{i}.parquet")
            with open(path, "wb") as f:
                f.write(b"stale")
            os.utime(path, (time.time() - 7200, time.time() - 7200))

        # Create 1 recent temp file (should not be counted)
        recent = os.path.join(cache_dir, ".download_recent.parquet")
        with open(recent, "wb") as f:
            f.write(b"active")

        removed = startup_cleanup()
        assert removed == 2

    def test_normal_files_untouched_by_cleanup(self, cache_dir):
        """startup_cleanup does not remove normal cached files."""
        normal = os.path.join(cache_dir, "abcdef1234.parquet")
        with open(normal, "wb") as f:
            f.write(b"cached data")

        startup_cleanup()
        assert os.path.exists(normal)

    def test_repeated_calls_are_safe(self, cache_dir):
        """Calling startup_cleanup multiple times is idempotent."""
        stale = os.path.join(cache_dir, ".download_stale.parquet")
        with open(stale, "wb") as f:
            f.write(b"stale")
        os.utime(stale, (time.time() - 7200, time.time() - 7200))

        removed1 = startup_cleanup()
        removed2 = startup_cleanup()
        assert removed1 == 1
        assert removed2 == 0

    def test_combines_temp_cleanup_and_eviction(self, cache_dir):
        """startup_cleanup both removes stale temps and runs LRU eviction."""
        # Stale temp file
        stale = os.path.join(cache_dir, ".download_old.csv")
        with open(stale, "wb") as f:
            f.write(b"stale")
        os.utime(stale, (time.time() - 7200, time.time() - 7200))

        # Oversized cache: 4 files x 100 bytes = 400 bytes, limit 200
        with patch.object(file_cache, "MAX_CACHE_BYTES", 200):
            for i in range(4):
                path = os.path.join(cache_dir, f"cached_{i}.parquet")
                with open(path, "wb") as f:
                    f.write(b"x" * 100)
                atime = time.time() - (400 - i * 100)
                os.utime(path, (atime, atime))

            removed = startup_cleanup()
            # stale temp was removed
            assert removed == 1
            assert not os.path.exists(stale)

            # LRU eviction should have removed some cached files
            remaining = [
                f for f in os.listdir(cache_dir) if not f.startswith(".download_")
            ]
            assert len(remaining) <= 2

    def test_empty_cache_dir_returns_zero(self, cache_dir):
        """Empty cache directory returns 0 removed."""
        removed = startup_cleanup()
        assert removed == 0


# ===========================================================================
# 4. _cleanup_stale_temps — edge cases
# ===========================================================================


class TestCleanupStaleTempsThreshold:
    """_cleanup_stale_temps boundary behavior around the age threshold."""

    def test_file_exactly_at_threshold_not_removed(self, cache_dir):
        """A file exactly STALE_TEMP_MAX_AGE old may not be removed (boundary).

        The condition is `age > STALE_TEMP_MAX_AGE` (strict greater-than), so a
        file at exactly the threshold age should NOT be removed — though timing
        jitter may cause it to be slightly over. We set mtime slightly inside
        the threshold to ensure it's kept.
        """
        path = os.path.join(cache_dir, ".download_boundary.parquet")
        with open(path, "wb") as f:
            f.write(b"data")

        # Set mtime to (STALE_TEMP_MAX_AGE - 10) seconds ago — safely within
        within_threshold = time.time() - (STALE_TEMP_MAX_AGE - 10)
        os.utime(path, (within_threshold, within_threshold))

        removed = _cleanup_stale_temps()
        assert removed == 0
        assert os.path.exists(path)

    def test_file_just_over_threshold_is_removed(self, cache_dir):
        """A file clearly past STALE_TEMP_MAX_AGE is removed."""
        path = os.path.join(cache_dir, ".download_expired.parquet")
        with open(path, "wb") as f:
            f.write(b"data")

        over_threshold = time.time() - (STALE_TEMP_MAX_AGE + 60)
        os.utime(path, (over_threshold, over_threshold))

        removed = _cleanup_stale_temps()
        assert removed == 1
        assert not os.path.exists(path)


class TestCleanupStaleTempsFileTypes:
    """_cleanup_stale_temps only targets .download_ prefixed files."""

    def test_ignores_non_download_prefix(self, cache_dir):
        """Files without the .download_ prefix are never removed."""
        for name in ["cached.parquet", "data.csv", ".hidden_file", "download_noprefix"]:
            path = os.path.join(cache_dir, name)
            with open(path, "wb") as f:
                f.write(b"data")
            old_time = time.time() - 7200
            os.utime(path, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == 0
        # All files should still exist
        assert len(os.listdir(cache_dir)) == 4

    def test_download_prefix_various_suffixes(self, cache_dir):
        """Stale .download_ files with any suffix are removed."""
        suffixes = [".parquet", ".csv", ".tsv", ".csv.gz", ".tmp", ""]
        for i, suffix in enumerate(suffixes):
            path = os.path.join(cache_dir, f".download_{i}{suffix}")
            with open(path, "wb") as f:
                f.write(b"data")
            old_time = time.time() - 7200
            os.utime(path, (old_time, old_time))

        removed = _cleanup_stale_temps()
        assert removed == len(suffixes)


class TestCleanupStaleTempsDirectoryHandling:
    """_cleanup_stale_temps handles directories and missing dirs gracefully."""

    def test_ignores_subdirectory_with_download_prefix(self, cache_dir):
        """A subdirectory named .download_something is not removed."""
        subdir = os.path.join(cache_dir, ".download_subdir")
        os.makedirs(subdir)

        removed = _cleanup_stale_temps()
        assert removed == 0
        assert os.path.isdir(subdir)

    def test_missing_cache_dir_returns_zero(self):
        """When CACHE_DIR doesn't exist, returns 0 without error."""
        removed = _cleanup_stale_temps()
        assert removed == 0

    def test_empty_cache_dir_returns_zero(self, cache_dir):
        """Empty cache directory returns 0."""
        removed = _cleanup_stale_temps()
        assert removed == 0


class TestCleanupStaleTempsMultipleCalls:
    """_cleanup_stale_temps is idempotent — second call finds nothing to remove."""

    def test_second_call_returns_zero(self, cache_dir):
        """After removing stale files, a second call returns 0."""
        path = os.path.join(cache_dir, ".download_once.parquet")
        with open(path, "wb") as f:
            f.write(b"data")
        os.utime(path, (time.time() - 7200, time.time() - 7200))

        first = _cleanup_stale_temps()
        second = _cleanup_stale_temps()
        assert first == 1
        assert second == 0


class TestCleanupStaleTempsOSErrors:
    """_cleanup_stale_temps handles OS errors gracefully."""

    def test_oserror_on_listdir_returns_zero(self):
        """OSError during listdir (e.g. permission denied) returns 0."""
        with patch("os.listdir", side_effect=OSError("permission denied")):
            removed = _cleanup_stale_temps()
            assert removed == 0

    def test_oserror_on_unlink_skips_file(self, cache_dir):
        """OSError during unlink skips the file and continues."""
        path = os.path.join(cache_dir, ".download_locked.parquet")
        with open(path, "wb") as f:
            f.write(b"data")
        os.utime(path, (time.time() - 7200, time.time() - 7200))

        with patch("os.unlink", side_effect=OSError("busy")):
            removed = _cleanup_stale_temps()
            # unlink failed, so removed count stays 0
            assert removed == 0
            # File still exists
            assert os.path.exists(path)

    def test_oserror_on_getmtime_skips_file(self, cache_dir):
        """OSError during getmtime skips that file gracefully."""
        path = os.path.join(cache_dir, ".download_broken.parquet")
        with open(path, "wb") as f:
            f.write(b"data")
        os.utime(path, (time.time() - 7200, time.time() - 7200))

        original_getmtime = os.path.getmtime

        def failing_getmtime(p):
            if ".download_broken" in p:
                raise OSError("stat failed")
            return original_getmtime(p)

        with patch("os.path.getmtime", side_effect=failing_getmtime):
            removed = _cleanup_stale_temps()
            assert removed == 0
