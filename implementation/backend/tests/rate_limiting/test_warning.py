"""Warning-state tests for rate_limit_service.

Tests: spec/backend/rate_limiting/test.md#WARN-1, WARN-2
"""

from __future__ import annotations

import pytest
from freezegun import freeze_time

from app.services.rate_limit_service import check_limit

from .conftest import seed_token_usage, TOKEN_LIMIT


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WARN_1_exactly_at_80_percent(fresh_db, test_user):
    """WARN-1: At exactly 80% (4,000,000 tokens), warning is True."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(2_000_000, 2_000_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.warning is True
    assert status.usage_tokens == 4_000_000
    assert status.usage_percent == pytest.approx(80.0)
    assert status.remaining_tokens == 1_000_000


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WARN_1_just_over_80_percent(fresh_db, test_user):
    """WARN-1: At 80.00002% (4,000,001 tokens), warning is True."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(2_000_000, 2_000_001, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.warning is True
    assert status.usage_tokens == 4_000_001
    assert status.usage_percent > 80.0


@pytest.mark.asyncio
@freeze_time("2026-02-05 12:00:00")
async def test_WARN_2_at_85_percent_still_allowed(fresh_db, test_user):
    """WARN-2: At 85% usage, request is still allowed (warning is informational)."""
    uid = test_user["id"]
    await seed_token_usage(fresh_db, uid, [(2_125_000, 2_125_000, 1)])

    status = await check_limit(fresh_db, uid)

    assert status.allowed is True
    assert status.warning is True
    assert status.usage_tokens == 4_250_000
    assert status.usage_percent == pytest.approx(85.0)
    assert status.remaining_tokens == 750_000
