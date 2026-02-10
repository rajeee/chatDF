"""Authentication service: Google OAuth, session management, referral keys.

Implements: spec/backend/auth/plan.md

Provides:
- ``google_callback(userinfo, referral_key, db)``: Processes OAuth callback.
- ``create_session(db, user_id)``: Creates a new session, returns token.
- ``validate_session(db, session_token)``: Validates and refreshes a session.
- ``delete_session(db, session_token)``: Deletes a session.
- ``validate_referral_key(db, key)``: Checks if a referral key is valid/unused.
- ``mark_key_used(db, key, user_id)``: Marks a referral key as consumed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import aiosqlite

from app.config import get_settings

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SESSION_DURATION_DAYS = 7


# ---------------------------------------------------------------------------
# Referral key validation
# Implements: spec/backend/auth/plan.md#Referral-Key-Validation
# ---------------------------------------------------------------------------


async def validate_referral_key(db: aiosqlite.Connection, key: str) -> bool:
    """Check if *key* exists in ``referral_keys`` and has not been used.

    Returns ``True`` if the key is valid and available, ``False`` otherwise.
    """
    if not key:
        return False

    cursor = await db.execute(
        "SELECT key FROM referral_keys WHERE key = ? AND used_by IS NULL",
        (key,),
    )
    row = await cursor.fetchone()
    return row is not None


async def mark_key_used(db: aiosqlite.Connection, key: str, user_id: str) -> None:
    """Set ``used_by`` and ``used_at`` on the referral key."""
    await db.execute(
        "UPDATE referral_keys SET used_by = ?, used_at = ? WHERE key = ?",
        (user_id, datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), key),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Session management
# Implements: spec/backend/auth/plan.md#Session-Token-Generation
# ---------------------------------------------------------------------------


async def create_session(db: aiosqlite.Connection, user_id: str) -> str:
    """Create a new session for *user_id*, return the session token (UUID).

    The token doubles as the session ``id`` in the ``sessions`` table.
    Expiry is set to ``SESSION_DURATION_DAYS`` from now.
    """
    token = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(days=SESSION_DURATION_DAYS)

    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now.isoformat(), expires_at.isoformat()),
    )
    await db.commit()
    return token


async def validate_session(
    db: aiosqlite.Connection, session_token: str
) -> dict | None:
    """Look up *session_token*, check it is not expired, refresh expiry.

    Returns a user dict ``{id, email, name, avatar_url}`` on success,
    or ``None`` if the session is invalid or expired.

    Implements: spec/backend/auth/plan.md#get_current_user-Dependency
    """
    if not session_token:
        return None

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    cursor = await db.execute(
        "SELECT s.id AS session_id, s.expires_at, "
        "       u.id, u.email, u.name, u.avatar_url "
        "FROM sessions s "
        "JOIN users u ON s.user_id = u.id "
        "WHERE s.id = ?",
        (session_token,),
    )
    row = await cursor.fetchone()

    if row is None:
        return None

    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at <= now:
        return None

    # Refresh expiry by SESSION_DURATION_DAYS from now
    new_expiry = now + timedelta(days=SESSION_DURATION_DAYS)
    await db.execute(
        "UPDATE sessions SET expires_at = ? WHERE id = ?",
        (new_expiry.isoformat(), session_token),
    )
    await db.commit()

    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "avatar_url": row["avatar_url"],
    }


async def delete_session(db: aiosqlite.Connection, session_token: str) -> None:
    """Delete a session row. No-op if the session does not exist."""
    await db.execute("DELETE FROM sessions WHERE id = ?", (session_token,))
    await db.commit()


# ---------------------------------------------------------------------------
# Google OAuth callback logic
# Implements: spec/backend/auth/plan.md#Endpoint-GET-authgooglecallback
# ---------------------------------------------------------------------------


async def google_callback(
    *,
    userinfo: dict,
    referral_key: str | None,
    db: aiosqlite.Connection,
) -> dict:
    """Process a Google OAuth callback.

    Parameters
    ----------
    userinfo:
        Google user info dict with keys ``sub``, ``email``, ``name``, ``picture``.
    referral_key:
        Optional referral key provided during the login initiation step.
    db:
        Database connection.

    Returns
    -------
    dict with keys:
        - ``session_token``: str or None
        - ``is_new_user``: bool
        - ``error``: str or None (e.g. "referral_key_required", "invalid_referral_key")
        - ``user_id``: str or None
    """
    google_id = userinfo["sub"]
    email = userinfo.get("email", "")
    name = userinfo.get("name", "")
    picture = userinfo.get("picture")

    # Check if the user already exists
    cursor = await db.execute(
        "SELECT id FROM users WHERE google_id = ?", (google_id,)
    )
    existing_user = await cursor.fetchone()

    if existing_user is not None:
        # ---- Existing user: create session, update last_login_at ----
        user_id = existing_user["id"]
        await db.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), user_id),
        )
        await db.commit()

        session_token = await create_session(db, user_id)
        return {
            "session_token": session_token,
            "is_new_user": False,
            "error": None,
            "user_id": user_id,
        }

    # ---- New user: validate referral key ----
    if not referral_key:
        return {
            "session_token": None,
            "is_new_user": False,
            "error": "referral_key_required",
            "user_id": None,
        }

    key_valid = await validate_referral_key(db, referral_key)
    if not key_valid:
        return {
            "session_token": None,
            "is_new_user": False,
            "error": "invalid_referral_key",
            "user_id": None,
        }

    # ---- Create new user ----
    user_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, google_id, email, name, picture, now, now),
    )
    await db.commit()

    # Mark referral key as used
    await mark_key_used(db, referral_key, user_id)

    # Create session
    session_token = await create_session(db, user_id)

    return {
        "session_token": session_token,
        "is_new_user": True,
        "error": None,
        "user_id": user_id,
    }
