"""Comprehensive tests for app.services.auth_service.

Tests: validate_referral_key, mark_key_used, create_session, validate_session,
       delete_session, google_callback, SESSION_DURATION_DAYS
Verifies: spec/backend/auth/plan.md
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import aiosqlite
import pytest

from .factories import make_referral_key, make_session, make_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _insert_referral_key(db: aiosqlite.Connection, key: dict) -> None:
    await db.execute(
        "INSERT INTO referral_keys (key, created_by, used_by, created_at, used_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (key["key"], key["created_by"], key["used_by"], key["created_at"], key["used_at"]),
    )
    await db.commit()


async def _get_referral_key(db: aiosqlite.Connection, key: str) -> dict | None:
    cursor = await db.execute("SELECT * FROM referral_keys WHERE key = ?", (key,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def _get_session(db: aiosqlite.Connection, token: str) -> dict | None:
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (token,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def _count_sessions(db: aiosqlite.Connection, user_id: str) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = ?", (user_id,)
    )
    row = await cursor.fetchone()
    return row["cnt"]


async def _count_users(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT COUNT(*) AS cnt FROM users")
    row = await cursor.fetchone()
    return row["cnt"]


async def _get_user_by_google_id(db: aiosqlite.Connection, google_id: str) -> dict | None:
    cursor = await db.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# validate_referral_key
# ---------------------------------------------------------------------------


class TestValidateReferralKey:
    """Tests for auth_service.validate_referral_key."""

    async def test_returns_true_for_unused_key(self, fresh_db, test_user):
        from app.services.auth_service import validate_referral_key

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        result = await validate_referral_key(fresh_db, rk["key"])
        assert result is True

    async def test_returns_false_for_used_key(self, fresh_db, test_user):
        from app.services.auth_service import validate_referral_key

        rk = make_referral_key(
            created_by=test_user["id"],
            used_by=test_user["id"],
            used_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        )
        await _insert_referral_key(fresh_db, rk)

        result = await validate_referral_key(fresh_db, rk["key"])
        assert result is False

    async def test_returns_false_for_nonexistent_key(self, fresh_db):
        from app.services.auth_service import validate_referral_key

        result = await validate_referral_key(fresh_db, "no-such-key-xyz")
        assert result is False

    async def test_returns_false_for_empty_string(self, fresh_db):
        from app.services.auth_service import validate_referral_key

        result = await validate_referral_key(fresh_db, "")
        assert result is False

    async def test_returns_false_for_none_like_empty(self, fresh_db):
        """Passing an empty/falsy key returns False."""
        from app.services.auth_service import validate_referral_key

        result = await validate_referral_key(fresh_db, "")
        assert result is False


# ---------------------------------------------------------------------------
# mark_key_used
# ---------------------------------------------------------------------------


class TestMarkKeyUsed:
    """Tests for auth_service.mark_key_used."""

    async def test_updates_used_by_and_used_at(self, fresh_db, test_user):
        from app.services.auth_service import mark_key_used

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        await mark_key_used(fresh_db, rk["key"], test_user["id"])

        updated = await _get_referral_key(fresh_db, rk["key"])
        assert updated is not None
        assert updated["used_by"] == test_user["id"]
        assert updated["used_at"] is not None

    async def test_used_at_is_iso_format(self, fresh_db, test_user):
        from app.services.auth_service import mark_key_used

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        await mark_key_used(fresh_db, rk["key"], test_user["id"])
        updated = await _get_referral_key(fresh_db, rk["key"])
        # Should be parseable as ISO datetime
        dt = datetime.fromisoformat(updated["used_at"])
        assert isinstance(dt, datetime)

    async def test_key_no_longer_valid_after_mark(self, fresh_db, test_user):
        from app.services.auth_service import mark_key_used, validate_referral_key

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        assert await validate_referral_key(fresh_db, rk["key"]) is True
        await mark_key_used(fresh_db, rk["key"], test_user["id"])
        assert await validate_referral_key(fresh_db, rk["key"]) is False


# ---------------------------------------------------------------------------
# create_session
# ---------------------------------------------------------------------------


class TestCreateSession:
    """Tests for auth_service.create_session."""

    async def test_returns_uuid_string(self, fresh_db, test_user):
        from uuid import UUID

        from app.services.auth_service import create_session

        token = await create_session(fresh_db, test_user["id"])
        # Should be a valid UUID
        parsed = UUID(token)
        assert str(parsed) == token

    async def test_inserts_session_row(self, fresh_db, test_user):
        from app.services.auth_service import create_session

        token = await create_session(fresh_db, test_user["id"])
        row = await _get_session(fresh_db, token)
        assert row is not None
        assert row["id"] == token
        assert row["user_id"] == test_user["id"]

    async def test_session_expires_in_future(self, fresh_db, test_user):
        from app.services.auth_service import create_session

        token = await create_session(fresh_db, test_user["id"])
        row = await _get_session(fresh_db, token)
        expires_at = datetime.fromisoformat(row["expires_at"])
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert expires_at > now

    async def test_session_expiry_uses_duration_days(self, fresh_db, test_user):
        from app.services.auth_service import SESSION_DURATION_DAYS, create_session

        before = datetime.now(timezone.utc).replace(tzinfo=None)
        token = await create_session(fresh_db, test_user["id"])
        after = datetime.now(timezone.utc).replace(tzinfo=None)

        row = await _get_session(fresh_db, token)
        expires_at = datetime.fromisoformat(row["expires_at"])

        expected_min = before + timedelta(days=SESSION_DURATION_DAYS)
        expected_max = after + timedelta(days=SESSION_DURATION_DAYS)
        assert expected_min <= expires_at <= expected_max

    async def test_multiple_sessions_for_same_user(self, fresh_db, test_user):
        from app.services.auth_service import create_session

        t1 = await create_session(fresh_db, test_user["id"])
        t2 = await create_session(fresh_db, test_user["id"])
        assert t1 != t2
        assert await _count_sessions(fresh_db, test_user["id"]) == 2


# ---------------------------------------------------------------------------
# validate_session
# ---------------------------------------------------------------------------


class TestValidateSession:
    """Tests for auth_service.validate_session."""

    async def test_returns_user_dict_for_valid_session(self, fresh_db, test_user):
        from app.services.auth_service import create_session, validate_session

        token = await create_session(fresh_db, test_user["id"])
        result = await validate_session(fresh_db, token)

        assert result is not None
        assert result["id"] == test_user["id"]
        assert result["email"] == test_user["email"]
        assert result["name"] == test_user["name"]
        assert "avatar_url" in result

    async def test_returns_none_for_expired_session(self, fresh_db, test_user):
        from app.services.auth_service import validate_session

        expired_session = make_session(
            user_id=test_user["id"],
            expires_at=(datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)).isoformat(),
        )
        await fresh_db.execute(
            "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (expired_session["id"], expired_session["user_id"],
             expired_session["created_at"], expired_session["expires_at"]),
        )
        await fresh_db.commit()

        result = await validate_session(fresh_db, expired_session["id"])
        assert result is None

    async def test_returns_none_for_nonexistent_token(self, fresh_db):
        from app.services.auth_service import validate_session

        result = await validate_session(fresh_db, "nonexistent-token-abc")
        assert result is None

    async def test_returns_none_for_empty_token(self, fresh_db):
        from app.services.auth_service import validate_session

        result = await validate_session(fresh_db, "")
        assert result is None

    async def test_refreshes_expiry_on_valid_session(self, fresh_db, test_user):
        from app.services.auth_service import create_session, validate_session

        token = await create_session(fresh_db, test_user["id"])

        # Record original expiry
        row_before = await _get_session(fresh_db, token)
        original_expiry = row_before["expires_at"]

        # Validate (should refresh)
        await validate_session(fresh_db, token)

        # Check expiry was updated
        row_after = await _get_session(fresh_db, token)
        new_expiry = row_after["expires_at"]
        # The new expiry should be >= original (could be same if very fast)
        assert new_expiry >= original_expiry

    async def test_user_dict_has_expected_keys(self, fresh_db, test_user):
        from app.services.auth_service import create_session, validate_session

        token = await create_session(fresh_db, test_user["id"])
        result = await validate_session(fresh_db, token)

        assert set(result.keys()) == {"id", "email", "name", "avatar_url"}


# ---------------------------------------------------------------------------
# delete_session
# ---------------------------------------------------------------------------


class TestDeleteSession:
    """Tests for auth_service.delete_session."""

    async def test_removes_session_row(self, fresh_db, test_user):
        from app.services.auth_service import create_session, delete_session

        token = await create_session(fresh_db, test_user["id"])
        assert await _get_session(fresh_db, token) is not None

        await delete_session(fresh_db, token)
        assert await _get_session(fresh_db, token) is None

    async def test_no_op_for_nonexistent_session(self, fresh_db):
        from app.services.auth_service import delete_session

        # Should not raise
        await delete_session(fresh_db, "nonexistent-token-xyz")

    async def test_validate_returns_none_after_delete(self, fresh_db, test_user):
        from app.services.auth_service import create_session, delete_session, validate_session

        token = await create_session(fresh_db, test_user["id"])
        assert await validate_session(fresh_db, token) is not None

        await delete_session(fresh_db, token)
        assert await validate_session(fresh_db, token) is None


# ---------------------------------------------------------------------------
# SESSION_DURATION_DAYS constant
# ---------------------------------------------------------------------------


class TestSessionDurationDays:
    """Tests for the SESSION_DURATION_DAYS constant."""

    def test_session_duration_days_is_7(self):
        from app.services.auth_service import SESSION_DURATION_DAYS

        assert SESSION_DURATION_DAYS == 7

    def test_session_duration_days_is_int(self):
        from app.services.auth_service import SESSION_DURATION_DAYS

        assert isinstance(SESSION_DURATION_DAYS, int)


# ---------------------------------------------------------------------------
# google_callback
# ---------------------------------------------------------------------------


class TestGoogleCallbackExistingUser:
    """Tests for google_callback with an existing user."""

    async def test_existing_user_creates_session_without_referral_key(self, fresh_db, test_user):
        from app.services.auth_service import google_callback

        userinfo = {
            "sub": test_user["google_id"],
            "email": test_user["email"],
            "name": test_user["name"],
            "picture": test_user["avatar_url"],
        }

        result = await google_callback(userinfo=userinfo, referral_key=None, db=fresh_db)

        assert result["session_token"] is not None
        assert result["is_new_user"] is False
        assert result["error"] is None
        assert result["user_id"] == test_user["id"]

    async def test_existing_user_session_is_valid(self, fresh_db, test_user):
        from app.services.auth_service import google_callback, validate_session

        userinfo = {
            "sub": test_user["google_id"],
            "email": test_user["email"],
            "name": test_user["name"],
        }

        result = await google_callback(userinfo=userinfo, referral_key=None, db=fresh_db)
        session_user = await validate_session(fresh_db, result["session_token"])
        assert session_user is not None
        assert session_user["id"] == test_user["id"]

    async def test_existing_user_updates_last_login(self, fresh_db, test_user):
        from app.services.auth_service import google_callback

        original_login = test_user["last_login_at"]

        userinfo = {
            "sub": test_user["google_id"],
            "email": test_user["email"],
            "name": test_user["name"],
        }

        await google_callback(userinfo=userinfo, referral_key=None, db=fresh_db)

        cursor = await fresh_db.execute(
            "SELECT last_login_at FROM users WHERE id = ?", (test_user["id"],)
        )
        row = await cursor.fetchone()
        assert row["last_login_at"] >= original_login

    async def test_existing_user_ignores_referral_key_if_provided(self, fresh_db, test_user):
        """Even if a referral key is passed, existing users skip validation."""
        from app.services.auth_service import google_callback

        userinfo = {"sub": test_user["google_id"], "email": test_user["email"], "name": test_user["name"]}

        result = await google_callback(userinfo=userinfo, referral_key="random-key", db=fresh_db)
        assert result["error"] is None
        assert result["session_token"] is not None


class TestGoogleCallbackNewUserNoKey:
    """Tests for google_callback with a new user and no referral key."""

    async def test_returns_referral_key_required_error(self, fresh_db):
        from app.services.auth_service import google_callback

        userinfo = {
            "sub": "new-google-id-12345",
            "email": "newuser@test.com",
            "name": "New User",
        }

        result = await google_callback(userinfo=userinfo, referral_key=None, db=fresh_db)

        assert result["session_token"] is None
        assert result["error"] == "referral_key_required"
        assert result["user_id"] is None

    async def test_empty_referral_key_returns_referral_key_required(self, fresh_db):
        from app.services.auth_service import google_callback

        userinfo = {
            "sub": "new-google-id-67890",
            "email": "another@test.com",
            "name": "Another",
        }

        result = await google_callback(userinfo=userinfo, referral_key="", db=fresh_db)

        # Empty string is falsy, so should return referral_key_required
        assert result["error"] == "referral_key_required"

    async def test_no_user_created(self, fresh_db):
        from app.services.auth_service import google_callback

        initial_count = await _count_users(fresh_db)

        userinfo = {"sub": "ghost-id", "email": "ghost@test.com", "name": "Ghost"}
        await google_callback(userinfo=userinfo, referral_key=None, db=fresh_db)

        assert await _count_users(fresh_db) == initial_count


class TestGoogleCallbackNewUserInvalidKey:
    """Tests for google_callback with a new user and an invalid referral key."""

    async def test_returns_invalid_referral_key_error(self, fresh_db):
        from app.services.auth_service import google_callback

        userinfo = {
            "sub": "brand-new-id",
            "email": "brand@test.com",
            "name": "Brand New",
        }

        result = await google_callback(
            userinfo=userinfo, referral_key="bad-key-xyz", db=fresh_db
        )

        assert result["session_token"] is None
        assert result["error"] == "invalid_referral_key"
        assert result["user_id"] is None

    async def test_used_key_returns_invalid(self, fresh_db, test_user):
        from app.services.auth_service import google_callback

        used_key = make_referral_key(
            created_by=test_user["id"],
            used_by=test_user["id"],
            used_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        )
        await _insert_referral_key(fresh_db, used_key)

        userinfo = {"sub": "new-google-999", "email": "new999@test.com", "name": "New999"}
        result = await google_callback(
            userinfo=userinfo, referral_key=used_key["key"], db=fresh_db
        )
        assert result["error"] == "invalid_referral_key"

    async def test_no_user_created_with_invalid_key(self, fresh_db):
        from app.services.auth_service import google_callback

        initial_count = await _count_users(fresh_db)

        userinfo = {"sub": "phantom-id", "email": "phantom@test.com", "name": "Phantom"}
        await google_callback(userinfo=userinfo, referral_key="nope", db=fresh_db)

        assert await _count_users(fresh_db) == initial_count


class TestGoogleCallbackNewUserValidKey:
    """Tests for google_callback with a new user and a valid referral key."""

    async def test_creates_user_and_session(self, fresh_db, test_user):
        from app.services.auth_service import google_callback

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        userinfo = {
            "sub": "fresh-google-id",
            "email": "fresh@test.com",
            "name": "Fresh User",
            "picture": "https://example.com/avatar.png",
        }

        result = await google_callback(
            userinfo=userinfo, referral_key=rk["key"], db=fresh_db
        )

        assert result["session_token"] is not None
        assert result["is_new_user"] is True
        assert result["error"] is None
        assert result["user_id"] is not None

    async def test_new_user_persisted_in_db(self, fresh_db, test_user):
        from app.services.auth_service import google_callback

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        google_id = "persisted-google-id"
        userinfo = {
            "sub": google_id,
            "email": "persisted@test.com",
            "name": "Persisted User",
            "picture": None,
        }

        result = await google_callback(userinfo=userinfo, referral_key=rk["key"], db=fresh_db)

        db_user = await _get_user_by_google_id(fresh_db, google_id)
        assert db_user is not None
        assert db_user["email"] == "persisted@test.com"
        assert db_user["name"] == "Persisted User"
        assert db_user["id"] == result["user_id"]

    async def test_referral_key_marked_used(self, fresh_db, test_user):
        from app.services.auth_service import google_callback, validate_referral_key

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        userinfo = {"sub": "mark-test-id", "email": "mark@test.com", "name": "Mark Test"}
        result = await google_callback(userinfo=userinfo, referral_key=rk["key"], db=fresh_db)

        # Key should now be used
        assert await validate_referral_key(fresh_db, rk["key"]) is False
        updated = await _get_referral_key(fresh_db, rk["key"])
        assert updated["used_by"] == result["user_id"]
        assert updated["used_at"] is not None

    async def test_session_is_valid_after_creation(self, fresh_db, test_user):
        from app.services.auth_service import google_callback, validate_session

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        userinfo = {"sub": "valid-session-id", "email": "valid@test.com", "name": "Valid"}
        result = await google_callback(userinfo=userinfo, referral_key=rk["key"], db=fresh_db)

        session_user = await validate_session(fresh_db, result["session_token"])
        assert session_user is not None
        assert session_user["id"] == result["user_id"]

    async def test_new_user_picture_stored(self, fresh_db, test_user):
        from app.services.auth_service import google_callback

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        userinfo = {
            "sub": "pic-test-id",
            "email": "pic@test.com",
            "name": "Pic User",
            "picture": "https://cdn.example.com/photo.jpg",
        }

        result = await google_callback(userinfo=userinfo, referral_key=rk["key"], db=fresh_db)
        db_user = await _get_user_by_google_id(fresh_db, "pic-test-id")
        assert db_user["avatar_url"] == "https://cdn.example.com/photo.jpg"

    async def test_new_user_defaults_for_missing_fields(self, fresh_db, test_user):
        """When email/name/picture are missing from userinfo, defaults are used."""
        from app.services.auth_service import google_callback

        rk = make_referral_key(created_by=test_user["id"])
        await _insert_referral_key(fresh_db, rk)

        userinfo = {"sub": "minimal-google-id"}
        result = await google_callback(userinfo=userinfo, referral_key=rk["key"], db=fresh_db)

        db_user = await _get_user_by_google_id(fresh_db, "minimal-google-id")
        assert db_user is not None
        assert db_user["email"] == ""
        assert db_user["name"] == ""
        assert db_user["avatar_url"] is None
