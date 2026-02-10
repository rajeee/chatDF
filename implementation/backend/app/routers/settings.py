"""Settings router -- User settings CRUD (Dev Mode).

Endpoints:
- GET  /settings  -> get user settings
- PUT  /settings  -> update user settings
"""

from __future__ import annotations

from datetime import datetime, timezone

import aiosqlite
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_db
from app.models import SettingsResponse, UpdateSettingsRequest

router = APIRouter()

# Default settings values
_DEFAULTS = {"dev_mode": 1, "selected_model": "gemini-2.5-flash"}


async def _get_settings(db: aiosqlite.Connection, user_id: str) -> dict | None:
    """Fetch user settings row, returning None if no row exists."""
    cursor = await db.execute(
        "SELECT dev_mode, selected_model, updated_at "
        "FROM user_settings WHERE user_id = ?",
        (user_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row is not None else None


async def _ensure_settings(db: aiosqlite.Connection, user_id: str) -> dict:
    """Fetch user settings, creating defaults if none exist (requires write connection)."""
    existing = await _get_settings(db, user_id)
    if existing is not None:
        return existing

    # Insert defaults
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "INSERT INTO user_settings (user_id, dev_mode, selected_model, updated_at) "
        "VALUES (?, ?, ?, ?)",
        (user_id, _DEFAULTS["dev_mode"], _DEFAULTS["selected_model"], now),
    )
    await db.commit()
    return {
        "dev_mode": _DEFAULTS["dev_mode"],
        "selected_model": _DEFAULTS["selected_model"],
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# GET /settings
# ---------------------------------------------------------------------------


@router.get("", response_model=SettingsResponse)
async def get_settings(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SettingsResponse:
    """Return the current user's settings.

    If no settings row exists yet, returns defaults without writing to the database
    (GET uses a read connection).
    """
    settings = await _get_settings(db, user["id"])
    if settings is None:
        # Return defaults without inserting (read-only connection)
        return SettingsResponse(
            dev_mode=bool(_DEFAULTS["dev_mode"]),
            selected_model=_DEFAULTS["selected_model"],
        )
    return SettingsResponse(
        dev_mode=bool(settings["dev_mode"]),
        selected_model=settings["selected_model"],
    )


# ---------------------------------------------------------------------------
# PUT /settings
# ---------------------------------------------------------------------------


@router.put("", response_model=SettingsResponse)
async def update_settings(
    body: UpdateSettingsRequest,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SettingsResponse:
    """Update the current user's settings."""
    # Ensure row exists (PUT uses write connection)
    current = await _ensure_settings(db, user["id"])

    # Apply updates
    new_dev_mode = body.dev_mode if body.dev_mode is not None else bool(current["dev_mode"])
    new_model = body.selected_model if body.selected_model is not None else current["selected_model"]
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "UPDATE user_settings SET dev_mode = ?, selected_model = ?, updated_at = ? "
        "WHERE user_id = ?",
        (int(new_dev_mode), new_model, now, user["id"]),
    )
    await db.commit()

    return SettingsResponse(
        dev_mode=new_dev_mode,
        selected_model=new_model,
    )
