"""Tests for the persistent SQLite-backed query result cache.

Covers:
- Cache put and get (round-trip)
- Cache expiry (expired entries return None)
- Cache max size (oldest entries evicted when full)
- Cleanup removes expired entries
- Error results are not cached
- Stats method returns correct values
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import aiosqlite
import pytest

from app.services import persistent_cache
from app.services.persistent_cache import (
    MAX_PERSISTENT_CACHE_SIZE,
    PERSISTENT_TTL_SECONDS,
    _make_key,
    cleanup,
    get,
    put,
    stats,
)

# ---------------------------------------------------------------------------
# Schema for in-memory test database
# ---------------------------------------------------------------------------

_CACHE_SCHEMA = """\
CREATE TABLE IF NOT EXISTS query_results_cache (
    cache_key       TEXT PRIMARY KEY,
    sql_query       TEXT NOT NULL,
    dataset_urls    TEXT NOT NULL,
    result_json     TEXT NOT NULL,
    row_count       INTEGER,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_results_cache(expires_at);
"""

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
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def cache_db():
    """In-memory SQLite database with the query_results_cache table."""
    conn = await aiosqlite.connect(":memory:")
    await conn.executescript(_CACHE_SCHEMA)
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# Key generation
# ---------------------------------------------------------------------------


class TestKeyGeneration:
    """Key generation mirrors the in-memory cache."""

    def test_deterministic_key(self):
        key1 = _make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = _make_key("SELECT 1", SAMPLE_DATASETS)
        assert key1 == key2

    def test_dataset_order_does_not_matter(self):
        reversed_datasets = list(reversed(SAMPLE_DATASETS))
        key1 = _make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = _make_key("SELECT 1", reversed_datasets)
        assert key1 == key2

    def test_whitespace_normalisation(self):
        key1 = _make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = _make_key("  SELECT 1  ", SAMPLE_DATASETS)
        assert key1 == key2

    def test_different_sql_different_key(self):
        key1 = _make_key("SELECT 1", SAMPLE_DATASETS)
        key2 = _make_key("SELECT 2", SAMPLE_DATASETS)
        assert key1 != key2


# ---------------------------------------------------------------------------
# Put and Get (round-trip)
# ---------------------------------------------------------------------------


class TestPutAndGet:
    """Basic put/get round-trip behaviour."""

    @pytest.mark.asyncio
    async def test_miss_returns_none(self, cache_db):
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is None

    @pytest.mark.asyncio
    async def test_put_then_get_returns_result(self, cache_db):
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["rows"] == SAMPLE_RESULT["rows"]
        assert result["columns"] == SAMPLE_RESULT["columns"]
        assert result["total_rows"] == SAMPLE_RESULT["total_rows"]

    @pytest.mark.asyncio
    async def test_different_sql_is_miss(self, cache_db):
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        result = await get("SELECT 2", SAMPLE_DATASETS, cache_db)
        assert result is None

    @pytest.mark.asyncio
    async def test_different_datasets_is_miss(self, cache_db):
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        other = [{"url": "https://other.com/x.parquet", "table_name": "x"}]
        result = await get("SELECT 1", other, cache_db)
        assert result is None

    @pytest.mark.asyncio
    async def test_put_replaces_existing(self, cache_db):
        """Putting the same key again replaces the old value."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        new_result = {**SAMPLE_RESULT, "total_rows": 999}
        await put("SELECT 1", SAMPLE_DATASETS, new_result, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result["total_rows"] == 999


# ---------------------------------------------------------------------------
# Cache expiry
# ---------------------------------------------------------------------------


class TestCacheExpiry:
    """Expired entries return None and are cleaned up."""

    @pytest.mark.asyncio
    async def test_expired_entry_returns_none(self, cache_db):
        """An entry that has passed its expires_at should return None."""
        # Insert with an already-expired timestamp
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=10)
        expired_at = past.isoformat()
        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        import json

        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                key,
                "SELECT 1",
                "url1|url2",
                json.dumps(SAMPLE_RESULT),
                1,
                past.isoformat(),
                expired_at,
            ),
        )
        await cache_db.commit()

        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is None

    @pytest.mark.asyncio
    async def test_expired_entry_is_deleted_on_get(self, cache_db):
        """Getting an expired entry should also delete the row."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=10)
        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        import json

        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                key,
                "SELECT 1",
                "url1|url2",
                json.dumps(SAMPLE_RESULT),
                1,
                past.isoformat(),
                past.isoformat(),
            ),
        )
        await cache_db.commit()

        # get should return None and delete the row
        await get("SELECT 1", SAMPLE_DATASETS, cache_db)

        cursor = await cache_db.execute(
            "SELECT COUNT(*) FROM query_results_cache WHERE cache_key = ?",
            (key,),
        )
        (count,) = await cursor.fetchone()
        assert count == 0

    @pytest.mark.asyncio
    async def test_fresh_entry_not_expired(self, cache_db):
        """A freshly inserted entry should be retrievable."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None


