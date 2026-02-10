"""Tests for the WebSocket endpoint.

Tests: spec/backend/websocket/test.md
Verifies: spec/backend/websocket/plan.md#FastAPI-WebSocket-Endpoint

Covers:
- WS-CONN-1: Valid token connects successfully
- WS-CONN-2: Invalid token gets close 4001
- WS-CONN-3: Expired token gets close 4001
- WS-CONN-4: Missing token gets close 4001
- WS-HB-1: Heartbeat ping/pong works
- WS-CLEAN-1: Connection cleaned up on disconnect
- Integration: connect -> verify registered -> disconnect -> verify cleanup
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import aiosqlite
import pytest
import pytest_asyncio
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.database import init_db
from app.services.connection_manager import ConnectionManager
from tests.factories import make_session, make_user
from tests.websocket.conftest import create_test_app


# ---------------------------------------------------------------------------
# Helpers
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def ws_db():
    """In-memory SQLite database initialised via ``init_db``."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await init_db(conn)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def ws_user(ws_db):
    """A pre-seeded user record."""
    user = make_user()
    await _insert_user(ws_db, user)
    return user


@pytest_asyncio.fixture
async def ws_session(ws_db, ws_user):
    """A valid session for ``ws_user``."""
    session = make_session(user_id=ws_user["id"])
    await _insert_session(ws_db, session)
    return session


@pytest_asyncio.fixture
async def expired_ws_session(ws_db, ws_user):
    """A session whose ``expires_at`` is 1 hour in the past."""
    session = make_session(
        user_id=ws_user["id"],
        expires_at=(datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)).isoformat(),
    )
    await _insert_session(ws_db, session)
    return session


@pytest.fixture
def ws_app(ws_db):
    """Minimal FastAPI app patched with a fresh ConnectionManager and test DB."""
    app = create_test_app()
    mgr = ConnectionManager()
    app.state.db = ws_db
    app.state.connection_manager = mgr
    return app


@pytest.fixture
def client(ws_app):
    """Starlette TestClient for synchronous WebSocket testing."""
    return TestClient(ws_app)


# ---------------------------------------------------------------------------
# WS-CONN-1: Valid token connects successfully
# ---------------------------------------------------------------------------


class TestValidTokenConnect:
    """WS-CONN-1: A client with a valid session token connects successfully."""

    def test_valid_token_accepts_connection(self, client, ws_session):
        with client.websocket_connect(f"/ws?token={ws_session['id']}") as ws:
            # Connection accepted -- no exception raised
            pass

    def test_valid_token_connection_is_bidirectional(self, client, ws_session):
        """After connecting, the client can send data and the server processes it."""
        with client.websocket_connect(f"/ws?token={ws_session['id']}") as ws:
            # Send a text frame -- the server receive loop reads it without error
            ws.send_json({"type": "ping"})


# ---------------------------------------------------------------------------
# WS-CONN-2: Invalid token gets close 4001
# ---------------------------------------------------------------------------


class TestInvalidTokenClose:
    """WS-CONN-2: A client with an invalid (nonexistent) token gets close 4001."""

    def test_invalid_token_closes_with_4001(self, client):
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/ws?token=nonexistent-uuid-1234"):
                pass
        assert _get_close_code(exc_info.value) == 4001


# ---------------------------------------------------------------------------
# WS-CONN-3: Expired token gets close 4001
# ---------------------------------------------------------------------------


class TestExpiredTokenClose:
    """WS-CONN-3: A client with an expired session token gets close 4001."""

    def test_expired_token_closes_with_4001(self, client, expired_ws_session):
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect(
                f"/ws?token={expired_ws_session['id']}"
            ):
                pass
        assert _get_close_code(exc_info.value) == 4001


# ---------------------------------------------------------------------------
# WS-CONN-4: Missing token gets close 4001
# ---------------------------------------------------------------------------


class TestMissingTokenClose:
    """WS-CONN-4: Connecting without a token query param gets rejected."""

    def test_missing_token_closes_with_4001(self, client):
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/ws"):
                pass
        assert _get_close_code(exc_info.value) == 4001


# ---------------------------------------------------------------------------
# WS-HB-1: Heartbeat ping/pong works
# ---------------------------------------------------------------------------


class TestHeartbeat:
    """WS-HB-1: Server sends periodic pings to keep the connection alive."""

    def test_heartbeat_sends_ping(self, client, ws_session):
        """With a short heartbeat interval, a ping message is sent."""
        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.1):
            with client.websocket_connect(
                f"/ws?token={ws_session['id']}"
            ) as ws:
                # Wait for heartbeat to fire -- read the ping message
                msg = ws.receive_json()
                assert msg["type"] == "ping"


# ---------------------------------------------------------------------------
# WS-CLEAN-1: Connection cleaned up on disconnect
# ---------------------------------------------------------------------------


class TestConnectionCleanup:
    """WS-CLEAN-1: Connection is removed from ConnectionManager on disconnect."""

    def test_connection_registered_on_connect(self, ws_app, client, ws_session, ws_user):
        mgr = ws_app.state.connection_manager
        with client.websocket_connect(f"/ws?token={ws_session['id']}"):
            # While connected, connection should be registered
            assert ws_user["id"] in mgr._connections
            assert len(mgr._connections[ws_user["id"]]) == 1

    def test_connection_removed_on_disconnect(self, ws_app, client, ws_session, ws_user):
        mgr = ws_app.state.connection_manager
        with client.websocket_connect(f"/ws?token={ws_session['id']}"):
            pass
        # After context manager exits (disconnect), connection should be cleaned up
        conns = mgr._connections.get(ws_user["id"], [])
        assert len(conns) == 0


# ---------------------------------------------------------------------------
# Integration: connect -> register -> disconnect -> cleanup
# ---------------------------------------------------------------------------


class TestIntegrationLifecycle:
    """Full lifecycle: connect, verify registered, disconnect, verify cleanup."""

    def test_full_lifecycle(self, ws_app, client, ws_session, ws_user):
        mgr = ws_app.state.connection_manager

        # Initially no connections
        assert ws_user["id"] not in mgr._connections

        with client.websocket_connect(f"/ws?token={ws_session['id']}"):
            # Connected -- registered
            assert ws_user["id"] in mgr._connections
            assert len(mgr._connections[ws_user["id"]]) == 1

        # Disconnected -- cleaned up
        conns = mgr._connections.get(ws_user["id"], [])
        assert len(conns) == 0


# ---------------------------------------------------------------------------
# Helper for extracting close codes from exceptions
# ---------------------------------------------------------------------------


def _get_close_code(exc: BaseException) -> int:
    """Extract WebSocket close code from the exception raised by TestClient."""
    if hasattr(exc, "code"):
        return exc.code
    if isinstance(exc, WebSocketDisconnect):
        return exc.code
    if hasattr(exc, "args") and len(exc.args) > 0:
        first = exc.args[0]
        if isinstance(first, int):
            return first
    raise AssertionError(f"Could not extract close code from {type(exc)}: {exc}")
