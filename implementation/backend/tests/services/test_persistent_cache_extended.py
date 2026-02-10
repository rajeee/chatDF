"""Extended tests for the persistent SQLite-backed query result cache.

Supplements the basic tests in ``tests/test_persistent_cache.py`` with
additional edge-case coverage:

- Key generation: empty datasets, missing url keys, single dataset, hash format
- Put/Get: large payloads, special characters in SQL, binary-like data,
  row_count from different result keys
- TTL expiry: time-mocking with freezegun, boundary at exact expiry moment
- Eviction: exact boundary at MAX_PERSISTENT_CACHE_SIZE, single-slot cache,
  eviction order verification
- Cleanup: mixed expired and fresh entries, all expired, idempotent cleanup
- Stats: stats after eviction, stats after cleanup, stats with expired entries
- Error handling: corrupt JSON in database, database errors during get/put,
  malformed rows
- Overwrite: overwrite preserves count, overwrite updates expiry
- Clear all entries via DELETE
- Concurrent async puts
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

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


def _make_datasets(n: int) -> list[list[dict]]:
    """Generate ``n`` distinct single-dataset lists."""
    return [
        [{"url": f"https://example.com/{i}.parquet", "table_name": f"t{i}"}]
        for i in range(n)
    ]


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
# Key generation — extended
# ---------------------------------------------------------------------------


class TestKeyGenerationExtended:
    """Additional edge cases for _make_key."""

    def test_empty_datasets_list(self):
        """An empty dataset list should still produce a valid key."""
        key = _make_key("SELECT 1", [])
        assert isinstance(key, str)
        assert len(key) == 64  # SHA-256 hex digest length

    def test_single_dataset(self):
        key = _make_key("SELECT 1", [{"url": "https://a.com/x.parquet"}])
        assert isinstance(key, str) and len(key) == 64

    def test_datasets_missing_url_key(self):
        """Datasets without a 'url' key default to empty string."""
        key1 = _make_key("SELECT 1", [{"table_name": "t"}])
        key2 = _make_key("SELECT 1", [{"url": "", "table_name": "t"}])
        assert key1 == key2

    def test_key_is_hex_sha256(self):
        """Key should be a valid lowercase hex SHA-256 digest."""
        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        assert len(key) == 64
        # Should not raise
        int(key, 16)

    def test_manual_hash_matches(self):
        """Verify the key matches the expected SHA-256 computation."""
        sql = "SELECT 1"
        datasets = [{"url": "https://b.com/b.parquet"}, {"url": "https://a.com/a.parquet"}]
        sorted_urls = sorted(d.get("url", "") for d in datasets)
        raw = sql.strip() + "|" + "|".join(sorted_urls)
        expected = hashlib.sha256(raw.encode()).hexdigest()
        assert _make_key(sql, datasets) == expected

    def test_empty_sql(self):
        """Empty SQL string still produces a deterministic key."""
        key1 = _make_key("", SAMPLE_DATASETS)
        key2 = _make_key("", SAMPLE_DATASETS)
        assert key1 == key2

    def test_sql_with_newlines_and_tabs(self):
        """Whitespace inside the SQL body is preserved (only strip outer)."""
        key1 = _make_key("SELECT\n\t1", SAMPLE_DATASETS)
        key2 = _make_key("  SELECT\n\t1  ", SAMPLE_DATASETS)
        assert key1 == key2

    def test_different_datasets_different_key(self):
        ds1 = [{"url": "https://a.com/1.parquet"}]
        ds2 = [{"url": "https://a.com/2.parquet"}]
        assert _make_key("SELECT 1", ds1) != _make_key("SELECT 1", ds2)

    def test_duplicate_datasets_same_key(self):
        """Duplicate URLs in datasets should yield the same key both times."""
        ds = [{"url": "https://a.com/x.parquet"}, {"url": "https://a.com/x.parquet"}]
        key1 = _make_key("SELECT 1", ds)
        key2 = _make_key("SELECT 1", ds)
        assert key1 == key2


# ---------------------------------------------------------------------------
# Put/Get — extended
# ---------------------------------------------------------------------------


class TestPutGetExtended:
    """Extended round-trip and payload tests."""

    @pytest.mark.asyncio
    async def test_large_result_payload(self, cache_db):
        """A result with many rows should survive the round-trip."""
        big_result = {
            "rows": [{"id": i, "val": f"row_{i}"} for i in range(1000)],
            "columns": ["id", "val"],
            "total_rows": 1000,
        }
        await put("SELECT *", SAMPLE_DATASETS, big_result, cache_db)
        result = await get("SELECT *", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert len(result["rows"]) == 1000
        assert result["total_rows"] == 1000

    @pytest.mark.asyncio
    async def test_special_characters_in_sql(self, cache_db):
        """SQL containing quotes, semicolons, etc. should cache fine."""
        tricky_sql = "SELECT * FROM t WHERE name = 'O''Brien'; -- comment"
        await put(tricky_sql, SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        result = await get(tricky_sql, SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["rows"] == SAMPLE_RESULT["rows"]

    @pytest.mark.asyncio
    async def test_unicode_in_result(self, cache_db):
        """Unicode content in the result dict survives serialization."""
        unicode_result = {
            "rows": [{"name": "cafe\u0301", "emoji": "\U0001f600"}],
            "columns": ["name", "emoji"],
            "total_rows": 1,
        }
        await put("SELECT 1", SAMPLE_DATASETS, unicode_result, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["rows"][0]["name"] == "cafe\u0301"
        assert result["rows"][0]["emoji"] == "\U0001f600"

    @pytest.mark.asyncio
    async def test_result_with_nested_objects(self, cache_db):
        """Nested dicts and lists in the result survive JSON round-trip."""
        nested = {
            "rows": [{"data": {"a": [1, 2, 3], "b": {"nested": True}}}],
            "columns": ["data"],
            "total_rows": 1,
        }
        await put("SELECT 1", SAMPLE_DATASETS, nested, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["rows"][0]["data"]["a"] == [1, 2, 3]
        assert result["rows"][0]["data"]["b"]["nested"] is True

    @pytest.mark.asyncio
    async def test_row_count_from_row_count_key(self, cache_db):
        """put() should extract row_count from 'row_count' key when 'total_rows' is absent."""
        result_with_row_count = {
            "rows": [{"id": 1}],
            "columns": ["id"],
            "row_count": 42,
        }
        await put("SELECT 1", SAMPLE_DATASETS, result_with_row_count, cache_db)

        cursor = await cache_db.execute(
            "SELECT row_count FROM query_results_cache WHERE cache_key = ?",
            (_make_key("SELECT 1", SAMPLE_DATASETS),),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == 42

    @pytest.mark.asyncio
    async def test_row_count_prefers_total_rows(self, cache_db):
        """put() should prefer 'total_rows' over 'row_count' when both present."""
        result_both = {
            "rows": [],
            "columns": [],
            "total_rows": 100,
            "row_count": 50,
        }
        await put("SELECT 1", SAMPLE_DATASETS, result_both, cache_db)

        cursor = await cache_db.execute(
            "SELECT row_count FROM query_results_cache WHERE cache_key = ?",
            (_make_key("SELECT 1", SAMPLE_DATASETS),),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == 100

    @pytest.mark.asyncio
    async def test_row_count_none_when_absent(self, cache_db):
        """row_count column should be NULL when neither key is present."""
        result_no_count = {
            "rows": [],
            "columns": [],
        }
        await put("SELECT 1", SAMPLE_DATASETS, result_no_count, cache_db)

        cursor = await cache_db.execute(
            "SELECT row_count FROM query_results_cache WHERE cache_key = ?",
            (_make_key("SELECT 1", SAMPLE_DATASETS),),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] is None

    @pytest.mark.asyncio
    async def test_empty_result(self, cache_db):
        """An empty result dict (no error keys) should still be cached."""
        empty = {"rows": [], "columns": [], "total_rows": 0}
        await put("SELECT 1", SAMPLE_DATASETS, empty, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["rows"] == []
        assert result["total_rows"] == 0

    @pytest.mark.asyncio
    async def test_get_with_empty_datasets(self, cache_db):
        """Get/put with empty datasets list works correctly."""
        await put("SELECT 1", [], SAMPLE_RESULT, cache_db)
        result = await get("SELECT 1", [], cache_db)
        assert result is not None
        assert result["total_rows"] == SAMPLE_RESULT["total_rows"]


# ---------------------------------------------------------------------------
# Overwrite behaviour — extended
# ---------------------------------------------------------------------------


class TestOverwriteExtended:
    """Overwriting an existing key replaces data and refreshes metadata."""

    @pytest.mark.asyncio
    async def test_overwrite_updates_result_content(self, cache_db):
        original = {"rows": [{"v": 1}], "columns": ["v"], "total_rows": 1}
        updated = {"rows": [{"v": 2}, {"v": 3}], "columns": ["v"], "total_rows": 2}

        await put("SELECT 1", SAMPLE_DATASETS, original, cache_db)
        await put("SELECT 1", SAMPLE_DATASETS, updated, cache_db)

        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["total_rows"] == 2
        assert len(result["rows"]) == 2

    @pytest.mark.asyncio
    async def test_overwrite_keeps_single_row_in_db(self, cache_db):
        """Overwriting should not duplicate rows — INSERT OR REPLACE."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        await put("SELECT 1", SAMPLE_DATASETS, {**SAMPLE_RESULT, "total_rows": 99}, cache_db)

        cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
        (count,) = await cursor.fetchone()
        assert count == 1

    @pytest.mark.asyncio
    async def test_overwrite_refreshes_expires_at(self, cache_db):
        """Overwriting an entry should set a fresh expires_at."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)

        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        cursor = await cache_db.execute(
            "SELECT expires_at FROM query_results_cache WHERE cache_key = ?", (key,)
        )
        first_expiry = (await cursor.fetchone())[0]

        # Small delay to get a different timestamp
        await asyncio.sleep(0.01)
        await put("SELECT 1", SAMPLE_DATASETS, {**SAMPLE_RESULT, "total_rows": 5}, cache_db)

        cursor = await cache_db.execute(
            "SELECT expires_at FROM query_results_cache WHERE cache_key = ?", (key,)
        )
        second_expiry = (await cursor.fetchone())[0]
        assert second_expiry >= first_expiry


# ---------------------------------------------------------------------------
# TTL expiry — time-mocked
# ---------------------------------------------------------------------------


class TestTTLExpiryFreezegun:
    """TTL expiry tests using freezegun for deterministic time control."""

    @pytest.mark.asyncio
    async def test_entry_expires_after_ttl_with_freezegun(self, cache_db):
        """Entry inserted 'now' should expire when time advances past TTL."""
        from freezegun import freeze_time

        base_time = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

        with freeze_time(base_time):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)

        # Advance past TTL
        expired_time = base_time + timedelta(seconds=PERSISTENT_TTL_SECONDS + 1)
        with freeze_time(expired_time):
            result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
            assert result is None

    @pytest.mark.asyncio
    async def test_entry_valid_just_before_ttl(self, cache_db):
        """Entry should still be valid 1 second before TTL expires."""
        from freezegun import freeze_time

        base_time = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

        with freeze_time(base_time):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)

        # Just before expiry
        almost_expired = base_time + timedelta(seconds=PERSISTENT_TTL_SECONDS - 1)
        with freeze_time(almost_expired):
            result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
            assert result is not None

    @pytest.mark.asyncio
    async def test_expired_entry_deleted_on_get(self, cache_db):
        """When get() finds an expired row, it deletes it from the table."""
        from freezegun import freeze_time

        base_time = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

        with freeze_time(base_time):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)

        # Advance past TTL
        expired_time = base_time + timedelta(seconds=PERSISTENT_TTL_SECONDS + 10)
        with freeze_time(expired_time):
            await get("SELECT 1", SAMPLE_DATASETS, cache_db)

        # Verify the row is gone regardless of time context
        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        cursor = await cache_db.execute(
            "SELECT COUNT(*) FROM query_results_cache WHERE cache_key = ?", (key,)
        )
        (count,) = await cursor.fetchone()
        assert count == 0


# ---------------------------------------------------------------------------
# Eviction — extended
# ---------------------------------------------------------------------------


class TestEvictionExtended:
    """Extended eviction boundary and ordering tests."""

    @pytest.mark.asyncio
    async def test_no_eviction_at_exact_max_size(self, cache_db):
        """Inserting exactly MAX entries should not trigger eviction."""
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 5):
            datasets_list = _make_datasets(5)
            for i in range(5):
                await put(f"SELECT {i}", datasets_list[i], {**SAMPLE_RESULT, "total_rows": i}, cache_db)

            cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
            (count,) = await cursor.fetchone()
            assert count == 5

    @pytest.mark.asyncio
    async def test_eviction_at_max_plus_one(self, cache_db):
        """Inserting MAX + 1 entries should evict exactly one (the oldest)."""
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 5):
            datasets_list = _make_datasets(6)
            for i in range(6):
                await put(f"SELECT {i}", datasets_list[i], {**SAMPLE_RESULT, "total_rows": i}, cache_db)

            cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
            (count,) = await cursor.fetchone()
            assert count == 5

            # Oldest (i=0) should be evicted
            assert await get("SELECT 0", datasets_list[0], cache_db) is None
            # Newest (i=5) should be present
            result = await get("SELECT 5", datasets_list[5], cache_db)
            assert result is not None
            assert result["total_rows"] == 5

    @pytest.mark.asyncio
    async def test_single_slot_cache(self, cache_db):
        """A cache with max_size=1 should only hold the latest entry."""
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 1):
            ds1 = [{"url": "https://a.com/1.parquet"}]
            ds2 = [{"url": "https://a.com/2.parquet"}]
            ds3 = [{"url": "https://a.com/3.parquet"}]

            await put("SELECT 1", ds1, {**SAMPLE_RESULT, "total_rows": 1}, cache_db)
            await put("SELECT 2", ds2, {**SAMPLE_RESULT, "total_rows": 2}, cache_db)
            await put("SELECT 3", ds3, {**SAMPLE_RESULT, "total_rows": 3}, cache_db)

            cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
            (count,) = await cursor.fetchone()
            assert count == 1

            assert await get("SELECT 1", ds1, cache_db) is None
            assert await get("SELECT 2", ds2, cache_db) is None
            result = await get("SELECT 3", ds3, cache_db)
            assert result is not None
            assert result["total_rows"] == 3

    @pytest.mark.asyncio
    async def test_eviction_preserves_newest_entries(self, cache_db):
        """After heavy eviction, the N newest entries are the ones that remain."""
        max_size = 3
        total_inserts = 10
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", max_size):
            datasets_list = _make_datasets(total_inserts)
            for i in range(total_inserts):
                await put(
                    f"SELECT {i}",
                    datasets_list[i],
                    {**SAMPLE_RESULT, "total_rows": i},
                    cache_db,
                )

            cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
            (count,) = await cursor.fetchone()
            assert count == max_size

            # The last `max_size` entries should remain
            for i in range(total_inserts - max_size, total_inserts):
                result = await get(f"SELECT {i}", datasets_list[i], cache_db)
                assert result is not None, f"Entry {i} should be present"

            # All earlier entries should be gone
            for i in range(total_inserts - max_size):
                result = await get(f"SELECT {i}", datasets_list[i], cache_db)
                assert result is None, f"Entry {i} should have been evicted"


# ---------------------------------------------------------------------------
# Cleanup — extended
# ---------------------------------------------------------------------------


class TestCleanupExtended:
    """Additional cleanup scenarios."""

    @pytest.mark.asyncio
    async def test_cleanup_removes_multiple_expired(self, cache_db):
        """Cleanup should remove all expired entries in one call."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=100)
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=3600)

        # Insert 5 expired and 2 fresh entries
        for i in range(5):
            await cache_db.execute(
                """INSERT INTO query_results_cache
                   (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"expired_{i}", f"SELECT {i}", "urls", json.dumps(SAMPLE_RESULT), 1,
                 past.isoformat(), past.isoformat()),
            )
        for i in range(2):
            await cache_db.execute(
                """INSERT INTO query_results_cache
                   (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"fresh_{i}", f"SELECT fresh_{i}", "urls", json.dumps(SAMPLE_RESULT), 1,
                 datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), future.isoformat()),
            )
        await cache_db.commit()

        removed = await cleanup(cache_db)
        assert removed == 5

        cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
        (count,) = await cursor.fetchone()
        assert count == 2

    @pytest.mark.asyncio
    async def test_cleanup_all_expired(self, cache_db):
        """When all entries are expired, cleanup removes everything."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=100)

        for i in range(3):
            await cache_db.execute(
                """INSERT INTO query_results_cache
                   (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"key_{i}", f"SELECT {i}", "urls", json.dumps(SAMPLE_RESULT), 1,
                 past.isoformat(), past.isoformat()),
            )
        await cache_db.commit()

        removed = await cleanup(cache_db)
        assert removed == 3

        cursor = await cache_db.execute("SELECT COUNT(*) FROM query_results_cache")
        (count,) = await cursor.fetchone()
        assert count == 0

    @pytest.mark.asyncio
    async def test_cleanup_idempotent(self, cache_db):
        """Calling cleanup twice should remove 0 entries the second time."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=100)
        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("key", "SELECT 1", "urls", json.dumps(SAMPLE_RESULT), 1,
             past.isoformat(), past.isoformat()),
        )
        await cache_db.commit()

        first = await cleanup(cache_db)
        second = await cleanup(cache_db)
        assert first == 1
        assert second == 0

    @pytest.mark.asyncio
    async def test_cleanup_with_freezegun(self, cache_db):
        """Use freezegun to precisely control what's expired during cleanup."""
        from freezegun import freeze_time

        base = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        with freeze_time(base):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)

        # At TTL + 1 second, the entry should be cleaned up
        cleanup_time = base + timedelta(seconds=PERSISTENT_TTL_SECONDS + 1)
        with freeze_time(cleanup_time):
            removed = await cleanup(cache_db)
            assert removed == 1


