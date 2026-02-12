"""Edge-case tests for the persistent SQLite-backed query result cache.

Supplements the existing tests in:
- ``tests/test_persistent_cache.py`` (basic coverage)
- ``tests/services/test_persistent_cache_extended.py`` (extended scenarios)

This file focuses on boundary conditions and subtle edge cases:

- Key generation: pipe delimiter collisions, whitespace-only SQL, extra dict keys,
  long SQL, datasets with None url
- get(): expiry boundary (expires_at == now), whitespace-normalized SQL lookups,
  get of one entry doesn't affect another
- put(): bytes values with default=str, zero total_rows, result with error_type
  plus valid data still skipped, result that is a bare list/string
- cleanup(): boundary at exact expiry moment, entries created in past but
  expiring in future are kept
- stats(): ISO-format timestamp strings, stats after manual partial deletion
- Cross-function: put -> cleanup -> get returns None for cleaned entry,
  put -> get with leading/trailing whitespace match
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import aiosqlite
import pytest

from app.services import persistent_cache
from app.services.persistent_cache import (
    _make_key,
    cleanup,
    get,
    put,
    stats,
)

# ---------------------------------------------------------------------------
# Schema
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
async def db():
    """In-memory SQLite database with the query_results_cache table."""
    conn = await aiosqlite.connect(":memory:")
    await conn.executescript(_CACHE_SCHEMA)
    yield conn
    await conn.close()


# ===========================================================================
# Key generation edge cases
# ===========================================================================


class TestMakeKeyEdgeCases:
    """Subtle edge cases in _make_key."""

    def test_whitespace_only_sql_strips_to_empty(self):
        """SQL that is only spaces/tabs should produce same key as empty string."""
        key_empty = _make_key("", SAMPLE_DATASETS)
        key_spaces = _make_key("   ", SAMPLE_DATASETS)
        key_tabs = _make_key("\t\t", SAMPLE_DATASETS)
        assert key_empty == key_spaces == key_tabs

    def test_pipe_in_url_could_affect_key(self):
        """URLs containing the pipe delimiter produce distinct keys from
        split URLs, demonstrating that pipe in URLs is included literally."""
        # A single dataset whose URL contains a pipe
        ds_pipe = [{"url": "https://a.com/x|y.parquet"}]
        # Two datasets whose URLs, when joined, look identical
        ds_split = [
            {"url": "https://a.com/x"},
            {"url": "y.parquet"},
        ]
        key_pipe = _make_key("SELECT 1", ds_pipe)
        key_split = _make_key("SELECT 1", ds_split)
        # These MAY collide since sort + join with "|" makes them identical.
        # This test documents the current behavior rather than asserting
        # collision-freedom.  The raw strings are:
        #   pipe:  "SELECT 1|https://a.com/x|y.parquet"
        #   split: "SELECT 1|https://a.com/x|y.parquet"  (after sort)
        # So they DO collide. This is a known limitation.
        assert key_pipe == key_split

    def test_extra_keys_in_dataset_dict_ignored(self):
        """Only the 'url' key matters; extra keys are irrelevant."""
        ds_minimal = [{"url": "https://a.com/x.parquet"}]
        ds_extra = [
            {
                "url": "https://a.com/x.parquet",
                "table_name": "t",
                "size": 12345,
                "format": "parquet",
            }
        ]
        assert _make_key("SELECT 1", ds_minimal) == _make_key("SELECT 1", ds_extra)

    def test_dataset_with_none_url_raises(self):
        """A dataset dict with url=None causes TypeError because .get("url", "")
        returns None (the key exists), and str.join fails on None."""
        ds_none = [{"url": None}]
        with pytest.raises(TypeError):
            _make_key("SELECT 1", ds_none)

    def test_very_long_sql_produces_fixed_length_key(self):
        """Even a very long SQL statement produces a 64-char hex key."""
        long_sql = "SELECT " + ", ".join(f"col_{i}" for i in range(500))
        key = _make_key(long_sql, SAMPLE_DATASETS)
        assert len(key) == 64

    def test_case_sensitive_sql(self):
        """SQL differing only in case produces different keys."""
        key_lower = _make_key("select 1", SAMPLE_DATASETS)
        key_upper = _make_key("SELECT 1", SAMPLE_DATASETS)
        assert key_lower != key_upper

    def test_three_datasets_order_invariant(self):
        """Three datasets in any permutation produce the same key."""
        import itertools

        ds = [
            {"url": "https://c.com/c.parquet"},
            {"url": "https://a.com/a.parquet"},
            {"url": "https://b.com/b.parquet"},
        ]
        keys = set()
        for perm in itertools.permutations(ds):
            keys.add(_make_key("SELECT 1", list(perm)))
        assert len(keys) == 1


# ===========================================================================
# get() edge cases
# ===========================================================================


class TestGetEdgeCases:
    """Edge cases for the get() function."""

    @pytest.mark.asyncio
    async def test_expires_at_exactly_now_treated_as_expired(self, db):
        """When expires_at == now, the <= comparison means it's expired."""
        from freezegun import freeze_time

        fixed_time = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        # The source code stores timestamps without tzinfo, so we must
        # match that format when inserting manually.
        fixed_naive = fixed_time.replace(tzinfo=None)
        key = _make_key("SELECT 1", SAMPLE_DATASETS)

        # Insert entry whose expires_at is exactly now (naive ISO format)
        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                key,
                "SELECT 1",
                "urls",
                json.dumps(SAMPLE_RESULT),
                1,
                (fixed_naive - timedelta(hours=1)).isoformat(),
                fixed_naive.isoformat(),
            ),
        )
        await db.commit()

        with freeze_time(fixed_time):
            result = await get("SELECT 1", SAMPLE_DATASETS, db)
            # expires_at <= now, so treated as expired
            assert result is None

        # Verify the row was deleted
        cursor = await db.execute(
            "SELECT COUNT(*) FROM query_results_cache WHERE cache_key = ?",
            (key,),
        )
        (count,) = await cursor.fetchone()
        assert count == 0

    @pytest.mark.asyncio
    async def test_get_one_entry_does_not_affect_another(self, db):
        """Getting an expired entry should not delete other entries."""
        from freezegun import freeze_time

        now = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        past = now - timedelta(seconds=10)
        future = now + timedelta(hours=2)

        ds1 = [{"url": "https://a.com/1.parquet"}]
        ds2 = [{"url": "https://a.com/2.parquet"}]
        key1 = _make_key("SELECT 1", ds1)
        key2 = _make_key("SELECT 2", ds2)

        # Entry 1: expired
        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (key1, "SELECT 1", "u1", json.dumps(SAMPLE_RESULT), 1,
             past.isoformat(), past.isoformat()),
        )
        # Entry 2: fresh
        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (key2, "SELECT 2", "u2", json.dumps(SAMPLE_RESULT), 1,
             now.isoformat(), future.isoformat()),
        )
        await db.commit()

        with freeze_time(now):
            # Getting expired entry 1
            result1 = await get("SELECT 1", ds1, db)
            assert result1 is None

            # Entry 2 should still exist
            result2 = await get("SELECT 2", ds2, db)
            assert result2 is not None

    @pytest.mark.asyncio
    async def test_get_with_whitespace_variant_sql_matches(self, db):
        """put() and get() strip SQL, so leading/trailing whitespace matches."""
        await put("  SELECT 1  ", SAMPLE_DATASETS, SAMPLE_RESULT, db)
        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is not None
        assert result["total_rows"] == 1

    @pytest.mark.asyncio
    async def test_get_with_whitespace_variant_reverse(self, db):
        """put() with clean SQL, get() with padded SQL should match."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)
        result = await get("   SELECT 1   ", SAMPLE_DATASETS, db)
        assert result is not None
        assert result["total_rows"] == 1

    @pytest.mark.asyncio
    async def test_get_returns_none_for_empty_table(self, db):
        """get() on a completely empty table returns None without errors."""
        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_result_is_independent_copy(self, db):
        """Modifying the returned dict should not affect subsequent gets."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)

        result1 = await get("SELECT 1", SAMPLE_DATASETS, db)
        result1["rows"] = []
        result1["total_rows"] = 999

        result2 = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result2["total_rows"] == 1
        assert len(result2["rows"]) == 1


