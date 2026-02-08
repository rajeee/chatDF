"""Dependency injection function tests.

Tests: spec/backend/test.md#DEPS-1 through DEPS-8
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import MagicMock

import aiosqlite
import pytest
import pytest_asyncio

from app.database import init_db

from .factories import make_conversation, make_session, make_user


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database initialised via ``init_db``."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await init_db(conn)
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# Helpers: insert rows
# ---------------------------------------------------------------------------

async def _insert_user(db: aiosqlite.Connection, user: dict) -> None:
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            user["google_id"],
            user["email"],
            user["name"],
            user["avatar_url"],
            user["created_at"],
            user["last_login_at"],
        ),
    )
    await db.commit()


async def _insert_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session["id"], session["user_id"], session["created_at"], session["expires_at"]),
    )
    await db.commit()


async def _insert_conversation(db: aiosqlite.Connection, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


def _make_request(db: aiosqlite.Connection, session_token: str | None = None, method: str = "GET") -> MagicMock:
    """Build a fake FastAPI Request with app.state.db and optional session cookie."""
    request = MagicMock()
    request.app.state.db = db
    request.method = method
    cookies: dict[str, str] = {}
    if session_token is not None:
        cookies["session_token"] = session_token
    request.cookies = cookies
    return request


# ---------------------------------------------------------------------------
# DEPS-1: get_db returns connection from app.state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_db_returns_connection_from_app_state(fresh_db):
    """get_db should return request.app.state.db (via async generator)."""
    from app.dependencies import get_db

    request = _make_request(fresh_db)
    # get_db is now an async generator, use it as async context manager
    gen = get_db(request)
    result = await gen.__anext__()
    assert result is fresh_db
    # Clean up the generator
    try:
        await gen.__anext__()
    except StopAsyncIteration:
        pass


# ---------------------------------------------------------------------------
# DEPS-2: get_current_user with valid session returns user dict
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_current_user_valid_session(fresh_db):
    """get_current_user returns user dict when session is valid."""
    from app.dependencies import get_current_user

    user = make_user()
    await _insert_user(fresh_db, user)
    session = make_session(user_id=user["id"])
    await _insert_session(fresh_db, session)

    request = _make_request(fresh_db, session_token=session["id"])
    result = await get_current_user(request, db=fresh_db)

    assert result["id"] == user["id"]
    assert result["email"] == user["email"]
    assert result["name"] == user["name"]


# ---------------------------------------------------------------------------
# DEPS-3: get_current_user with no cookie raises 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_current_user_no_cookie_raises_401(fresh_db):
    """get_current_user raises HTTPException 401 when no session_token cookie."""
    from fastapi import HTTPException

    from app.dependencies import get_current_user

    request = _make_request(fresh_db, session_token=None)
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(request, db=fresh_db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"


# ---------------------------------------------------------------------------
# DEPS-4: get_current_user with invalid session raises 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_current_user_invalid_session_raises_401(fresh_db):
    """get_current_user raises HTTPException 401 when session token is not in DB."""
    from fastapi import HTTPException

    from app.dependencies import get_current_user

    request = _make_request(fresh_db, session_token="nonexistent-token-value")
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(request, db=fresh_db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"


# ---------------------------------------------------------------------------
# DEPS-5: get_current_user with expired session raises 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_current_user_expired_session_raises_401(fresh_db):
    """get_current_user raises HTTPException 401 when session has expired."""
    from fastapi import HTTPException

    from app.dependencies import get_current_user

    user = make_user()
    await _insert_user(fresh_db, user)
    expired_session = make_session(
        user_id=user["id"],
        expires_at=(datetime.utcnow() - timedelta(hours=1)).isoformat(),
    )
    await _insert_session(fresh_db, expired_session)

    request = _make_request(fresh_db, session_token=expired_session["id"])
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(request, db=fresh_db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"


# ---------------------------------------------------------------------------
# DEPS-6: get_conversation with valid id and owner returns conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_conversation_valid_owner(fresh_db):
    """get_conversation returns conversation dict when user owns it."""
    from app.dependencies import get_conversation

    user = make_user()
    await _insert_user(fresh_db, user)
    conv = make_conversation(user_id=user["id"], title="Test Chat")
    await _insert_conversation(fresh_db, conv)

    user_dict = {"id": user["id"], "email": user["email"], "name": user["name"], "avatar_url": user["avatar_url"]}
    result = await get_conversation(
        conversation_id=conv["id"],
        user=user_dict,
        db=fresh_db,
    )

    assert result["id"] == conv["id"]
    assert result["user_id"] == user["id"]
    assert result["title"] == "Test Chat"


# ---------------------------------------------------------------------------
# DEPS-7: get_conversation with nonexistent id raises 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_conversation_not_found_raises_404(fresh_db):
    """get_conversation raises HTTPException 404 when conversation does not exist."""
    from fastapi import HTTPException

    from app.dependencies import get_conversation

    user_dict = {"id": "some-user-id", "email": "x@test.com", "name": "X", "avatar_url": None}
    with pytest.raises(HTTPException) as exc_info:
        await get_conversation(
            conversation_id="nonexistent-conversation-id",
            user=user_dict,
            db=fresh_db,
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Conversation not found"


# ---------------------------------------------------------------------------
# DEPS-8: get_conversation with wrong owner raises 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_conversation_wrong_owner_raises_403(fresh_db):
    """get_conversation raises HTTPException 403 when user does not own conversation."""
    from fastapi import HTTPException

    from app.dependencies import get_conversation

    owner = make_user()
    await _insert_user(fresh_db, owner)
    conv = make_conversation(user_id=owner["id"], title="Owner Chat")
    await _insert_conversation(fresh_db, conv)

    other_user = {"id": "different-user-id", "email": "other@test.com", "name": "Other", "avatar_url": None}
    with pytest.raises(HTTPException) as exc_info:
        await get_conversation(
            conversation_id=conv["id"],
            user=other_user,
            db=fresh_db,
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Not authorized"