# ---------------------------------------------------------------------------
# Max size eviction
# ---------------------------------------------------------------------------


class TestMaxSizeEviction:
    """Oldest entries are evicted when the cache exceeds max size."""

    @pytest.mark.asyncio
    async def test_oldest_entries_evicted(self, cache_db):
        """Inserting beyond MAX_PERSISTENT_CACHE_SIZE evicts the oldest."""
        # Use a small max size for testing
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 3):
            for i in range(5):
                ds = [{"url": f"https://example.com/{i}.parquet", "table_name": f"t{i}"}]
                result = {**SAMPLE_RESULT, "total_rows": i}
                await put(f"SELECT {i}", ds, result, cache_db)

            # Should only have 3 entries (max size)
            cursor = await cache_db.execute(
                "SELECT COUNT(*) FROM query_results_cache"
            )
            (count,) = await cursor.fetchone()
            assert count == 3

            # Oldest entries (0, 1) should be evicted; newest (2, 3, 4) remain
            ds0 = [{"url": "https://example.com/0.parquet", "table_name": "t0"}]
            ds1 = [{"url": "https://example.com/1.parquet", "table_name": "t1"}]
            ds4 = [{"url": "https://example.com/4.parquet", "table_name": "t4"}]

            assert await get("SELECT 0", ds0, cache_db) is None
            assert await get("SELECT 1", ds1, cache_db) is None
            result4 = await get("SELECT 4", ds4, cache_db)
            assert result4 is not None
            assert result4["total_rows"] == 4


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------


class TestCleanup:
    """Cleanup removes expired entries."""

    @pytest.mark.asyncio
    async def test_cleanup_removes_expired(self, cache_db):
        """Expired entries are removed by cleanup."""
        import json

        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=100)
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=3600)

        # Insert one expired and one fresh entry
        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("expired_key", "SELECT old", "urls", json.dumps(SAMPLE_RESULT), 1,
             past.isoformat(), past.isoformat()),
        )
        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("fresh_key", "SELECT new", "urls", json.dumps(SAMPLE_RESULT), 1,
             datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), future.isoformat()),
        )
        await cache_db.commit()

        removed = await cleanup(cache_db)
        assert removed == 1

        # Fresh entry should remain
        cursor = await cache_db.execute(
            "SELECT COUNT(*) FROM query_results_cache"
        )
        (count,) = await cursor.fetchone()
        assert count == 1

    @pytest.mark.asyncio
    async def test_cleanup_returns_zero_when_nothing_expired(self, cache_db):
        """If nothing is expired, cleanup returns 0."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        removed = await cleanup(cache_db)
        assert removed == 0

    @pytest.mark.asyncio
    async def test_cleanup_on_empty_table(self, cache_db):
        """Cleanup on an empty table returns 0."""
        removed = await cleanup(cache_db)
        assert removed == 0


# ---------------------------------------------------------------------------
# Error results not cached
# ---------------------------------------------------------------------------


class TestErrorsNotCached:
    """Results with error keys are silently skipped."""

    @pytest.mark.asyncio
    async def test_error_type_not_cached(self, cache_db):
        err_result = {"error_type": "timeout", "message": "Timed out"}
        await put("SELECT 1", SAMPLE_DATASETS, err_result, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is None

    @pytest.mark.asyncio
    async def test_error_key_not_cached(self, cache_db):
        err_result = {"error": "Something went wrong"}
        await put("SELECT 1", SAMPLE_DATASETS, err_result, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is None

    @pytest.mark.asyncio
    async def test_successful_result_is_cached(self, cache_db):
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        s = await stats(cache_db)
        assert s["size"] == 1


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestStats:
    """Stats method returns correct values."""

    @pytest.mark.asyncio
    async def test_empty_stats(self, cache_db):
        s = await stats(cache_db)
        assert s["size"] == 0
        assert s["oldest_entry"] is None
        assert s["newest_entry"] is None

    @pytest.mark.asyncio
    async def test_stats_after_single_put(self, cache_db):
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        s = await stats(cache_db)
        assert s["size"] == 1
        assert s["oldest_entry"] is not None
        assert s["newest_entry"] is not None
        assert s["oldest_entry"] == s["newest_entry"]

    @pytest.mark.asyncio
    async def test_stats_after_multiple_puts(self, cache_db):
        ds1 = [{"url": "https://example.com/1.parquet", "table_name": "t1"}]
        ds2 = [{"url": "https://example.com/2.parquet", "table_name": "t2"}]

        await put("SELECT 1", ds1, SAMPLE_RESULT, cache_db)
        await put("SELECT 2", ds2, SAMPLE_RESULT, cache_db)

        s = await stats(cache_db)
        assert s["size"] == 2
        assert s["oldest_entry"] is not None
        assert s["newest_entry"] is not None
        # oldest should be <= newest
        assert s["oldest_entry"] <= s["newest_entry"]
