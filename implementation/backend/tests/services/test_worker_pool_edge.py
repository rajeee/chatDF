"""Edge-case tests for the WorkerPool service.

Covers scenarios not fully exercised by existing test suites:
- run_query returns cached result from persistent cache
- run_query falls through to worker when cache misses
- shutdown cleans up properly (terminate + join on the inner pool)
"""

from __future__ import annotations

import multiprocessing
import multiprocessing.pool
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.query_cache import QueryCache
from app.services.worker_pool import WorkerPool, shutdown


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_pool():
    """Create a MagicMock that looks like multiprocessing.pool.Pool."""
    pool = MagicMock(spec=multiprocessing.pool.Pool)
    return pool


def _make_worker_pool(pool=None):
    """Create a WorkerPool with a mock inner pool."""
    if pool is None:
        pool = _make_mock_pool()
    return WorkerPool(pool)


def _make_async_result(return_value=None, side_effect=None):
    """Create a mock AsyncResult whose .get() returns a value or raises."""
    ar = MagicMock()
    if side_effect is not None:
        ar.get.side_effect = side_effect
    else:
        ar.get.return_value = return_value
    return ar


def _make_mock_db_pool(*, persistent_get_result=None, persistent_get_error=None):
    """Create a mock database pool with configurable persistent cache behavior.

    Args:
        persistent_get_result: What persistent_cache.get should return.
        persistent_get_error: If set, persistent_cache.get will raise this.
    """
    mock_db_pool = MagicMock()
    mock_read_conn = AsyncMock()
    mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
    mock_db_pool.release_read = AsyncMock()
    mock_write_conn = MagicMock()
    mock_db_pool.get_write_connection.return_value = mock_write_conn
    return mock_db_pool


# ---------------------------------------------------------------------------
# 1. run_query returns cached result from persistent cache
# ---------------------------------------------------------------------------


class TestPersistentCacheHit:
    """When the persistent (SQLite) cache has a result, run_query returns it."""

    async def test_persistent_cache_hit_returns_with_cached_flag(self):
        """Persistent cache hit returns result with cached=True."""
        wp = _make_worker_pool()
        sql = "SELECT * FROM sales"
        datasets = [{"url": "http://example.com/sales.parquet", "table_name": "sales"}]
        persistent_result = {"rows": [[1, "widget"]], "columns": ["id", "name"], "total_rows": 1}

        mock_db_pool = _make_mock_db_pool()
        wp.set_db_pool(mock_db_pool)

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=persistent_result)

            result = await wp.run_query(sql, datasets)

        assert result["cached"] is True
        assert result["rows"] == [[1, "widget"]]
        assert result["columns"] == ["id", "name"]
        # The worker pool should never have been called
        wp._pool.apply_async.assert_not_called()

    async def test_persistent_cache_hit_promotes_to_memory_cache(self):
        """A persistent cache hit should be promoted to the in-memory cache."""
        wp = _make_worker_pool()
        sql = "SELECT COUNT(*) FROM t"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        persistent_result = {"rows": [[42]], "columns": ["count"], "total_rows": 1}

        mock_db_pool = _make_mock_db_pool()
        wp.set_db_pool(mock_db_pool)

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=persistent_result)

            await wp.run_query(sql, datasets)

        # Verify the in-memory cache now has this entry
        mem_cached = wp._query_cache.get(sql, datasets)
        assert mem_cached is not None
        assert mem_cached["rows"] == [[42]]

    async def test_persistent_cache_hit_skips_when_memory_cache_hits_first(self):
        """In-memory cache is checked before persistent cache; persistent is skipped."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        memory_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        # Pre-populate in-memory cache
        wp._query_cache.put(sql, datasets, memory_result)

        # Even with db_pool set, persistent cache should not be consulted
        mock_db_pool = _make_mock_db_pool()
        wp.set_db_pool(mock_db_pool)

        result = await wp.run_query(sql, datasets)

        assert result["cached"] is True
        assert result["rows"] == [[1]]
        # Persistent cache should not have been checked
        mock_db_pool.acquire_read.assert_not_awaited()
        wp._pool.apply_async.assert_not_called()

    async def test_persistent_cache_hit_with_complex_result(self):
        """Persistent cache returns a complex result with multiple rows and metadata."""
        wp = _make_worker_pool()
        sql = "SELECT id, name, score FROM students ORDER BY score DESC"
        datasets = [{"url": "http://example.com/students.parquet", "table_name": "students"}]
        persistent_result = {
            "rows": [[1, "Alice", 95.5], [2, "Bob", 88.0], [3, "Carol", 92.3]],
            "columns": ["id", "name", "score"],
            "total_rows": 3,
        }

        mock_db_pool = _make_mock_db_pool()
        wp.set_db_pool(mock_db_pool)

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=persistent_result)

            result = await wp.run_query(sql, datasets)

        assert result["cached"] is True
        assert result["total_rows"] == 3
        assert len(result["rows"]) == 3


# ---------------------------------------------------------------------------
# 2. run_query falls through to worker when cache misses
# ---------------------------------------------------------------------------


class TestCacheMissFallthrough:
    """When both caches miss, run_query delegates to the worker pool."""

    async def test_both_caches_miss_executes_in_worker(self):
        """When both in-memory and persistent cache miss, query runs in worker."""
        wp = _make_worker_pool()
        sql = "SELECT * FROM t LIMIT 5"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1], [2], [3], [4], [5]], "columns": ["id"], "total_rows": 5}

        mock_db_pool = _make_mock_db_pool()
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=None)
            mock_pc.put = AsyncMock()

            result = await wp.run_query(sql, datasets)

        assert result == worker_result
        assert "cached" not in result
        wp._pool.apply_async.assert_called_once()

    async def test_cache_miss_stores_result_in_both_caches(self):
        """After a worker execution, the result is stored in both in-memory and persistent caches."""
        wp = _make_worker_pool()
        sql = "SELECT SUM(val) FROM t"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[100]], "columns": ["sum"], "total_rows": 1}

        mock_db_pool = _make_mock_db_pool()
        mock_write_conn = mock_db_pool.get_write_connection.return_value
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=None)
            mock_pc.put = AsyncMock()

            result = await wp.run_query(sql, datasets)

        # Verify in-memory cache was populated
        mem_cached = wp._query_cache.get(sql, datasets)
        assert mem_cached is not None
        assert mem_cached["rows"] == [[100]]

        # Verify persistent cache put was called
        mock_pc.put.assert_awaited_once_with(sql, datasets, worker_result, mock_write_conn)

    async def test_cache_miss_no_db_pool_skips_persistent_cache(self):
        """When db_pool is None, persistent cache is skipped entirely."""
        wp = _make_worker_pool()
        assert wp._db_pool is None  # default

        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        result = await wp.run_query(sql, datasets)

        assert result == worker_result
        wp._pool.apply_async.assert_called_once()

    async def test_persistent_cache_error_falls_through_to_worker(self):
        """When persistent cache raises an exception, query still executes in worker."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        mock_db_pool = MagicMock()
        mock_db_pool.acquire_read = AsyncMock(side_effect=RuntimeError("db connection failed"))
        mock_db_pool.get_write_connection.return_value = MagicMock()
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.put = AsyncMock()
            result = await wp.run_query(sql, datasets)

        assert result["rows"] == [[1]]

    async def test_worker_result_cached_subsequent_call_returns_cached(self):
        """After a worker execution, a subsequent call with the same args returns cached."""
        wp = _make_worker_pool()
        sql = "SELECT * FROM t"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1, "a"]], "columns": ["id", "name"], "total_rows": 1}

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        # First call: worker executes
        result1 = await wp.run_query(sql, datasets)
        assert result1 == worker_result
        assert wp._pool.apply_async.call_count == 1

        # Second call: should hit in-memory cache
        result2 = await wp.run_query(sql, datasets)
        assert result2["cached"] is True
        assert result2["rows"] == [[1, "a"]]
        # Worker should NOT have been called again
        assert wp._pool.apply_async.call_count == 1


