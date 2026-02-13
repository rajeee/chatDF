"""Extended hardening tests for WorkerPool service.

Covers:
- Cache integration (in-memory + persistent cache fallback/promotion)
- Task cancellation / timeout behavior
- Error handling during pool operations (pool not initialized, shutdown)
- Edge cases in run_query (empty results, large results, error results)
- Property accessors and set_db_pool
"""

from __future__ import annotations

import asyncio
import multiprocessing
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.worker_pool import (
    DEFAULT_POOL_SIZE,
    MAX_TASKS_PER_CHILD,
    QUERY_TIMEOUT,
    WorkerPool,
    shutdown,
    start,
    _run_query,
    _validate_url,
    _get_schema,
)


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


# ---------------------------------------------------------------------------
# 1. Cache integration tests
# ---------------------------------------------------------------------------


class TestCacheIntegration:
    """Tests for in-memory and persistent cache interplay in run_query."""

    async def test_in_memory_cache_hit_returns_cached_flag(self):
        """When the in-memory cache has a result, return it with cached=True."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/data.parquet", "table_name": "t"}]
        cached_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        # Pre-populate the in-memory cache
        wp._query_cache.put(sql, datasets, cached_result)

        result = await wp.run_query(sql, datasets)
        assert result["cached"] is True
        assert result["rows"] == [[1]]
        # The actual pool should never be called
        wp._pool.apply_async.assert_not_called()

    async def test_persistent_cache_hit_promotes_to_memory(self):
        """When persistent cache has a result, promote it to in-memory and return cached=True."""
        wp = _make_worker_pool()
        sql = "SELECT * FROM t"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        persistent_result = {"rows": [[42]], "columns": ["val"], "total_rows": 1}

        # Set up a mock db_pool
        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()
        wp.set_db_pool(mock_db_pool)

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=persistent_result)

            result = await wp.run_query(sql, datasets)

        assert result["cached"] is True
        assert result["rows"] == [[42]]
        # Verify it was promoted to in-memory cache
        mem_cached = wp._query_cache.get(sql, datasets)
        assert mem_cached is not None
        assert mem_cached["rows"] == [[42]]
        # Pool should not have been called
        wp._pool.apply_async.assert_not_called()

    async def test_persistent_cache_miss_falls_through_to_worker(self):
        """When persistent cache returns None, execute query in the pool."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()
        mock_db_pool.get_write_connection.return_value = MagicMock()
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

    async def test_persistent_cache_error_falls_back_to_worker(self):
        """When persistent cache raises, log warning and execute query anyway."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        mock_db_pool = MagicMock()
        mock_db_pool.acquire_read = AsyncMock(side_effect=RuntimeError("db gone"))
        mock_db_pool.get_write_connection.return_value = MagicMock()
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.put = AsyncMock()
            result = await wp.run_query(sql, datasets)

        # Should still succeed via the worker
        assert result["rows"] == [[1]]

    async def test_persistent_cache_store_failure_does_not_break_response(self):
        """When storing to persistent cache fails, the query result is still returned."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()
        mock_db_pool.get_write_connection.side_effect = RuntimeError("write failed")
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=None)
            mock_pc.put = AsyncMock()
            result = await wp.run_query(sql, datasets)

        assert result == worker_result

    async def test_no_db_pool_skips_persistent_cache(self):
        """When db_pool is None, skip persistent cache entirely."""
        wp = _make_worker_pool()
        assert wp._db_pool is None  # default

        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        result = await wp.run_query(sql, datasets)
        assert result == worker_result


# ---------------------------------------------------------------------------
# 2. Task cancellation / timeout behavior
# ---------------------------------------------------------------------------


class TestTimeoutBehavior:
    """Tests for timeout handling across all async wrappers."""

    async def test_validate_url_timeout_returns_error_dict(self):
        """validate_url returns a timeout error dict on TimeoutError."""
        pool = _make_mock_pool()
        ar = _make_async_result(side_effect=multiprocessing.TimeoutError())
        pool.apply_async.return_value = ar

        result = await _validate_url(pool, "http://example.com/data.parquet")
        assert result["error_type"] == "timeout"
        assert "URL validation timed out" in result["message"]

    async def test_get_schema_timeout_returns_error_dict(self):
        """get_schema returns a timeout error dict on TimeoutError."""
        pool = _make_mock_pool()
        ar = _make_async_result(side_effect=multiprocessing.TimeoutError())
        pool.apply_async.return_value = ar

        result = await _get_schema(pool, "http://example.com/data.parquet")
        assert result["error_type"] == "timeout"
        assert "Schema extraction timed out" in result["message"]

    async def test_run_query_timeout_returns_error_dict(self):
        """run_query returns a timeout error dict on TimeoutError."""
        pool = _make_mock_pool()
        ar = _make_async_result(side_effect=multiprocessing.TimeoutError())
        pool.apply_async.return_value = ar

        result = await _run_query(pool, "SELECT 1", [])
        assert result["error_type"] == "timeout"
        assert "Query execution timed out" in result["message"]
        assert str(QUERY_TIMEOUT) in result["details"]