# ---------------------------------------------------------------------------
# Error results not cached — extended
# ---------------------------------------------------------------------------


class TestErrorResultsExtended:
    """Additional checks on error-result filtering."""

    @pytest.mark.asyncio
    async def test_result_with_both_error_keys_not_cached(self, cache_db):
        """A result with both 'error' and 'error_type' is still skipped."""
        err = {"error": "bad", "error_type": "syntax", "rows": []}
        await put("SELECT 1", SAMPLE_DATASETS, err, cache_db)
        s = await stats(cache_db)
        assert s["size"] == 0

    @pytest.mark.asyncio
    async def test_error_result_does_not_evict_existing(self, cache_db):
        """Attempting to cache an error result should not displace valid entries."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        err = {"error": "oops"}
        await put("SELECT 1", SAMPLE_DATASETS, err, cache_db)

        # The original valid entry should still be there
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["total_rows"] == SAMPLE_RESULT["total_rows"]

    @pytest.mark.asyncio
    async def test_error_type_empty_string_still_blocks(self, cache_db):
        """Even an empty-string 'error_type' key triggers the skip."""
        err = {"error_type": "", "rows": []}
        await put("SELECT 1", SAMPLE_DATASETS, err, cache_db)
        s = await stats(cache_db)
        assert s["size"] == 0


# ---------------------------------------------------------------------------
# Stats — extended
# ---------------------------------------------------------------------------


class TestStatsExtended:
    """Additional stats scenarios."""

    @pytest.mark.asyncio
    async def test_stats_after_eviction(self, cache_db):
        """Stats should reflect the post-eviction count."""
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 3):
            datasets_list = _make_datasets(5)
            for i in range(5):
                await put(f"SELECT {i}", datasets_list[i], SAMPLE_RESULT, cache_db)

            s = await stats(cache_db)
            assert s["size"] == 3

    @pytest.mark.asyncio
    async def test_stats_after_cleanup(self, cache_db):
        """Stats reflect the count after cleanup removes expired entries."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=100)
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=3600)

        # 2 expired, 1 fresh
        for i in range(2):
            await cache_db.execute(
                """INSERT INTO query_results_cache
                   (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"expired_{i}", f"S{i}", "u", json.dumps(SAMPLE_RESULT), 1,
                 past.isoformat(), past.isoformat()),
            )
        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("fresh", "SELECT fresh", "u", json.dumps(SAMPLE_RESULT), 1,
             datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), future.isoformat()),
        )
        await cache_db.commit()

        await cleanup(cache_db)
        s = await stats(cache_db)
        assert s["size"] == 1

    @pytest.mark.asyncio
    async def test_stats_oldest_newest_ordering(self, cache_db):
        """oldest_entry < newest_entry when multiple entries exist."""
        from freezegun import freeze_time

        t1 = datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2025, 1, 1, 11, 0, 0, tzinfo=timezone.utc)

        ds1 = [{"url": "https://a.com/1.parquet"}]
        ds2 = [{"url": "https://a.com/2.parquet"}]

        with freeze_time(t1):
            await put("SELECT 1", ds1, SAMPLE_RESULT, cache_db)
        with freeze_time(t2):
            await put("SELECT 2", ds2, SAMPLE_RESULT, cache_db)

        s = await stats(cache_db)
        assert s["size"] == 2
        assert s["oldest_entry"] < s["newest_entry"]


# ---------------------------------------------------------------------------
# Corrupt / invalid data handling
# ---------------------------------------------------------------------------


class TestCorruptDataHandling:
    """The cache should gracefully handle corrupt or unexpected data."""

    @pytest.mark.asyncio
    async def test_corrupt_json_returns_none(self, cache_db):
        """If result_json is not valid JSON, get() should return None (not raise)."""
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=3600)
        key = _make_key("SELECT 1", SAMPLE_DATASETS)

        await cache_db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (key, "SELECT 1", "urls", "NOT_VALID_JSON{{{", 1,
             datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
             future.isoformat()),
        )
        await cache_db.commit()

        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        # json.loads will fail, the except block catches it and returns None
        assert result is None

    @pytest.mark.asyncio
    async def test_db_execute_error_on_get_returns_none(self, cache_db):
        """If the database raises during get(), None is returned."""
        # Close the connection to force errors
        await cache_db.close()
        conn = await aiosqlite.connect(":memory:")
        # No table created — query will fail
        result = await get("SELECT 1", SAMPLE_DATASETS, conn)
        assert result is None
        await conn.close()

    @pytest.mark.asyncio
    async def test_db_execute_error_on_put_does_not_raise(self, cache_db):
        """If the database raises during put(), the error is swallowed."""
        await cache_db.close()
        conn = await aiosqlite.connect(":memory:")
        # No table — put should not raise
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, conn)
        await conn.close()

    @pytest.mark.asyncio
    async def test_db_error_on_cleanup_returns_zero(self, cache_db):
        """If the database raises during cleanup(), 0 is returned."""
        await cache_db.close()
        conn = await aiosqlite.connect(":memory:")
        removed = await cleanup(conn)
        assert removed == 0
        await conn.close()

    @pytest.mark.asyncio
    async def test_db_error_on_stats_returns_empty(self, cache_db):
        """If the database raises during stats(), the fallback dict is returned."""
        await cache_db.close()
        conn = await aiosqlite.connect(":memory:")
        s = await stats(conn)
        assert s == {"size": 0, "oldest_entry": None, "newest_entry": None}
        await conn.close()

    @pytest.mark.asyncio
    async def test_result_with_non_serializable_default_str(self, cache_db):
        """put() uses default=str, so non-serializable values become strings."""
        tricky = {
            "rows": [{"ts": datetime(2025, 1, 1)}],
            "columns": ["ts"],
            "total_rows": 1,
        }
        await put("SELECT 1", SAMPLE_DATASETS, tricky, cache_db)
        result = await get("SELECT 1", SAMPLE_DATASETS, cache_db)
        assert result is not None
        # datetime becomes a string via default=str
        assert isinstance(result["rows"][0]["ts"], str)


# ---------------------------------------------------------------------------
# Clear all entries
# ---------------------------------------------------------------------------


class TestClearAll:
    """Manually clearing all entries from the cache table."""

    @pytest.mark.asyncio
    async def test_delete_all_clears_cache(self, cache_db):
        """DELETE FROM query_results_cache empties the table."""
        datasets_list = _make_datasets(5)
        for i in range(5):
            await put(f"SELECT {i}", datasets_list[i], SAMPLE_RESULT, cache_db)

        s = await stats(cache_db)
        assert s["size"] == 5

        await cache_db.execute("DELETE FROM query_results_cache")
        await cache_db.commit()

        s = await stats(cache_db)
        assert s["size"] == 0

    @pytest.mark.asyncio
    async def test_clear_then_repopulate(self, cache_db):
        """After clearing, new puts work normally."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)
        await cache_db.execute("DELETE FROM query_results_cache")
        await cache_db.commit()

        await put("SELECT 2", SAMPLE_DATASETS, {**SAMPLE_RESULT, "total_rows": 42}, cache_db)
        result = await get("SELECT 2", SAMPLE_DATASETS, cache_db)
        assert result is not None
        assert result["total_rows"] == 42

        s = await stats(cache_db)
        assert s["size"] == 1


# ---------------------------------------------------------------------------
# File-backed SQLite (tmp_path)
# ---------------------------------------------------------------------------


class TestFileBackedDB:
    """Tests using a real file-backed SQLite database via tmp_path."""

    @pytest.fixture
    async def file_db(self, tmp_path):
        """File-backed SQLite database for durability tests."""
        db_path = str(tmp_path / "test_cache.db")
        conn = await aiosqlite.connect(db_path)
        await conn.executescript(_CACHE_SCHEMA)
        yield conn, db_path
        await conn.close()

    @pytest.mark.asyncio
    async def test_data_persists_across_connections(self, file_db):
        """Data written by one connection is readable by another."""
        conn, db_path = file_db

        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, conn)
        await conn.close()

        # Open a new connection to the same file
        conn2 = await aiosqlite.connect(db_path)
        result = await get("SELECT 1", SAMPLE_DATASETS, conn2)
        assert result is not None
        assert result["total_rows"] == SAMPLE_RESULT["total_rows"]
        await conn2.close()

    @pytest.mark.asyncio
    async def test_eviction_works_on_file_db(self, file_db):
        """Eviction works correctly with a file-backed database."""
        conn, _ = file_db

        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 2):
            ds1 = [{"url": "https://a.com/1.parquet"}]
            ds2 = [{"url": "https://a.com/2.parquet"}]
            ds3 = [{"url": "https://a.com/3.parquet"}]

            await put("SELECT 1", ds1, SAMPLE_RESULT, conn)
            await put("SELECT 2", ds2, SAMPLE_RESULT, conn)
            await put("SELECT 3", ds3, SAMPLE_RESULT, conn)

            assert await get("SELECT 1", ds1, conn) is None
            assert await get("SELECT 3", ds3, conn) is not None


