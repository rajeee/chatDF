"""Security tests (service-layer).

Tests: spec/backend/auth/test.md#UNAUTH-1, SESSION-7
Verifies that validate_session correctly rejects invalid tokens.

Note: HTTP 401 enforcement and WebSocket origin checks are router-level
concerns and will be tested in router tests.
"""

from __future__ import annotations

import pytest

from app.services.auth_service import validate_session


# ---------------------------------------------------------------------------
# UNAUTH-1 / SESSION-7: Invalid session tokens
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_no_token_returns_none(fresh_db):
    """validate_session with empty string returns None (no session)."""
    result = await validate_session(fresh_db, "")
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_random_uuid_returns_none(fresh_db):
    """A random UUID that doesn't match any session returns None."""
    result = await validate_session(fresh_db, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_gibberish_token_returns_none(fresh_db):
    """Non-UUID gibberish returns None."""
    result = await validate_session(fresh_db, "xyzzy-not-a-token")
    assert result is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_sql_injection_attempt_returns_none(fresh_db):
    """SQL injection attempts in token are harmless (parameterized queries)."""
    result = await validate_session(fresh_db, "' OR 1=1 --")
    assert result is None
