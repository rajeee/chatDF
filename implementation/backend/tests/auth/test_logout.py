"""Logout tests.

Tests: spec/backend/auth/test.md#LOGOUT-1
Service-layer test: delete_session removes the session from the DB.
"""

from __future__ import annotations

import pytest

from app.services.auth_service import create_session, delete_session, validate_session


# ---------------------------------------------------------------------------
# LOGOUT-1: Session deleted on logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_session_removes_from_db(fresh_db, test_user):
    """After delete_session, the session is no longer valid."""
    token = await create_session(fresh_db, test_user["id"])

    # Session is valid before deletion
    result = await validate_session(fresh_db, token)
    assert result is not None

    # Delete
    await delete_session(fresh_db, token)

    # Session is gone
    result = await validate_session(fresh_db, token)
    assert result is None

    # Row no longer in DB
    cursor = await fresh_db.execute(
        "SELECT id FROM sessions WHERE id = ?", (token,)
    )
    row = await cursor.fetchone()
    assert row is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_session_only_affects_target(fresh_db, test_user):
    """Deleting one session does not affect other sessions for the same user."""
    token1 = await create_session(fresh_db, test_user["id"])
    token2 = await create_session(fresh_db, test_user["id"])

    await delete_session(fresh_db, token1)

    # token1 is gone
    assert await validate_session(fresh_db, token1) is None
    # token2 still valid
    assert await validate_session(fresh_db, token2) is not None