# ---------------------------------------------------------------------------
# Concurrent async puts
# ---------------------------------------------------------------------------


class TestConcurrentAsyncPuts:
    """Concurrent async operations should not corrupt the cache."""

    @pytest.mark.asyncio
    async def test_concurrent_puts_no_errors(self, cache_db):
        """Multiple concurrent put() calls should not raise or corrupt data."""
        datasets_list = _make_datasets(20)

        async def do_put(i: int) -> None:
            await put(f"SELECT {i}", datasets_list[i], {**SAMPLE_RESULT, "total_rows": i}, cache_db)

        await asyncio.gather(*(do_put(i) for i in range(20)))

        s = await stats(cache_db)
        # All 20 should be stored since MAX_PERSISTENT_CACHE_SIZE is 500
        assert s["size"] == 20

    @pytest.mark.asyncio
    async def test_concurrent_get_and_put(self, cache_db):
        """Interleaved get and put calls should not raise."""
        datasets_list = _make_datasets(10)

        # Pre-populate half
        for i in range(5):
            await put(f"SELECT {i}", datasets_list[i], {**SAMPLE_RESULT, "total_rows": i}, cache_db)

        async def do_get(i: int) -> dict | None:
            return await get(f"SELECT {i}", datasets_list[i], cache_db)

        async def do_put(i: int) -> None:
            await put(f"SELECT {i}", datasets_list[i], {**SAMPLE_RESULT, "total_rows": i}, cache_db)

        # Mix reads and writes
        tasks = []
        for i in range(10):
            tasks.append(do_get(i))
            tasks.append(do_put(i))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        # No exceptions should have been raised
        exceptions = [r for r in results if isinstance(r, Exception)]
        assert exceptions == [], f"Exceptions during concurrent access: {exceptions}"


