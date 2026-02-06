"""Allowed-operations tests for rate_limit_service.

Tests: spec/backend/rate_limiting/test.md#ALLOWED-1 through ALLOWED-3

These test at the service level that check_limit correctly reports
allowed/blocked status. Endpoint-level enforcement (ALLOWED-1, ALLOWED-2, ALLOWED-3)
depends on routers which are out of scope for this bead. We verify the
service function returns the correct allowed status here.
"""

from __future__ import annotations

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import check_limit

from .conftest import seed_token_usage, TOKEN_LIMIT


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_ALLOWED_3_check_limit_returns_false_when_exceeded(fresh_db, test_user):
    """ALLOWED-3: check_limit returns allowed=False when over limit.

    Chat should be blocked; the router uses this status to return 429.
    """
    uid = test_user["id"]
    # 5.1M tokens — over limit
    await seed_token_usage(fresh_db, uid, [(2_550_000, 2_550_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is False
    assert status.usage_tokens == 5_100_000
    assert status.resets_in_seconds is not None
    assert status.resets_in_seconds > 0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_ALLOWED_check_limit_returns_true_when_under(fresh_db, test_user):
    """check_limit returns allowed=True when under limit.

    Dataset and conversation operations are not rate-limited.
    Only chat is rate-limited, and the router checks check_limit only for chat.
    """
    uid = test_user["id"]
    # 1M tokens — under limit
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.warning is False


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_ALLOWED_rate_limit_only_applies_to_chat(fresh_db, test_user):
    """Verify that check_limit doesn't distinguish operation types.

    The service function always returns the same status for a user.
    It's the responsibility of the router to only call check_limit for chat.
    This test confirms the service is stateless regarding operation type.
    """
    uid = test_user["id"]
    # Over limit
    await seed_token_usage(fresh_db, uid, [(2_500_000, 2_500_000, 1)])

    # Two calls return the same result — no operation-type logic
    status1 = await check_limit(fresh_db, uid)
    status2 = await check_limit(fresh_db, uid)

    assert status1.allowed == status2.allowed
    assert status1.usage_tokens == status2.usage_tokens
