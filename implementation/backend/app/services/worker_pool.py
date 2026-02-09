"""Worker pool management and async wrappers.

Implements: spec/backend/worker/plan.md#pool-initialization
Implements: spec/backend/worker/plan.md#async-wrappers-in-worker_poolpy

Manages the multiprocessing.Pool lifecycle and exposes async wrappers
for worker tasks (validate_url, get_schema, run_query).
"""

from __future__ import annotations

import asyncio
import multiprocessing
import multiprocessing.pool
from concurrent.futures import ProcessPoolExecutor

from app.services.query_cache import QueryCache
from app.workers.data_worker import (
    execute_query as _execute_query,
    extract_schema as _extract_schema,
    fetch_and_validate as _fetch_and_validate,
    profile_column as _profile_column_fn,
    profile_columns as _profile_columns_fn,
)

DEFAULT_POOL_SIZE = 4
MAX_TASKS_PER_CHILD = 50
QUERY_TIMEOUT = 300  # seconds
MAX_PENDING_TASKS = 10


class WorkerPool:
    """Wrapper around multiprocessing.Pool with async convenience methods.

    This is the object stored on ``app.state.worker_pool`` and passed to
    service functions so they can call ``pool.validate_url(url)`` etc.
    """

    def __init__(self, pool: multiprocessing.pool.Pool) -> None:
        self._pool = pool
        self._query_cache = QueryCache()

    async def validate_url(self, url: str) -> dict:
        return await _validate_url(self._pool, url)

    async def get_schema(self, url: str) -> dict:
        return await _get_schema(self._pool, url)

    async def run_query(self, sql: str, datasets: list[dict]) -> dict:
        # Check cache first
        cached = self._query_cache.get(sql, datasets)
        if cached is not None:
            return {**cached, "cached": True}
        # Execute query in worker process
        result = await _run_query(self._pool, sql, datasets)
        # Cache successful results
        self._query_cache.put(sql, datasets, result)
        return result

    @property
    def query_cache(self) -> QueryCache:
        """Expose the query cache for stats and management endpoints."""
        return self._query_cache

    async def profile_columns(self, url: str) -> dict:
        return await _profile_columns(self._pool, url)

    async def profile_column(
        self, url: str, table_name: str, column_name: str, column_type: str
    ) -> dict:
        return await _profile_column(
            self._pool, url, table_name, column_name, column_type
        )

    def shutdown(self) -> None:
        self._pool.terminate()
        self._pool.join()


def start(pool_size: int = DEFAULT_POOL_SIZE) -> WorkerPool:
    """Create and return a multiprocessing Pool.

    Implements: spec/backend/worker/plan.md#pool-initialization

    Args:
        pool_size: Number of worker processes (default 4).

    Returns:
        A multiprocessing.Pool instance ready to accept tasks.
    """
    pool = multiprocessing.Pool(
        processes=pool_size,
        maxtasksperchild=MAX_TASKS_PER_CHILD,
    )
    return WorkerPool(pool)


def shutdown(pool_or_wrapper) -> None:
    """Gracefully shut down the worker pool.

    Implements: spec/backend/worker/plan.md#clean-shutdown

    Terminates all workers and waits for process cleanup.
    """
    if isinstance(pool_or_wrapper, WorkerPool):
        pool_or_wrapper.shutdown()
        return
    pool_or_wrapper.terminate()
    pool_or_wrapper.join()


async def _validate_url(pool: multiprocessing.pool.Pool, url: str) -> dict:
    """Run fetch_and_validate in a worker process.

    Implements: spec/backend/worker/plan.md#async-wrappers-in-worker_poolpy

    Args:
        pool: The multiprocessing pool.
        url: URL to validate.

    Returns:
        Result dict from fetch_and_validate, or error dict on failure.
    """
    try:
        loop = asyncio.get_event_loop()
        async_result = pool.apply_async(_fetch_and_validate, (url,))
        result = await loop.run_in_executor(None, async_result.get, QUERY_TIMEOUT)
        return result
    except multiprocessing.TimeoutError:
        return {
            "error_type": "timeout",
            "message": "URL validation timed out",
            "details": f"Timeout after {QUERY_TIMEOUT}s for URL: {url}",
        }
    except Exception as exc:
        return {
            "error_type": "internal",
            "message": f"Unexpected error during URL validation: {exc}",
            "details": str(exc),
        }