# ---------------------------------------------------------------------------
# 3. Error handling during pool operations
# ---------------------------------------------------------------------------


class TestPoolErrorHandling:
    """Tests for unexpected exceptions during pool operations."""

    async def test_validate_url_unexpected_exception(self):
        """validate_url wraps unexpected exceptions into an internal error dict."""
        pool = _make_mock_pool()
        ar = _make_async_result(side_effect=ValueError("bad url"))
        pool.apply_async.return_value = ar

        result = await _validate_url(pool, "bad-url")
        assert result["error_type"] == "internal"
        assert "bad url" in result["details"]

    async def test_get_schema_unexpected_exception(self):
        """get_schema wraps unexpected exceptions into an internal error dict."""
        pool = _make_mock_pool()
        ar = _make_async_result(side_effect=OSError("disk error"))
        pool.apply_async.return_value = ar

        result = await _get_schema(pool, "http://example.com/data.parquet")
        assert result["error_type"] == "internal"
        assert "disk error" in result["details"]

    async def test_run_query_unexpected_exception(self):
        """run_query wraps unexpected exceptions into an internal error dict."""
        pool = _make_mock_pool()
        ar = _make_async_result(side_effect=RuntimeError("worker crashed"))
        pool.apply_async.return_value = ar

        result = await _run_query(pool, "SELECT 1", [])
        assert result["error_type"] == "internal"
        assert "worker crashed" in result["details"]

    async def test_pool_apply_async_raises_immediately(self):
        """If apply_async itself raises (e.g., pool terminated), error is caught."""
        pool = _make_mock_pool()
        pool.apply_async.side_effect = ValueError("Pool not running")

        result = await _validate_url(pool, "http://example.com/data.parquet")
        assert result["error_type"] == "internal"
        assert "Pool not running" in result["details"]

    async def test_run_query_pool_apply_async_raises(self):
        """If apply_async raises on run_query (e.g., pool terminated), error is caught."""
        pool = _make_mock_pool()
        pool.apply_async.side_effect = OSError("Pool terminated")

        result = await _run_query(pool, "SELECT 1", [])
        assert result["error_type"] == "internal"
        assert "Pool terminated" in result["details"]


# ---------------------------------------------------------------------------
# 4. Edge cases in run_query
# ---------------------------------------------------------------------------


