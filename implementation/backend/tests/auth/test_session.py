"""Session management tests.

Tests: spec/backend/auth/test.md#SESSION-1 through SESSION-7
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from freezegun import freeze_time

from app.services.auth_service import create_session, delete_session, validate_session


# ---------------------------------------------------------------------------
# SESSION-2: Session expiry set to 7 days from creation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
@freeze_time("2026-02-05T12:00:00")
async def test_create_session_returns_token(fresh_db, test_user):
    """create_session returns a UUID string token."""
    token = await create_session(fresh_db, test_user["id"])
    assert isinstance(token, str)
    assert len(token) == 36  # UUID format: 8-4-4-4-12


@pytest.mark.asyncio
@pytest.mark.unit
@freeze_time("2026-02-05T12:00:00")
async def test_create_session_sets_expiry_7_days(fresh_db, test_user):
    """Session expires_at should be ~7 days from now."""
    token = await create_session(fresh_db, test_user["id"])

    cursor = await fresh_db.execute(
        "SELECT expires_at FROM sessions WHERE id = ?", (token,)
    )
    row = await cursor.fetchone()
    expires_at = datetime.fromisoformat(row["expires_at"])
    expected = datetime(2026, 2, 12, 12, 0, 0)
    assert abs((expires_at - expected).total_seconds()) < 2


@pytest.mark.asyncio
@pytest.mark.unit
@freeze_time("2026-02-05T12:00:00")
async def test_create_session_inserts_row(fresh_db, test_user):
    """create_session inserts a row into the sessions table."""
    token = await create_session(fresh_db, test_user["id"])

    cursor = await fresh_db.execute(
        "SELECT id, user_id, created_at, expires_at FROM sessions WHERE id = ?",
        (token,),
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["user_id"] == test_user["id"]
    assert row["created_at"] is not None


# ---------------------------------------------------------------------------
# SESSION-3: Session refresh on activity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_session_refreshes_expiry(fresh_db, test_user):
    """Validating a session extends expires_at by 7 days from now."""
    with freeze_time("2026-02-05T12:00:00"):
        token = await create_session(fresh_db, test_user["id"])

    # Advance time by 1 day and validate
    with freeze_time("2026-02-06T12:00:00"):
        result = await validate_session(fresh_db, token)
        assert result is not None

    # Check that expiry was refreshed to 7 days from the validation time
    cursor = await fresh_db.execute(
        "SELECT expires_at FROM sessions WHERE id = ?", (token,)
    )
    row = await cursor.fetchone()
    expires_at = datetime.fromisoformat(row["expires_at"])
    # Should be ~2026-02-13T12:00:00 (7 days from validation time)
    expected = datetime(2026, 2, 13, 12, 0, 0)
    assert abs((expires_at - expected).total_seconds()) < 2


# ---------------------------------------------------------------------------
# SESSION-4: Expired session returns None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_expired_session_returns_none(fresh_db, expired_session):
    """An expired session should return None from validate_session."""
    result = await validate_session(fresh_db, expired_session["id"])
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_session_expired_1_second_ago(fresh_db, test_user):
    """A session expired even 1 second ago is invalid."""
    with freeze_time("2026-02-05T12:00:00"):
        token = await create_session(fresh_db, test_user["id"])

    # Jump to 7 days + 1 second after creation
    with freeze_time("2026-02-12T12:00:01"):
        result = await validate_session(fresh_db, token)
        assert result is None


# ---------------------------------------------------------------------------
# SESSION-5: Multiple sessions per user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_multiple_sessions_per_user(fresh_db, test_user):
    """Same user can have multiple active sessions (different devices)."""
    token1 = await create_session(fresh_db, test_user["id"])
    token2 = await create_session(fresh_db, test_user["id"])

    assert token1 != token2

    result1 = await validate_session(fresh_db, token1)
    result2 = await validate_session(fresh_db, token2)

    assert result1 is not None
    assert result2 is not None
    assert result1["id"] == test_user["id"]
    assert result2["id"] == test_user["id"]


# ---------------------------------------------------------------------------
# SESSION-7: Missing or malformed session token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_nonexistent_token_returns_none(fresh_db):
    """A token that doesn't exist in the DB returns None."""
    result = await validate_session(fresh_db, "00000000-0000-0000-0000-000000000000")
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_empty_token_returns_none(fresh_db):
    """An empty string token returns None."""
    result = await validate_session(fresh_db, "")
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_random_gibberish_returns_none(fresh_db):
    """Random gibberish token returns None."""
    result = await validate_session(fresh_db, "not-a-real-token-at-all")
    assert result is None


# ---------------------------------------------------------------------------
# delete_session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_session_removes_row(fresh_db, test_user):
    """delete_session removes the session from the DB."""
    token = await create_session(fresh_db, test_user["id"])

    # Verify it exists
    result = await validate_session(fresh_db, token)
    assert result is not None

    # Delete
    await delete_session(fresh_db, token)

    # Verify it's gone
    result = await validate_session(fresh_db, token)
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_nonexistent_session_no_error(fresh_db):
    """Deleting a session that doesn't exist does not raise."""
    await delete_session(fresh_db, "00000000-0000-0000-0000-000000000000")