async def _get_schema(pool: multiprocessing.pool.Pool, url: str) -> dict:
    """Run extract_schema in a worker process.

    Implements: spec/backend/worker/plan.md#async-wrappers-in-worker_poolpy

    Args:
        pool: The multiprocessing pool.
        url: Parquet file URL.

    Returns:
        Result dict from extract_schema, or error dict on failure.
    """
    try:
        loop = asyncio.get_event_loop()
        async_result = pool.apply_async(_extract_schema, (url,))
        result = await loop.run_in_executor(None, async_result.get, QUERY_TIMEOUT)
        return result
    except multiprocessing.TimeoutError:
        return {
            "error_type": "timeout",
            "message": "Schema extraction timed out",
            "details": f"Timeout after {QUERY_TIMEOUT}s for URL: {url}",
        }
    except Exception as exc:
        return {
            "error_type": "internal",
            "message": f"Unexpected error during schema extraction: {exc}",
            "details": str(exc),
        }


async def _run_query(
    pool: multiprocessing.pool.Pool,
    sql: str,
    datasets: list[dict],
) -> dict:
    """Run execute_query in a worker process.

    Implements: spec/backend/worker/plan.md#async-wrappers-in-worker_poolpy

    Args:
        pool: The multiprocessing pool.
        sql: SQL query string.
        datasets: List of {"url": str, "table_name": str} dicts.

    Returns:
        Result dict from execute_query, or error dict on failure.
    """
    try:
        loop = asyncio.get_event_loop()
        async_result = pool.apply_async(_execute_query, (sql, datasets))
        result = await loop.run_in_executor(None, async_result.get, QUERY_TIMEOUT)
        return result
    except multiprocessing.TimeoutError:
        return {
            "error_type": "timeout",
            "message": "Query execution timed out",
            "details": f"Timeout after {QUERY_TIMEOUT}s",
        }
    except Exception as exc:
        return {
            "error_type": "internal",
            "message": f"Unexpected error during query execution: {exc}",
            "details": str(exc),
        }


async def _profile_columns(pool: multiprocessing.pool.Pool, url: str) -> dict:
    """Run profile_columns in a worker process.

    Args:
        pool: The multiprocessing pool.
        url: Parquet file URL.

    Returns:
        Result dict from profile_columns, or error dict on failure.
    """
    try:
        loop = asyncio.get_event_loop()
        async_result = pool.apply_async(_profile_columns_fn, (url,))
        result = await loop.run_in_executor(None, async_result.get, QUERY_TIMEOUT)
        return result
    except multiprocessing.TimeoutError:
        return {
            "error_type": "timeout",
            "message": "Column profiling timed out",
            "details": f"Timeout after {QUERY_TIMEOUT}s for URL: {url}",
        }
    except Exception as exc:
        return {
            "error_type": "internal",
            "message": f"Unexpected error during column profiling: {exc}",
            "details": str(exc),
        }


async def _profile_column(
    pool: multiprocessing.pool.Pool,
    url: str,
    table_name: str,
    column_name: str,
    column_type: str,
) -> dict:
    """Run profile_column in a worker process.

    Args:
        pool: The multiprocessing pool.
        url: Parquet file URL.
        table_name: Table name (for consistency).
        column_name: Column to profile.
        column_type: Polars dtype string.

    Returns:
        Result dict from profile_column, or error dict on failure.
    """
    try:
        loop = asyncio.get_event_loop()
        async_result = pool.apply_async(
            _profile_column_fn, (url, table_name, column_name, column_type)
        )
        result = await loop.run_in_executor(None, async_result.get, QUERY_TIMEOUT)
        return result
    except multiprocessing.TimeoutError:
        return {
            "error_type": "timeout",
            "message": "Column profiling timed out",
            "details": f"Timeout after {QUERY_TIMEOUT}s for column: {column_name}",
        }
    except Exception as exc:
        return {
            "error_type": "internal",
            "message": f"Unexpected error during column profiling: {exc}",
            "details": str(exc),
        }
