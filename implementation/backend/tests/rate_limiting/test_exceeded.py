"""Exceeded-state tests for rate_limit_service.

Tests: spec/backend/rate_limiting/test.md#EXCEED-1 through EXCEED-4
"""

from __future__ import annotations

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import check_limit, record_usage

from .conftest import seed_token_usage, TOKEN_LIMIT


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_EXCEED_1_exactly_at_limit(fresh_db, test_user):
    """EXCEED-1: At exactly 5,000,000 tokens, request is blocked."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(2_500_000, 2_500_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is False
    assert status.usage_tokens == 5_000_000
    assert status.remaining_tokens == 0
    assert status.usage_percent == pytest.approx(100.0)
    assert status.resets_in_seconds is not None
    assert status.resets_in_seconds > 0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_EXCEED_2_over_limit(fresh_db, test_user):
    """EXCEED-2: At 5,100,000 tokens (over limit), request is blocked."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(2_550_000, 2_550_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is False
    assert status.usage_tokens == 5_100_000
    assert status.remaining_tokens == 0
    assert status.usage_percent > 100.0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_EXCEED_3_no_mid_stream_cutoff(fresh_db, test_user):
    """EXCEED-3: First check allows, recording pushes over, next check blocks.

    This verifies the no-mid-stream-cutoff behavior: the first check allows
    the request, recording happens after completion, then the next check blocks.
    """
    uid = test_user["id"]
    # Start at 4,900,000 tokens
    await seed_token_usage(fresh_db, uid, [(2_450_000, 2_450_000, 1)])

    # First check — allowed
    status1 = await check_limit(fresh_db, uid)
    assert status1.allowed is True

    # Simulate request completing and recording 200k more tokens
    await record_usage(fresh_db, uid, None, 100_000, 100_000)

    # Second check — now blocked (4,900,000 + 200,000 = 5,100,000)
    status2 = await check_limit(fresh_db, uid)
    assert status2.allowed is False
    assert status2.usage_tokens == 5_100_000


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_EXCEED_4_post_request_pushes_over(fresh_db, test_user):
    """EXCEED-4: Recording tokens after a request pushes user over limit."""
    uid = test_user["id"]
    # Start at 4,999,000 tokens
    await seed_token_usage(fresh_db, uid, [(2_499_500, 2_499_500, 1)])

    # First check — allowed (under limit)
    status1 = await check_limit(fresh_db, uid)
    assert status1.allowed is True
    assert status1.usage_tokens == 4_999_000

    # Record 50,000 more tokens (pushes to 5,049,000)
    await record_usage(fresh_db, uid, None, 25_000, 25_000)

    # Next check — blocked
    status2 = await check_limit(fresh_db, uid)
    assert status2.allowed is False
    assert status2.usage_tokens == 5_049_000
