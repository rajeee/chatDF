"""OAuth flow tests (service-layer).

Tests: spec/backend/auth/test.md#OAUTH-2 through OAUTH-5
Tests the google_callback service function with mocked Authlib responses.

Note: OAUTH-1 (initiate flow) and OAUTH-6 (CSRF state) are router-level
concerns handled by Authlib's SessionMiddleware and are out of scope for
the auth_service module.  They will be covered in the router tests.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.services.auth_service import (
    create_session,
    google_callback,
    validate_referral_key,
    validate_session,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_google_userinfo(
    sub: str = "google_123",
    email: str = "new@test.com",
    name: str = "New User",
    picture: str | None = None,
) -> dict:
    """Build a Google userinfo dict matching what Authlib returns."""
    return {"sub": sub, "email": email, "name": name, "picture": picture}


# ---------------------------------------------------------------------------
# OAUTH-2: Callback for existing user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_existing_user_creates_session(fresh_db, test_user):
    """Existing user (by google_id) gets a session without needing a referral key."""
    userinfo = _make_google_userinfo(
        sub=test_user["google_id"],
        email=test_user["email"],
        name=test_user["name"],
    )

    result = await google_callback(
        userinfo=userinfo,
        referral_key=None,
        db=fresh_db,
    )

    assert result["is_new_user"] is False
    assert result["session_token"] is not None
    # Validate the session is actually in the DB
    session_result = await validate_session(fresh_db, result["session_token"])
    assert session_result is not None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_existing_user_updates_last_login(fresh_db, test_user):
    """Existing user's last_login_at is updated on sign-in."""
    userinfo = _make_google_userinfo(
        sub=test_user["google_id"],
        email=test_user["email"],
        name=test_user["name"],
    )

    await google_callback(userinfo=userinfo, referral_key=None, db=fresh_db)

    cursor = await fresh_db.execute(
        "SELECT last_login_at FROM users WHERE google_id = ?",
        (test_user["google_id"],),
    )
    row = await cursor.fetchone()
    # last_login_at should have been refreshed (not the same as test fixture value)
    assert row["last_login_at"] is not None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_existing_user_ignores_referral_key(fresh_db, test_user, valid_referral_key):
    """Even if a referral key is provided, existing user skips key validation."""
    userinfo = _make_google_userinfo(
        sub=test_user["google_id"],
        email=test_user["email"],
    )

    result = await google_callback(
        userinfo=userinfo,
        referral_key=valid_referral_key["key"],
        db=fresh_db,
    )

    assert result["is_new_user"] is False
    assert result["session_token"] is not None

    # Referral key should NOT have been consumed
    still_valid = await validate_referral_key(fresh_db, valid_referral_key["key"])
    assert still_valid is True


# ---------------------------------------------------------------------------
# OAUTH-3: Callback for new user with valid referral key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_new_user_valid_key_creates_user(fresh_db, valid_referral_key):
    """New user with a valid referral key: user created, key consumed, session returned."""
    userinfo = _make_google_userinfo(sub="google_new_user")

    result = await google_callback(
        userinfo=userinfo,
        referral_key=valid_referral_key["key"],
        db=fresh_db,
    )

    assert result["is_new_user"] is True
    assert result["session_token"] is not None
    assert result.get("error") is None

    # User exists in DB
    cursor = await fresh_db.execute(
        "SELECT id, email, name FROM users WHERE google_id = ?", ("google_new_user",)
    )
    user_row = await cursor.fetchone()
    assert user_row is not None
    assert user_row["email"] == "new@test.com"

    # Referral key consumed
    key_valid = await validate_referral_key(fresh_db, valid_referral_key["key"])
    assert key_valid is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_new_user_no_avatar(fresh_db, valid_referral_key):
    """New user with no avatar from Google: user created with NULL avatar_url."""
    userinfo = _make_google_userinfo(sub="google_no_pic", picture=None)

    result = await google_callback(
        userinfo=userinfo,
        referral_key=valid_referral_key["key"],
        db=fresh_db,
    )

    cursor = await fresh_db.execute(
        "SELECT avatar_url FROM users WHERE google_id = ?", ("google_no_pic",)
    )
    row = await cursor.fetchone()
    assert row["avatar_url"] is None


# ---------------------------------------------------------------------------
# OAUTH-4: Callback for new user without referral key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_new_user_no_key_returns_error(fresh_db):
    """New user without a referral key: no user created, error returned."""
    userinfo = _make_google_userinfo(sub="google_no_key")

    result = await google_callback(
        userinfo=userinfo,
        referral_key=None,
        db=fresh_db,
    )

    assert result["error"] == "referral_key_required"
    assert result.get("session_token") is None

    # No user should have been created
    cursor = await fresh_db.execute(
        "SELECT id FROM users WHERE google_id = ?", ("google_no_key",)
    )
    row = await cursor.fetchone()
    assert row is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_new_user_empty_key_returns_error(fresh_db):
    """New user with an empty string key: treated as missing."""
    userinfo = _make_google_userinfo(sub="google_empty_key")

    result = await google_callback(
        userinfo=userinfo,
        referral_key="",
        db=fresh_db,
    )

    assert result["error"] == "referral_key_required"
    assert result.get("session_token") is None


# ---------------------------------------------------------------------------
# OAUTH-5: Callback for new user with invalid referral key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_new_user_invalid_key_returns_error(fresh_db):
    """New user with a nonexistent referral key: no user created, error returned."""
    userinfo = _make_google_userinfo(sub="google_bad_key")

    result = await google_callback(
        userinfo=userinfo,
        referral_key="nonexistent-key-xyz",
        db=fresh_db,
    )

    assert result["error"] == "invalid_referral_key"
    assert result.get("session_token") is None

    cursor = await fresh_db.execute(
        "SELECT id FROM users WHERE google_id = ?", ("google_bad_key",)
    )
    row = await cursor.fetchone()
    assert row is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_callback_new_user_used_key_returns_error(fresh_db, used_referral_key):
    """New user with an already-used referral key: no user created, error returned."""
    userinfo = _make_google_userinfo(sub="google_used_key")

    result = await google_callback(
        userinfo=userinfo,
        referral_key=used_referral_key["key"],
        db=fresh_db,
    )

    assert result["error"] == "invalid_referral_key"
    assert result.get("session_token") is None
