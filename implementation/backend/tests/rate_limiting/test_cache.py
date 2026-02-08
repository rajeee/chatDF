"""Tests for the in-memory TTL cache in rate_limit_service.

Verifies:
1. Cached results are returned within the TTL window (no extra DB query).
2. Cache is invalidated after ``record_usage()``.
3. ``clear_cache()`` empties the cache.
4. Expired cache entries are not returned.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import (
    _cache,
    _CACHE_TTL_SECONDS,
    check_limit,
    clear_cache,
    record_usage,
)

from .conftest import seed_token_usage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _always_clear_cache():
    """Ensure every test starts and ends with an empty cache."""
    clear_cache()
    yield
    clear_cache()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_cached_result_returned_within_ttl(fresh_db, test_user):
    """Second call within TTL should return the cached object (same identity)."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    first = await check_limit(fresh_db, uid)
    second = await check_limit(fresh_db, uid)

    # Same object returned from cache — not just equal, identical
    assert first is second
    assert first.allowed is True
    assert first.usage_tokens == 1_000_000


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_cache_populated_after_check_limit(fresh_db, test_user):
    """After calling check_limit the cache should contain the user's entry."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(100_000, 100_000, 1)])

    assert uid not in _cache
    await check_limit(fresh_db, uid)
    assert uid in _cache

    cached_status, _expiry = _cache[uid]
    assert cached_status.usage_tokens == 200_000


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_cache_invalidated_after_record_usage(fresh_db, test_user):
    """``record_usage`` must remove the user's cached entry."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    # Populate cache
    status_before = await check_limit(fresh_db, uid)
    assert uid in _cache
    assert status_before.usage_tokens == 1_000_000

    # Record new usage — should invalidate cache
    await record_usage(fresh_db, uid, None, 200_000, 200_000)
    assert uid not in _cache

    # Next check_limit should query DB and reflect new total
    status_after = await check_limit(fresh_db, uid)
    assert status_after.usage_tokens == 1_400_000
    assert status_after is not status_before


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_clear_cache_empties_all_entries(fresh_db, test_user):
    """``clear_cache()`` should remove every entry."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(100_000, 100_000, 1)])

    await check_limit(fresh_db, uid)
    assert len(_cache) > 0

    clear_cache()
    assert len(_cache) == 0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_expired_cache_entry_not_returned(fresh_db, test_user):
    """After the TTL expires the cache entry should be bypassed."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    first = await check_limit(fresh_db, uid)
    assert uid in _cache

    # Simulate time advancing past the TTL
    import time as _time

    expired_time = _time.time() + _CACHE_TTL_SECONDS + 1
    with patch("app.services.rate_limit_service.time") as mock_time:
        # time.time() returns a value past the expiry
        mock_time.time.return_value = expired_time

        second = await check_limit(fresh_db, uid)

    # Should have re-queried — same values but different object
    assert second is not first
    assert second.usage_tokens == first.usage_tokens


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_cache_does_not_cross_users(fresh_db, test_user):
    """Cache entries are keyed per user_id; one user's cache must not affect another."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    await check_limit(fresh_db, uid)
    assert uid in _cache

    # A different user_id should not get the cached result
    fake_uid = "nonexistent-user"
    assert fake_uid not in _cache
