"""FastAPI dependency injection functions.

Implements: spec/backend/plan.md#Dependency-Injection

Provides:
- ``get_db(request)``: Returns the shared database connection.
- ``get_current_user(request, db)``: Validates session cookie, returns user dict.
- ``get_conversation(conversation_id, user, db)``: Loads and authorises conversation access.
"""

from __future__ import annotations

import aiosqlite
from fastapi import Depends, HTTPException, Request

from app.services import auth_service


# ---------------------------------------------------------------------------
# get_db
# Implements: spec/backend/plan.md#get_db
# ---------------------------------------------------------------------------


async def get_db(request: Request) -> aiosqlite.Connection:
    """Return the shared database connection from ``request.app.state.db``."""
    return request.app.state.db


# ---------------------------------------------------------------------------
# get_current_user
# Implements: spec/backend/plan.md#get_current_user
# ---------------------------------------------------------------------------


async def get_current_user(
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Extract session cookie, validate via auth_service, return user dict.

    Raises ``HTTPException(401)`` if the cookie is missing or the session is
    invalid/expired.
    """
    session_token = request.cookies.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = await auth_service.validate_session(db, session_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return user


# ---------------------------------------------------------------------------
# get_conversation
# Implements: spec/backend/rest_api/plan.md#Conversation-Ownership-Validation-Pattern
# ---------------------------------------------------------------------------


async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Load a conversation by ID and verify the current user owns it.

    Raises ``HTTPException(404)`` if the conversation does not exist and
    ``HTTPException(403)`` if the authenticated user is not the owner.
    """
    cursor = await db.execute(
        "SELECT * FROM conversations WHERE id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Convert aiosqlite.Row (or plain tuple) to a dict for uniform access
    if isinstance(row, aiosqlite.Row):
        conversation = dict(row)
    else:
        conversation = row  # type: ignore[assignment]

    if conversation["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    return conversation
