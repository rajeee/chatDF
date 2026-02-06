"""Under-limit tests for rate_limit_service.

Tests: spec/backend/rate_limiting/test.md#UNDER-1, UNDER-2
"""

from __future__ import annotations

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import check_limit

from .conftest import seed_token_usage, TOKEN_LIMIT


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_UNDER_1_fresh_user_no_usage(fresh_db, test_user):
    """Fresh user with zero usage is allowed with no warning."""
    status = await check_limit(fresh_db, test_user["id"])

    assert status.allowed is True
    assert status.warning is False
    assert status.usage_tokens == 0
    assert status.limit_tokens == TOKEN_LIMIT
    assert status.remaining_tokens == TOKEN_LIMIT
    assert status.usage_percent == 0.0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_UNDER_1_some_usage_below_limit(fresh_db, test_user):
    """UNDER-1: User with 1M tokens used is allowed with no warning."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.warning is False
    assert status.usage_tokens == 1_000_000
    assert status.remaining_tokens == 4_000_000
    assert status.usage_percent == pytest.approx(20.0)


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_UNDER_2_just_below_warning_threshold(fresh_db, test_user):
    """UNDER-2: User at 3,999,999 tokens (79.99998%) has no warning."""
    uid = test_user["id"]
    # 3,999,999 total = 1,999,999 + 2,000,000
    await seed_token_usage(fresh_db, uid, [(1_999_999, 2_000_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.warning is False
    assert status.usage_tokens == 3_999_999
    assert status.remaining_tokens == 1_000_001
    assert status.usage_percent < 80.0