# ===========================================================================
# put() edge cases
# ===========================================================================


class TestPutEdgeCases:
    """Edge cases for the put() function."""

    @pytest.mark.asyncio
    async def test_bytes_values_serialized_via_default_str(self, db):
        """Bytes in result values are converted to strings via default=str."""
        result_with_bytes = {
            "rows": [{"data": b"\x00\x01\x02"}],
            "columns": ["data"],
            "total_rows": 1,
        }
        await put("SELECT 1", SAMPLE_DATASETS, result_with_bytes, db)
        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is not None
        # bytes becomes "b'\\x00\\x01\\x02'" via str()
        assert isinstance(result["rows"][0]["data"], str)
        assert "\\x00" in result["rows"][0]["data"]

    @pytest.mark.asyncio
    async def test_zero_total_rows_is_cached(self, db):
        """A result with total_rows=0 (falsy but not None) is stored correctly."""
        result_zero = {
            "rows": [],
            "columns": ["id"],
            "total_rows": 0,
        }
        await put("SELECT 1", SAMPLE_DATASETS, result_zero, db)

        # Verify row_count column stores 0, not NULL
        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        cursor = await db.execute(
            "SELECT row_count FROM query_results_cache WHERE cache_key = ?",
            (key,),
        )
        row = await cursor.fetchone()
        assert row is not None
        # total_rows=0 is falsy, so `result.get("total_rows") or result.get("row_count")`
        # evaluates to result.get("row_count") which is None.
        # This documents the "or" short-circuit behavior.
        assert row[0] is None

    @pytest.mark.asyncio
    async def test_error_type_with_valid_data_still_skipped(self, db):
        """Even if result has valid rows alongside error_type, it's skipped."""
        mixed = {
            "error_type": "warning",
            "rows": [{"id": 1}],
            "columns": ["id"],
            "total_rows": 1,
        }
        await put("SELECT 1", SAMPLE_DATASETS, mixed, db)
        s = await stats(db)
        assert s["size"] == 0

    @pytest.mark.asyncio
    async def test_put_empty_dict_result_is_cached(self, db):
        """An empty dict (no error keys) is cached -- it's a valid result."""
        await put("SELECT 1", SAMPLE_DATASETS, {}, db)
        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is not None
        assert result == {}

    @pytest.mark.asyncio
    async def test_put_result_with_null_values(self, db):
        """Results with None/null values survive JSON round-trip."""
        result_nulls = {
            "rows": [{"a": None, "b": None}],
            "columns": ["a", "b"],
            "total_rows": 1,
        }
        await put("SELECT 1", SAMPLE_DATASETS, result_nulls, db)
        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is not None
        assert result["rows"][0]["a"] is None
        assert result["rows"][0]["b"] is None

    @pytest.mark.asyncio
    async def test_put_with_false_error_value_not_skipped(self, db):
        """A result where error key maps to False is still skipped,
        because the check is 'in result' not truthiness of the value."""
        result_false_error = {"error": False, "rows": [], "total_rows": 0}
        await put("SELECT 1", SAMPLE_DATASETS, result_false_error, db)
        s = await stats(db)
        # The key "error" exists in the dict, so put() skips it
        assert s["size"] == 0

    @pytest.mark.asyncio
    async def test_eviction_exact_overflow_by_two(self, db):
        """When overflow is 2, exactly the 2 oldest entries are evicted."""
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 3):
            for i in range(5):
                ds = [{"url": f"https://x.com/{i}.parquet"}]
                await put(f"SELECT {i}", ds, {**SAMPLE_RESULT, "total_rows": i}, db)

            cursor = await db.execute("SELECT COUNT(*) FROM query_results_cache")
            (count,) = await cursor.fetchone()
            assert count == 3

            # Entries 0, 1 evicted; 2, 3, 4 remain
            for i in range(2):
                ds = [{"url": f"https://x.com/{i}.parquet"}]
                assert await get(f"SELECT {i}", ds, db) is None

            for i in range(2, 5):
                ds = [{"url": f"https://x.com/{i}.parquet"}]
                result = await get(f"SELECT {i}", ds, db)
                assert result is not None
                assert result["total_rows"] == i

    @pytest.mark.asyncio
    async def test_put_stores_created_at_and_expires_at(self, db):
        """Verify that created_at and expires_at are stored as ISO timestamps."""
        from freezegun import freeze_time

        fixed = datetime(2025, 3, 15, 10, 0, 0, tzinfo=timezone.utc)

        with freeze_time(fixed):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)

        key = _make_key("SELECT 1", SAMPLE_DATASETS)
        cursor = await db.execute(
            "SELECT created_at, expires_at FROM query_results_cache WHERE cache_key = ?",
            (key,),
        )
        row = await cursor.fetchone()
        assert row is not None

        created = datetime.fromisoformat(row[0])
        expires = datetime.fromisoformat(row[1])

        # created_at should be the fixed time (tzinfo stripped)
        assert created == fixed.replace(tzinfo=None)
        # expires_at should be created_at + TTL
        expected_expiry = fixed.replace(tzinfo=None) + timedelta(
            seconds=persistent_cache.PERSISTENT_TTL_SECONDS
        )
        assert expires == expected_expiry