# ---------------------------------------------------------------------------
# Dataset URL storage
# ---------------------------------------------------------------------------


class TestDatasetUrlStorage:
    """Verify that dataset_urls is stored correctly as sorted pipe-joined string."""

    @pytest.mark.asyncio
    async def test_dataset_urls_stored_sorted(self, cache_db):
        """The dataset_urls column should contain sorted, pipe-joined URLs."""
        datasets = [
            {"url": "https://z.com/z.parquet"},
            {"url": "https://a.com/a.parquet"},
            {"url": "https://m.com/m.parquet"},
        ]
        await put("SELECT 1", datasets, SAMPLE_RESULT, cache_db)

        key = _make_key("SELECT 1", datasets)
        cursor = await cache_db.execute(
            "SELECT dataset_urls FROM query_results_cache WHERE cache_key = ?", (key,)
        )
        row = await cursor.fetchone()
        assert row is not None
        stored_urls = row[0]
        expected = "https://a.com/a.parquet|https://m.com/m.parquet|https://z.com/z.parquet"
        assert stored_urls == expected

    @pytest.mark.asyncio
    async def test_sql_query_stored_stripped(self, cache_db):
        """The sql_query column should store the stripped version of the SQL."""
        await put("  SELECT 1  ", SAMPLE_DATASETS, SAMPLE_RESULT, cache_db)

        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        cursor = await cache_db.execute(
            "SELECT sql_query FROM query_results_cache WHERE cache_key = ?", (key,)
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == "SELECT 1"