class TestRunQueryEdgeCases:
    """Edge cases for run_query via WorkerPool."""

    async def test_run_query_empty_result(self):
        """A query returning zero rows still caches and returns normally."""
        wp = _make_worker_pool()
        sql = "SELECT * FROM t WHERE 1=0"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        empty_result = {"rows": [], "columns": ["id", "val"], "total_rows": 0}

        ar = _make_async_result(return_value=empty_result)
        wp._pool.apply_async.return_value = ar

        result = await wp.run_query(sql, datasets)
        assert result["rows"] == []
        assert result["total_rows"] == 0

        # Should be in memory cache now
        cached = wp._query_cache.get(sql, datasets)
        assert cached is not None
        assert cached["total_rows"] == 0

    async def test_run_query_large_result(self):
        """A query returning many rows caches and returns successfully."""
        wp = _make_worker_pool()
        sql = "SELECT * FROM big_table"
        datasets = [{"url": "http://example.com/big.parquet", "table_name": "big_table"}]
        big_rows = [{"id": i, "val": f"row_{i}"} for i in range(1000)]
        large_result = {
            "rows": big_rows,
            "columns": ["id", "val"],
            "total_rows": 1000,
        }

        ar = _make_async_result(return_value=large_result)
        wp._pool.apply_async.return_value = ar

        result = await wp.run_query(sql, datasets)
        assert result["total_rows"] == 1000
        assert len(result["rows"]) == 1000

    async def test_run_query_error_result_not_cached(self):
        """Error results from the worker should not be stored in in-memory cache."""
        wp = _make_worker_pool()
        sql = "INVALID SQL"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        error_result = {"error_type": "sql_error", "message": "syntax error"}

        ar = _make_async_result(return_value=error_result)
        wp._pool.apply_async.return_value = ar

        result = await wp.run_query(sql, datasets)
        assert result["error_type"] == "sql_error"

        # Should NOT be in memory cache (QueryCache.put skips errors)
        cached = wp._query_cache.get(sql, datasets)
        assert cached is None

    async def test_run_query_same_sql_different_datasets(self):
        """Same SQL with different datasets should produce separate cache entries."""
        wp = _make_worker_pool()
        sql = "SELECT COUNT(*) FROM t"
        ds1 = [{"url": "http://example.com/a.parquet", "table_name": "t"}]
        ds2 = [{"url": "http://example.com/b.parquet", "table_name": "t"}]
        result1 = {"rows": [[10]], "columns": ["count"], "total_rows": 1}
        result2 = {"rows": [[20]], "columns": ["count"], "total_rows": 1}

        # First query
        ar1 = _make_async_result(return_value=result1)
        wp._pool.apply_async.return_value = ar1
        r1 = await wp.run_query(sql, ds1)
        assert r1["rows"] == [[10]]

        # Second query - different dataset
        ar2 = _make_async_result(return_value=result2)
        wp._pool.apply_async.return_value = ar2
        r2 = await wp.run_query(sql, ds2)
        assert r2["rows"] == [[20]]

        # Both should be independently cached
        c1 = wp._query_cache.get(sql, ds1)
        c2 = wp._query_cache.get(sql, ds2)
        assert c1["rows"] == [[10]]
        assert c2["rows"] == [[20]]

    async def test_run_query_empty_datasets_list(self):
        """run_query with an empty datasets list still works."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = []
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        result = await wp.run_query(sql, datasets)
        assert result["rows"] == [[1]]


# ---------------------------------------------------------------------------
# 5. WorkerPool properties, set_db_pool, and shutdown
# ---------------------------------------------------------------------------


class TestWorkerPoolMisc:
    """Miscellaneous tests for WorkerPool API surface."""

    def test_query_cache_property(self):
        """query_cache property exposes the QueryCache instance."""
        wp = _make_worker_pool()
        cache = wp.query_cache
        from app.services.query_cache import QueryCache

        assert isinstance(cache, QueryCache)

    def test_db_pool_property_initially_none(self):
        """db_pool property is None when not set."""
        wp = _make_worker_pool()
        assert wp.db_pool is None

    def test_set_db_pool(self):
        """set_db_pool stores the db pool reference."""
        wp = _make_worker_pool()
        mock_db = MagicMock()
        wp.set_db_pool(mock_db)
        assert wp.db_pool is mock_db

    def test_shutdown_calls_terminate_and_join(self):
        """WorkerPool.shutdown() terminates and joins the inner pool."""
        mock_pool = _make_mock_pool()
        wp = WorkerPool(mock_pool)
        wp.shutdown()
        mock_pool.terminate.assert_called_once()
        mock_pool.join.assert_called_once()

    def test_module_shutdown_on_worker_pool_wrapper(self):
        """Module-level shutdown() delegates to WorkerPool.shutdown()."""
        mock_pool = _make_mock_pool()
        wp = WorkerPool(mock_pool)
        shutdown(wp)
        mock_pool.terminate.assert_called_once()
        mock_pool.join.assert_called_once()

    def test_module_shutdown_on_raw_pool(self):
        """Module-level shutdown() works on a raw multiprocessing.Pool too."""
        mock_pool = _make_mock_pool()
        # Make it NOT a WorkerPool instance
        shutdown(mock_pool)
        mock_pool.terminate.assert_called_once()
        mock_pool.join.assert_called_once()

    async def test_run_query_stores_to_persistent_cache_on_success(self):
        """On successful query, result is stored in persistent cache."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()
        mock_write_conn = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(return_value=None)
            mock_pc.put = AsyncMock()

            result = await wp.run_query(sql, datasets)

        assert result == worker_result
        mock_pc.put.assert_awaited_once_with(sql, datasets, worker_result, mock_write_conn)

    async def test_run_query_releases_read_conn_even_on_persistent_cache_get_error(self):
        """Read connection is always released even if persistent_cache.get fails."""
        wp = _make_worker_pool()
        sql = "SELECT 1"
        datasets = [{"url": "http://example.com/d.parquet", "table_name": "t"}]
        worker_result = {"rows": [[1]], "columns": ["1"], "total_rows": 1}

        mock_db_pool = MagicMock()
        mock_read_conn = AsyncMock()
        mock_db_pool.acquire_read = AsyncMock(return_value=mock_read_conn)
        mock_db_pool.release_read = AsyncMock()
        mock_db_pool.get_write_connection.return_value = MagicMock()
        wp.set_db_pool(mock_db_pool)

        ar = _make_async_result(return_value=worker_result)
        wp._pool.apply_async.return_value = ar

        with patch("app.services.worker_pool.persistent_cache") as mock_pc:
            mock_pc.get = AsyncMock(side_effect=RuntimeError("cache broken"))
            mock_pc.put = AsyncMock()

            result = await wp.run_query(sql, datasets)

        # Read connection must be released
        mock_db_pool.release_read.assert_awaited_once_with(mock_read_conn)
        assert result == worker_result

    async def test_validate_url_delegates_correctly(self):
        """WorkerPool.validate_url calls _validate_url with correct arguments."""
        wp = _make_worker_pool()
        expected = {"valid": True, "url": "http://example.com/data.parquet"}
        ar = _make_async_result(return_value=expected)
        wp._pool.apply_async.return_value = ar

        result = await wp.validate_url("http://example.com/data.parquet")
        assert result == expected

    async def test_get_schema_delegates_correctly(self):
        """WorkerPool.get_schema calls _get_schema with correct arguments."""
        wp = _make_worker_pool()
        expected = {"columns": [{"name": "id", "type": "Int64"}], "row_count": 5}
        ar = _make_async_result(return_value=expected)
        wp._pool.apply_async.return_value = ar

        result = await wp.get_schema("http://example.com/data.parquet")
        assert result == expected