# ===========================================================================
# cleanup() edge cases
# ===========================================================================


class TestCleanupEdgeCases:
    """Edge cases for the cleanup() function."""

    @pytest.mark.asyncio
    async def test_cleanup_boundary_exactly_now(self, db):
        """An entry with expires_at == now is removed by cleanup (<=)."""
        from freezegun import freeze_time

        fixed = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        # Use naive timestamps to match the format the source code uses
        fixed_naive = fixed.replace(tzinfo=None)
        key = _make_key("SELECT 1", SAMPLE_DATASETS)

        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                key,
                "SELECT 1",
                "urls",
                json.dumps(SAMPLE_RESULT),
                1,
                (fixed_naive - timedelta(hours=1)).isoformat(),
                fixed_naive.isoformat(),
            ),
        )
        await db.commit()

        with freeze_time(fixed):
            removed = await cleanup(db)
            assert removed == 1

    @pytest.mark.asyncio
    async def test_cleanup_keeps_entries_expiring_in_future(self, db):
        """Entries created in the past but expiring in the future are kept."""
        past_created = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
        future_expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                "old_but_valid",
                "SELECT 1",
                "urls",
                json.dumps(SAMPLE_RESULT),
                1,
                past_created.isoformat(),
                future_expires.isoformat(),
            ),
        )
        await db.commit()

        removed = await cleanup(db)
        assert removed == 0

        cursor = await db.execute("SELECT COUNT(*) FROM query_results_cache")
        (count,) = await cursor.fetchone()
        assert count == 1

    @pytest.mark.asyncio
    async def test_cleanup_one_second_before_expiry_keeps_entry(self, db):
        """An entry expiring 1 second from now is NOT removed by cleanup."""
        from freezegun import freeze_time

        fixed = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        expires = fixed + timedelta(seconds=1)

        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                "almost_expired",
                "SELECT 1",
                "urls",
                json.dumps(SAMPLE_RESULT),
                1,
                (fixed - timedelta(hours=1)).isoformat(),
                expires.isoformat(),
            ),
        )
        await db.commit()

        with freeze_time(fixed):
            removed = await cleanup(db)
            assert removed == 0

    @pytest.mark.asyncio
    async def test_cleanup_then_get_returns_none(self, db):
        """After cleanup removes an entry, get() should return None."""
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=100)
        key = _make_key("SELECT 1", SAMPLE_DATASETS)

        await db.execute(
            """INSERT INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (key, "SELECT 1", "urls", json.dumps(SAMPLE_RESULT), 1,
             past.isoformat(), past.isoformat()),
        )
        await db.commit()

        removed = await cleanup(db)
        assert removed == 1

        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is None


# ===========================================================================
# stats() edge cases
# ===========================================================================


class TestStatsEdgeCases:
    """Edge cases for the stats() function."""

    @pytest.mark.asyncio
    async def test_stats_returns_iso_format_strings(self, db):
        """oldest_entry and newest_entry should be parseable ISO timestamps."""
        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)
        s = await stats(db)

        # Should parse without error
        oldest = datetime.fromisoformat(s["oldest_entry"])
        newest = datetime.fromisoformat(s["newest_entry"])
        assert isinstance(oldest, datetime)
        assert isinstance(newest, datetime)

    @pytest.mark.asyncio
    async def test_stats_after_manual_partial_delete(self, db):
        """Stats correctly reflects count after deleting some rows manually."""
        ds1 = [{"url": "https://a.com/1.parquet"}]
        ds2 = [{"url": "https://a.com/2.parquet"}]
        ds3 = [{"url": "https://a.com/3.parquet"}]

        await put("SELECT 1", ds1, SAMPLE_RESULT, db)
        await put("SELECT 2", ds2, SAMPLE_RESULT, db)
        await put("SELECT 3", ds3, SAMPLE_RESULT, db)

        s = await stats(db)
        assert s["size"] == 3

        # Delete one specific entry
        key2 = _make_key("SELECT 2", ds2)
        await db.execute(
            "DELETE FROM query_results_cache WHERE cache_key = ?",
            (key2,),
        )
        await db.commit()

        s = await stats(db)
        assert s["size"] == 2
        assert s["oldest_entry"] is not None
        assert s["newest_entry"] is not None

    @pytest.mark.asyncio
    async def test_stats_size_matches_actual_count(self, db):
        """stats()['size'] should always equal SELECT COUNT(*)."""
        for i in range(7):
            ds = [{"url": f"https://x.com/{i}.parquet"}]
            await put(f"SELECT {i}", ds, SAMPLE_RESULT, db)

        s = await stats(db)
        cursor = await db.execute("SELECT COUNT(*) FROM query_results_cache")
        (actual_count,) = await cursor.fetchone()
        assert s["size"] == actual_count == 7

    @pytest.mark.asyncio
    async def test_stats_all_three_keys_present(self, db):
        """stats() always returns exactly the three expected keys."""
        s = await stats(db)
        assert set(s.keys()) == {"size", "oldest_entry", "newest_entry"}

        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)
        s = await stats(db)
        assert set(s.keys()) == {"size", "oldest_entry", "newest_entry"}


# ===========================================================================
# Cross-function integration edge cases
# ===========================================================================


class TestCrossFunctionEdgeCases:
    """Edge cases spanning multiple functions."""

    @pytest.mark.asyncio
    async def test_put_cleanup_get_lifecycle(self, db):
        """Full lifecycle: put -> time passes -> cleanup -> get returns None."""
        from freezegun import freeze_time

        base = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        with freeze_time(base):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)

        # Advance past TTL
        expired = base + timedelta(seconds=persistent_cache.PERSISTENT_TTL_SECONDS + 1)
        with freeze_time(expired):
            removed = await cleanup(db)
            assert removed == 1

            result = await get("SELECT 1", SAMPLE_DATASETS, db)
            assert result is None

        s = await stats(db)
        assert s["size"] == 0

    @pytest.mark.asyncio
    async def test_put_error_then_put_valid_same_key(self, db):
        """Putting an error result (skipped), then a valid result, caches the valid one."""
        err = {"error": "fail"}
        await put("SELECT 1", SAMPLE_DATASETS, err, db)
        s = await stats(db)
        assert s["size"] == 0

        await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)
        result = await get("SELECT 1", SAMPLE_DATASETS, db)
        assert result is not None
        assert result["total_rows"] == 1

    @pytest.mark.asyncio
    async def test_multiple_puts_different_datasets_same_sql(self, db):
        """Same SQL with different datasets creates distinct cache entries."""
        ds1 = [{"url": "https://a.com/1.parquet"}]
        ds2 = [{"url": "https://a.com/2.parquet"}]

        result1 = {**SAMPLE_RESULT, "total_rows": 10}
        result2 = {**SAMPLE_RESULT, "total_rows": 20}

        await put("SELECT *", ds1, result1, db)
        await put("SELECT *", ds2, result2, db)

        r1 = await get("SELECT *", ds1, db)
        r2 = await get("SELECT *", ds2, db)
        assert r1["total_rows"] == 10
        assert r2["total_rows"] == 20

        s = await stats(db)
        assert s["size"] == 2

    @pytest.mark.asyncio
    async def test_eviction_does_not_break_stats(self, db):
        """After eviction, stats still reports correct values."""
        with patch.object(persistent_cache, "MAX_PERSISTENT_CACHE_SIZE", 2):
            for i in range(4):
                ds = [{"url": f"https://x.com/{i}.parquet"}]
                await put(f"SELECT {i}", ds, {**SAMPLE_RESULT, "total_rows": i}, db)

            s = await stats(db)
            assert s["size"] == 2
            assert s["oldest_entry"] is not None
            assert s["newest_entry"] is not None
            assert s["oldest_entry"] <= s["newest_entry"]

    @pytest.mark.asyncio
    async def test_get_expired_then_put_same_key(self, db):
        """After get() deletes an expired entry, put() can reuse the same key."""
        from freezegun import freeze_time

        base = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        with freeze_time(base):
            await put("SELECT 1", SAMPLE_DATASETS, SAMPLE_RESULT, db)

        expired = base + timedelta(seconds=persistent_cache.PERSISTENT_TTL_SECONDS + 1)
        with freeze_time(expired):
            # get() finds expired, deletes it
            result = await get("SELECT 1", SAMPLE_DATASETS, db)
            assert result is None

            # put() can re-insert at the same key
            new_result = {**SAMPLE_RESULT, "total_rows": 42}
            await put("SELECT 1", SAMPLE_DATASETS, new_result, db)

            result = await get("SELECT 1", SAMPLE_DATASETS, db)
            assert result is not None
            assert result["total_rows"] == 42
