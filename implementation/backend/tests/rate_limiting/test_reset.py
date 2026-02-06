"""Reset-time and clock tests for rate_limit_service.

Tests: spec/backend/rate_limiting/test.md#RESET-1, RESET-2, CLOCK-1, CLOCK-2
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import check_limit, record_usage

from .conftest import insert_token_usage, seed_token_usage, TOKEN_LIMIT
from ..factories import make_token_usage


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_RESET_1_resets_in_seconds_calculation(fresh_db, test_user):
    """RESET-1: When over limit, resets_in_seconds reflects when oldest record
    falls out of the 24h window.

    Oldest record is at 20h ago, so it expires in 4h = 14400 seconds.
    """
    uid = test_user["id"]

    # Insert usage at exactly 20 hours ago: 2026-02-04T16:00:00
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=2_500_000,
        output_tokens=2_500_000,
        timestamp="2026-02-04T16:00:00",
    ))

    status = await check_limit(fresh_db, uid)

    assert status.allowed is False
    assert status.resets_in_seconds is not None
    # 24h - 20h = 4h = 14400 seconds; allow 60s tolerance for computation
    assert abs(status.resets_in_seconds - 14400) < 60


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_RESET_1_resets_in_seconds_none_when_under_limit(fresh_db, test_user):
    """resets_in_seconds is None when user is under limit."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(500_000, 500_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.resets_in_seconds is None


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_RESET_1_resets_in_seconds_with_multiple_records(fresh_db, test_user):
    """When multiple records exist, resets_in_seconds uses the oldest one in the window."""
    uid = test_user["id"]

    # Oldest at 22h ago: 2026-02-04T14:00:00 — contributes 3M
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=1_500_000,
        output_tokens=1_500_000,
        timestamp="2026-02-04T14:00:00",
    ))

    # Newer at 2h ago — contributes 2.5M
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=1_250_000,
        output_tokens=1_250_000,
        timestamp="2026-02-05T10:00:00",
    ))

    status = await check_limit(fresh_db, uid)

    assert status.allowed is False
    assert status.resets_in_seconds is not None
    # Oldest record at 22h ago, so it expires in 2h = 7200 seconds
    assert abs(status.resets_in_seconds - 7200) < 60


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_RESET_2_access_restored_after_window_passes(fresh_db, test_user):
    """RESET-2: After enough time passes, old records fall out and user is unblocked."""
    uid = test_user["id"]

    # Seed all usage at 23.5h ago: 2026-02-04T12:30:00
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=2_500_000,
        output_tokens=2_500_000,
        timestamp="2026-02-04T12:30:00",
    ))

    # At current time, 23.5h ago is still in the 24h window
    status1 = await check_limit(fresh_db, uid)
    assert status1.allowed is False

    # Advance time by 1 hour (to 2026-02-05 13:00:00)
    # Now the record at 2026-02-04T12:30:00 is 24.5h old — out of window
    with freeze_time("2026-02-05 13:00:00"):
        status2 = await check_limit(fresh_db, uid)
        assert status2.allowed is True
        assert status2.usage_tokens == 0


# ---------------------------------------------------------------------------
# CLOCK tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_CLOCK_1_server_time_authoritative(fresh_db, test_user):
    """CLOCK-1: record_usage uses server time (datetime.utcnow), not client time."""
    uid = test_user["id"]

    await record_usage(fresh_db, uid, None, 100, 50)

    # Fetch the row directly
    cursor = await fresh_db.execute(
        "SELECT timestamp FROM token_usage WHERE user_id = ?",
        (uid,),
    )
    row = await cursor.fetchone()

    # The stored timestamp should match frozen server time (2026-02-05T12:00:00)
    stored_ts = datetime.fromisoformat(row["timestamp"])
    expected_ts = datetime(2026, 2, 5, 12, 0, 0)
    assert abs((stored_ts - expected_ts).total_seconds()) < 2


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_CLOCK_2_multiple_sessions_shared_budget(fresh_db, test_user):
    """CLOCK-2: Rate limit is shared across all sessions for the same user_id."""
    uid = test_user["id"]

    # "Session A" records some usage (conversation_id=None since we're testing
    # user-level aggregation, not per-conversation tracking)
    await record_usage(fresh_db, uid, None, 1_500_000, 1_500_000)

    # "Session B" records more usage (same user_id, different logical session)
    await record_usage(fresh_db, uid, None, 1_000_000, 1_000_000)

    # Total should be 5M from both "sessions"
    status = await check_limit(fresh_db, uid)

    assert status.usage_tokens == 5_000_000
    assert status.allowed is False
