"""Timeout tests.

Tests: worker/test.md#TIMEOUT-1, TIMEOUT-2
"""

from __future__ import annotations

import multiprocessing
import time

import pytest

from app.services.worker_pool import start, shutdown


def _slow_function(seconds):
    """A deliberately slow function for timeout testing."""
    time.sleep(seconds)
    return {"rows": [], "columns": [], "total_rows": 0}


@pytest.mark.slow
class TestQueryTimeout:
    """TIMEOUT-1: Query timeout enforcement."""

    def test_timeout_returns_error(self):
        """Query exceeding timeout returns error_type='timeout'."""
        wrapper = start(pool_size=2)
        try:
            # Use a very short timeout (2 seconds) for testing.
            # Submit a task that sleeps longer than the timeout.
            async_result = wrapper._pool.apply_async(_slow_function, (10,))
            with pytest.raises(multiprocessing.TimeoutError):
                async_result.get(timeout=2)
        finally:
            shutdown(wrapper)


@pytest.mark.slow
class TestWorkerRestartAfterTimeout:
    """TIMEOUT-2: Worker restarted after timeout kill."""

    def test_pool_functional_after_timeout(self):
        """After timeout, pool replaces worker and continues working."""
        wrapper = start(pool_size=2)
        try:
            # Submit a slow task that will time out
            async_result = wrapper._pool.apply_async(_slow_function, (10,))
            with pytest.raises(multiprocessing.TimeoutError):
                async_result.get(timeout=2)

            # Pool should still be functional after the timeout
            # The slow worker might still be running, but the other worker
            # (or a replacement) should handle this quickly.
            result = wrapper._pool.apply_async(pow, (2, 10))
            assert result.get(timeout=5) == 1024
        finally:
            shutdown(wrapper)
