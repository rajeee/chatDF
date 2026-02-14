"""Tests for periodic cache cleanup background task."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestPeriodicCacheCleanup:
    """Verify the periodic cache cleanup task."""

    @pytest.mark.asyncio
    async def test_cleanup_task_runs(self):
        """The periodic cleanup calls persistent_cache.cleanup."""
        mock_write_conn = AsyncMock()
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        with patch(
            "app.services.persistent_cache.cleanup",
            new_callable=AsyncMock,
            return_value=5,
        ) as mock_cleanup:
            from app.main import _periodic_cache_cleanup

            # Patch sleep to return immediately once, then cancel
            with patch(
                "asyncio.sleep",
                new_callable=AsyncMock,
                side_effect=[None, asyncio.CancelledError],
            ):
                try:
                    await _periodic_cache_cleanup(mock_db_pool)
                except asyncio.CancelledError:
                    pass

            mock_db_pool.get_write_connection.assert_called_once()
            mock_cleanup.assert_called_once_with(mock_write_conn)

    @pytest.mark.asyncio
    async def test_cleanup_logs_when_entries_removed(self):
        """When entries are removed, an info log is emitted."""
        mock_write_conn = AsyncMock()
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        with patch(
            "app.services.persistent_cache.cleanup",
            new_callable=AsyncMock,
            return_value=3,
        ), patch("app.main.logger") as mock_logger:
            from app.main import _periodic_cache_cleanup

            with patch(
                "asyncio.sleep",
                new_callable=AsyncMock,
                side_effect=[None, asyncio.CancelledError],
            ):
                try:
                    await _periodic_cache_cleanup(mock_db_pool)
                except asyncio.CancelledError:
                    pass

            mock_logger.info.assert_called_once_with(
                "Cache cleanup: removed %d expired entries", 3
            )

    @pytest.mark.asyncio
    async def test_cleanup_silent_when_no_entries_removed(self):
        """When no entries are expired, no info log is emitted."""
        mock_write_conn = AsyncMock()
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        with patch(
            "app.services.persistent_cache.cleanup",
            new_callable=AsyncMock,
            return_value=0,
        ), patch("app.main.logger") as mock_logger:
            from app.main import _periodic_cache_cleanup

            with patch(
                "asyncio.sleep",
                new_callable=AsyncMock,
                side_effect=[None, asyncio.CancelledError],
            ):
                try:
                    await _periodic_cache_cleanup(mock_db_pool)
                except asyncio.CancelledError:
                    pass

            mock_logger.info.assert_not_called()

    @pytest.mark.asyncio
    async def test_cleanup_handles_errors_gracefully(self):
        """Errors in cleanup don't crash the task — it keeps looping."""
        call_count = 0

        async def sleep_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count >= 3:
                raise asyncio.CancelledError
            return None

        mock_cursor = AsyncMock()
        mock_cursor.rowcount = 0
        mock_write_conn = AsyncMock()
        mock_write_conn.execute.return_value = mock_cursor
        mock_db_pool = MagicMock()
        mock_db_pool.get_write_connection.return_value = mock_write_conn

        with patch(
            "app.services.persistent_cache.cleanup",
            new_callable=AsyncMock,
            side_effect=[Exception("db error"), 2],
        ) as mock_cleanup, patch(
            "asyncio.sleep",
            new_callable=AsyncMock,
            side_effect=sleep_side_effect,
        ), patch("app.main.logger") as mock_logger:
            from app.main import _periodic_cache_cleanup

            try:
                await _periodic_cache_cleanup(mock_db_pool)
            except asyncio.CancelledError:
                pass

            # cleanup was called twice: first errored, second succeeded
            assert mock_cleanup.call_count == 2
            # The exception was logged
            mock_logger.exception.assert_called_once_with("Cache cleanup error")

    @pytest.mark.asyncio
    async def test_cleanup_interval_constant(self):
        """The cleanup interval is set to 1800 seconds (30 minutes)."""
        from app.main import CACHE_CLEANUP_INTERVAL_SECONDS

        assert CACHE_CLEANUP_INTERVAL_SECONDS == 1800
