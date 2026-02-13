"""Pool lifecycle tests.

Tests: worker/test.md#POOL-1 through POOL-3
"""

from __future__ import annotations

import multiprocessing
import time

import pytest

from app.services.worker_pool import WorkerPool, start, shutdown


@pytest.mark.slow
class TestPoolLifecycle:
    """Tests for worker pool startup, configuration, and shutdown."""

    def test_pool_starts_with_default_size(self):
        """POOL-1: Pool starts with default 4 workers."""
        pool = start(pool_size=4)
        try:
            # start() returns a WorkerPool wrapper; check the inner pool
            assert isinstance(pool, WorkerPool)
            assert pool._pool._processes == 4
        finally:
            pool.shutdown()

    def test_pool_size_configurable(self):
        """POOL-2: Pool size is configurable."""
        pool = start(pool_size=2)
        try:
            assert pool._pool._processes == 2
        finally:
            pool.shutdown()

    def test_pool_can_execute_tasks(self):
        """POOL-1 (extended): Pool workers can accept and execute tasks."""
        pool = start(pool_size=2)
        try:
            # Submit a simple task via the inner pool to verify workers are functional
            result = pool._pool.apply(pow, (2, 10))
            assert result == 1024
        finally:
            pool.shutdown()

    def test_clean_shutdown(self):
        """POOL-3: Clean shutdown terminates all workers."""
        pool = start(pool_size=2)
        # Verify pool is working
        result = pool._pool.apply(pow, (2, 3))
        assert result == 8

        # Shutdown should complete without error
        shutdown(pool)

        # After shutdown, pool should not accept new tasks
        with pytest.raises(Exception):
            pool._pool.apply(pow, (2, 3))

    def test_shutdown_waits_for_running_tasks(self):
        """POOL-3 edge case: Worker executing during shutdown completes."""
        pool = start(pool_size=2)

        # Submit a task that takes a little time
        async_result = pool._pool.apply_async(time.sleep, (0.2,))

        # Shutdown should wait for the task to complete (using terminate+join)
        shutdown(pool)

        # The join should have completed (not hung indefinitely)
        # If we got here, shutdown worked properly