# ---------------------------------------------------------------------------
# 3. shutdown cleans up properly
# ---------------------------------------------------------------------------


class TestShutdownCleanup:
    """Verify that shutdown terminates workers and joins the pool."""

    def test_worker_pool_shutdown_calls_terminate_and_join(self):
        """WorkerPool.shutdown() calls terminate() then join() on the inner pool."""
        mock_pool = _make_mock_pool()
        wp = WorkerPool(mock_pool)

        wp.shutdown()

        mock_pool.terminate.assert_called_once()
        mock_pool.join.assert_called_once()

    def test_module_level_shutdown_delegates_to_worker_pool(self):
        """The module-level shutdown() function delegates to WorkerPool.shutdown()."""
        mock_pool = _make_mock_pool()
        wp = WorkerPool(mock_pool)

        shutdown(wp)

        mock_pool.terminate.assert_called_once()
        mock_pool.join.assert_called_once()

    def test_module_level_shutdown_on_raw_pool(self):
        """The module-level shutdown() works on a raw multiprocessing.Pool mock."""
        mock_pool = _make_mock_pool()

        shutdown(mock_pool)

        mock_pool.terminate.assert_called_once()
        mock_pool.join.assert_called_once()

    def test_shutdown_order_terminate_before_join(self):
        """terminate() is called before join() -- enforced by call ordering."""
        mock_pool = _make_mock_pool()
        call_order = []
        mock_pool.terminate.side_effect = lambda: call_order.append("terminate")
        mock_pool.join.side_effect = lambda: call_order.append("join")

        wp = WorkerPool(mock_pool)
        wp.shutdown()

        assert call_order == ["terminate", "join"]

    def test_shutdown_idempotent_mock(self):
        """Calling shutdown twice on a mock pool does not raise (both calls go through)."""
        mock_pool = _make_mock_pool()
        wp = WorkerPool(mock_pool)

        wp.shutdown()
        # Second shutdown should also complete without error
        wp.shutdown()

        assert mock_pool.terminate.call_count == 2
        assert mock_pool.join.call_count == 2

    def test_shutdown_with_query_cache_intact(self):
        """Shutdown does not clear the in-memory query cache (it just stops workers)."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}
        wp._query_cache.put(sql, datasets, result)

        wp.shutdown()

        # Cache should still have the entry (shutdown only affects the process pool)
        cached = wp._query_cache.get(sql, datasets)
        assert cached is not None
        assert cached["rows"] == [[1]]
