"""Rolling-window tests for rate_limit_service.

Tests: spec/backend/rate_limiting/test.md#WINDOW-1, WINDOW-2
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import check_limit

from .conftest import insert_token_usage, seed_token_usage, TOKEN_LIMIT
from ..factories import make_token_usage


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WINDOW_1_only_includes_records_within_24h(fresh_db, test_user):
    """WINDOW-1: Records inside the 24h window are included; those outside are excluded."""
    uid = test_user["id"]

    # Record at 2h ago (in window) - 100k tokens
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=50_000,
        output_tokens=50_000,
        timestamp="2026-02-05T10:00:00",
    ))

    # Record at 23h59m ago (in window) - 200k tokens
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=100_000,
        output_tokens=100_000,
        timestamp="2026-02-04T12:01:00",
    ))

    # Record at exactly 24h ago (OUT of window) - 500k tokens
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=250_000,
        output_tokens=250_000,
        timestamp="2026-02-04T12:00:00",
    ))

    status = await check_limit(fresh_db, uid)

    # Should include only the first two records: 100k + 200k = 300k
    assert status.usage_tokens == 300_000
    assert status.allowed is True


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WINDOW_1_record_just_inside_boundary(fresh_db, test_user):
    """WINDOW-1 edge: Record at 23h59m59s ago is still inside the window."""
    uid = test_user["id"]

    # 23h59m59s ago = 2026-02-04T12:00:01 — just inside the window
    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=100_000,
        output_tokens=100_000,
        timestamp="2026-02-04T12:00:01",
    ))

    status = await check_limit(fresh_db, uid)
    assert status.usage_tokens == 200_000


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WINDOW_1_record_exactly_24h_excluded(fresh_db, test_user):
    """WINDOW-1 edge: Record at exactly 24h ago is excluded."""
    uid = test_user["id"]

    await insert_token_usage(fresh_db, make_token_usage(
        user_id=uid,
        input_tokens=100_000,
        output_tokens=100_000,
        timestamp="2026-02-04T12:00:00",
    ))

    status = await check_limit(fresh_db, uid)
    assert status.usage_tokens == 0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WINDOW_2_old_tokens_fall_out(fresh_db, test_user):
    """WINDOW-2: Usage recorded 25h ago has fallen out of the window."""
    uid = test_user["id"]

    # All usage was 25 hours ago — outside the window
    await seed_token_usage(fresh_db, uid, [(2_250_000, 2_250_000, 25)])

    status = await check_limit(fresh_db, uid)
    assert status.allowed is True
    assert status.usage_tokens == 0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WINDOW_2_tokens_still_in_window(fresh_db, test_user):
    """WINDOW-2: Usage recorded 23h ago is still in the window."""
    uid = test_user["id"]

    # 4.5M tokens at 23h ago — still in window
    await seed_token_usage(fresh_db, uid, [(2_250_000, 2_250_000, 23)])

    status = await check_limit(fresh_db, uid)
    assert status.allowed is True
    assert status.usage_tokens == 4_500_000
