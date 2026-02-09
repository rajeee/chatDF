"""Tests for the in-memory LRU query cache.

Covers:
- Cache hit / miss behaviour
- TTL expiration
- LRU eviction when max size is reached
- Error results are never cached
- Cache key determinism (same SQL + datasets = same key)
- Cache stats tracking
- Thread safety (basic concurrent access)
"""

from __future__ import annotations

import threading
import time

import pytest

from app.services.query_cache import QueryCache


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_DATASETS = [
    {"url": "https://example.com/a.parquet", "table_name": "a"},
    {"url": "https://example.com/b.parquet", "table_name": "b"},
]

SAMPLE_RESULT = {
    "rows": [{"id": 1, "value": "hello"}],
    "columns": ["id", "value"],
    "total_rows": 1,
}


# ---------------------------------------------------------------------------
# Cache hit / miss
# ---------------------------------------------------------------------------

class TestCacheHitMiss:
    """Basic get/put round-trip behaviour."""

    def test_miss_returns_none(self):
        cache = QueryCache()
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is None

    def test_put_then_get_returns_result(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        result = cache.get("SELECT 1", SAMPLE_DATASETS)
        assert result == SAMPLE_RESULT

    def test_different_sql_is_miss(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        assert cache.get("SELECT 2", SAMPLE_DATASETS) is None

    def test_different_datasets_is_miss(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        other_datasets = [{"url": "https://other.com/x.parquet", "table_name": "x"}]
        assert cache.get("SELECT 1", other_datasets) is None


# ---------------------------------------------------------------------------
# TTL expiration
# ---------------------------------------------------------------------------

class TestTTLExpiration:
    """Entries expire after their TTL."""

    def test_entry_expires_after_ttl(self):
        cache = QueryCache(ttl=0.1)  # 100 ms TTL
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)

        # Should be available immediately
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is not None

        # Wait for expiry
        time.sleep(0.15)
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is None

    def test_fresh_entry_not_expired(self):
        cache = QueryCache(ttl=10)
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is not None


# ---------------------------------------------------------------------------
# LRU eviction
# ---------------------------------------------------------------------------

class TestLRUEviction:
    """Oldest (least recently used) entries are evicted when max_size is hit."""

    def test_evicts_oldest_when_full(self):
        cache = QueryCache(max_size=2)

        ds1 = [{"url": "https://example.com/1.parquet", "table_name": "t1"}]
        ds2 = [{"url": "https://example.com/2.parquet", "table_name": "t2"}]
        ds3 = [{"url": "https://example.com/3.parquet", "table_name": "t3"}]

        cache.put("SELECT 1", ds1, SAMPLE_RESULT)
        cache.put("SELECT 2", ds2, SAMPLE_RESULT)
        # Cache is now full (max_size=2).  Adding a third should evict the first.
        cache.put("SELECT 3", ds3, SAMPLE_RESULT)

        assert cache.get("SELECT 1", ds1) is None  # evicted
        assert cache.get("SELECT 2", ds2) is not None
        assert cache.get("SELECT 3", ds3) is not None

    def test_access_promotes_entry(self):
        """Accessing an entry moves it to the end, so it is evicted last."""
        cache = QueryCache(max_size=2)

        ds1 = [{"url": "https://example.com/1.parquet", "table_name": "t1"}]
        ds2 = [{"url": "https://example.com/2.parquet", "table_name": "t2"}]
        ds3 = [{"url": "https://example.com/3.parquet", "table_name": "t3"}]

        cache.put("SELECT 1", ds1, SAMPLE_RESULT)
        cache.put("SELECT 2", ds2, SAMPLE_RESULT)

        # Access entry 1 to promote it
        cache.get("SELECT 1", ds1)

        # Now insert entry 3 -> should evict entry 2 (oldest)
        cache.put("SELECT 3", ds3, SAMPLE_RESULT)

        assert cache.get("SELECT 1", ds1) is not None  # promoted, still here
        assert cache.get("SELECT 2", ds2) is None  # evicted
        assert cache.get("SELECT 3", ds3) is not None


# ---------------------------------------------------------------------------
# Error results not cached
# ---------------------------------------------------------------------------

class TestErrorsNotCached:
    """Results with error_type or error keys must not be stored."""

    def test_error_type_not_cached(self):
        cache = QueryCache()
        err_result = {"error_type": "timeout", "message": "Timed out"}
        cache.put("SELECT 1", SAMPLE_DATASETS, err_result)
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is None
        assert cache.stats["size"] == 0

    def test_error_key_not_cached(self):
        cache = QueryCache()
        err_result = {"error": "Something went wrong"}
        cache.put("SELECT 1", SAMPLE_DATASETS, err_result)
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is None
        assert cache.stats["size"] == 0

    def test_successful_result_is_cached(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        assert cache.stats["size"] == 1


# ---------------------------------------------------------------------------
# Cache key determinism
# ---------------------------------------------------------------------------

class TestKeyDeterminism:
    """Same SQL + datasets must produce the same cache key regardless of order."""

    def test_same_sql_same_datasets_same_key(self):
        cache = QueryCache()
        key1 = cache._make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = cache._make_key("SELECT 1", SAMPLE_DATASETS)
        assert key1 == key2

    def test_dataset_order_does_not_matter(self):
        cache = QueryCache()
        reversed_datasets = list(reversed(SAMPLE_DATASETS))
        key1 = cache._make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = cache._make_key("SELECT 1", reversed_datasets)
        assert key1 == key2

    def test_whitespace_normalisation(self):
        """Leading/trailing whitespace in SQL is stripped for key generation."""
        cache = QueryCache()
        key1 = cache._make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = cache._make_key("  SELECT 1  ", SAMPLE_DATASETS)
        assert key1 == key2

    def test_different_sql_different_key(self):
        cache = QueryCache()
        key1 = cache._make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = cache._make_key("SELECT 2", SAMPLE_DATASETS)
        assert key1 != key2


# ---------------------------------------------------------------------------
# Stats tracking
# ---------------------------------------------------------------------------

class TestStatsTracking:
    """Cache statistics are correctly maintained."""

    def test_initial_stats(self):
        cache = QueryCache()
        stats = cache.stats
        assert stats["size"] == 0
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0.0

    def test_miss_increments(self):
        cache = QueryCache()
        cache.get("SELECT 1", SAMPLE_DATASETS)
        assert cache.stats["misses"] == 1
        assert cache.stats["hits"] == 0

    def test_hit_increments(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        cache.get("SELECT 1", SAMPLE_DATASETS)
        assert cache.stats["hits"] == 1

    def test_hit_rate_calculation(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        # 1 miss
        cache.get("SELECT 99", SAMPLE_DATASETS)
        # 1 hit
        cache.get("SELECT 1", SAMPLE_DATASETS)
        # hit_rate = 1 / (1 + 1) * 100 = 50.0
        assert cache.stats["hit_rate"] == 50.0

    def test_size_after_put(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        assert cache.stats["size"] == 1

    def test_size_after_clear(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        cache.clear()
        assert cache.stats["size"] == 0


# ---------------------------------------------------------------------------
# clear()
# ---------------------------------------------------------------------------

class TestClear:
    """Cache can be fully cleared."""

    def test_clear_removes_all_entries(self):
        cache = QueryCache()
        cache.put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT)
        cache.put("SELECT 2", SAMPLE_DATASETS, {"rows": [], "columns": [], "total_rows": 0})
        assert cache.stats["size"] == 2
        cache.clear()
        assert cache.stats["size"] == 0
        assert cache.get("SELECT 1", SAMPLE_DATASETS) is None


# ---------------------------------------------------------------------------
# Thread safety (basic)
# ---------------------------------------------------------------------------

class TestThreadSafety:
    """Basic concurrent access should not raise or corrupt state."""

    def test_concurrent_put_and_get(self):
        cache = QueryCache(max_size=50)
        errors: list[Exception] = []

        def writer(start_idx: int) -> None:
            try:
                for i in range(start_idx, start_idx + 25):
                    ds = [{"url": f"https://example.com/{i}.parquet", "table_name": f"t{i}"}]
                    cache.put(f"SELECT {i}", ds, {**SAMPLE_RESULT, "i": i})
            except Exception as exc:
                errors.append(exc)

        def reader(start_idx: int) -> None:
            try:
                for i in range(start_idx, start_idx + 25):
                    ds = [{"url": f"https://example.com/{i}.parquet", "table_name": f"t{i}"}]
                    cache.get(f"SELECT {i}", ds)  # may hit or miss
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=writer, args=(0,)),
            threading.Thread(target=writer, args=(25,)),
            threading.Thread(target=reader, args=(0,)),
            threading.Thread(target=reader, args=(25,)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert errors == [], f"Errors during concurrent access: {errors}"
        # Cache should have at most max_size entries
        assert cache.stats["size"] <= 50
