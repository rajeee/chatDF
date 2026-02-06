"""Referral key validation tests.

Tests: spec/backend/auth/test.md#REFERRAL-1 through REFERRAL-3
"""

from __future__ import annotations

import pytest

from app.services.auth_service import mark_key_used, validate_referral_key


# ---------------------------------------------------------------------------
# REFERRAL-1: Valid referral key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_valid_key_returns_true(fresh_db, valid_referral_key):
    """An unused referral key is valid."""
    result = await validate_referral_key(fresh_db, valid_referral_key["key"])
    assert result is True


@pytest.mark.asyncio
@pytest.mark.unit
async def test_mark_key_used_sets_fields(fresh_db, valid_referral_key, test_user):
    """After marking a key used, used_by and used_at are populated."""
    await mark_key_used(fresh_db, valid_referral_key["key"], test_user["id"])

    cursor = await fresh_db.execute(
        "SELECT used_by, used_at FROM referral_keys WHERE key = ?",
        (valid_referral_key["key"],),
    )
    row = await cursor.fetchone()
    assert row["used_by"] == test_user["id"]
    assert row["used_at"] is not None


# ---------------------------------------------------------------------------
# REFERRAL-2: Used referral key rejected
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_used_key_returns_false(fresh_db, used_referral_key):
    """A referral key that has already been redeemed is invalid."""
    result = await validate_referral_key(fresh_db, used_referral_key["key"])
    assert result is False


# ---------------------------------------------------------------------------
# Additional edge cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_nonexistent_key_returns_false(fresh_db):
    """A key that does not exist in the database is invalid."""
    result = await validate_referral_key(fresh_db, "totally-bogus-key")
    assert result is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_empty_string_returns_false(fresh_db):
    """An empty string key is treated as invalid."""
    result = await validate_referral_key(fresh_db, "")
    assert result is False
