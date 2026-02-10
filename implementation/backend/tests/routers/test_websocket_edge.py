"""Edge-case tests for the WebSocket router.

Covers scenarios not fully exercised by the existing test suites:
- Heartbeat task handles send_json failure gracefully (stops without crashing)
- Unauthenticated WebSocket connections are closed with code 4001
"""

from __future__ import annotations

import asyncio
import os

# Set required env vars before any app module imports
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import aiosqlite
import pytest
import pytest_asyncio
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.database import init_db
from app.routers.websocket import _heartbeat, HEARTBEAT_INTERVAL
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def ws_db():
    """In-memory SQLite database initialised via init_db."""
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
    """A valid session for ws_user."""
    session = make_session(user_id=ws_user["id"])
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
# 1. Heartbeat task handles send_json failure gracefully
# ---------------------------------------------------------------------------


class TestHeartbeatFailure:
    """The _heartbeat coroutine should stop cleanly when send_json fails."""

    async def test_heartbeat_stops_on_send_json_exception(self):
        """When send_json raises, _heartbeat catches the exception and exits."""
        mock_ws = AsyncMock()
        mock_ws.send_json = AsyncMock(side_effect=Exception("connection closed"))

        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.01):
            # _heartbeat should complete (not hang) when send_json fails
            task = asyncio.create_task(_heartbeat(mock_ws))
            # Give it time to try at least one send
            await asyncio.sleep(0.1)
            # The task should have finished because of the exception
            assert task.done()
            # No exception should propagate (it's caught internally)
            # If the task raised, .result() would re-raise it
            task.result()

    async def test_heartbeat_stops_on_connection_reset_error(self):
        """Heartbeat handles ConnectionResetError gracefully."""
        mock_ws = AsyncMock()
        mock_ws.send_json = AsyncMock(side_effect=ConnectionResetError("reset"))

        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.01):
            task = asyncio.create_task(_heartbeat(mock_ws))
            await asyncio.sleep(0.1)
            assert task.done()
            task.result()  # Should not raise

    async def test_heartbeat_stops_on_runtime_error(self):
        """Heartbeat handles RuntimeError (e.g., event loop closed) gracefully."""
        mock_ws = AsyncMock()
        mock_ws.send_json = AsyncMock(side_effect=RuntimeError("Event loop is closed"))

        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.01):
            task = asyncio.create_task(_heartbeat(mock_ws))
            await asyncio.sleep(0.1)
            assert task.done()
            task.result()  # Should not raise

    async def test_heartbeat_sends_ping_before_failure(self):
        """Heartbeat sends at least one ping before a subsequent send fails."""
        mock_ws = AsyncMock()
        call_count = 0

        async def send_json_side_effect(msg):
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise Exception("connection died on second ping")

        mock_ws.send_json = AsyncMock(side_effect=send_json_side_effect)

        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.01):
            task = asyncio.create_task(_heartbeat(mock_ws))
            await asyncio.sleep(0.2)
            assert task.done()

        # At least one successful send, then failure on the second
        assert call_count >= 2
        # The first call was a successful ping
        first_call_msg = mock_ws.send_json.call_args_list[0][0][0]
        assert first_call_msg == {"type": "ping"}

    async def test_heartbeat_can_be_cancelled(self):
        """Heartbeat task can be cancelled from outside (normal cleanup path)."""
        mock_ws = AsyncMock()
        mock_ws.send_json = AsyncMock()  # Succeeds forever

        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.01):
            task = asyncio.create_task(_heartbeat(mock_ws))
            await asyncio.sleep(0.05)  # Let it send a few pings
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    async def test_heartbeat_sends_correct_ping_message(self):
        """Heartbeat sends exactly {"type": "ping"} on each cycle."""
        mock_ws = AsyncMock()
        send_count = 0

        async def count_sends(msg):
            nonlocal send_count
            send_count += 1
            if send_count >= 3:
                raise Exception("stop")

        mock_ws.send_json = AsyncMock(side_effect=count_sends)

        with patch("app.routers.websocket.HEARTBEAT_INTERVAL", 0.01):
            task = asyncio.create_task(_heartbeat(mock_ws))
            await asyncio.sleep(0.2)
            assert task.done()

        # All calls should have been with {"type": "ping"}
        for call in mock_ws.send_json.call_args_list:
            assert call[0][0] == {"type": "ping"}


# ---------------------------------------------------------------------------
# 2. Unauthenticated WebSocket connections are closed
# ---------------------------------------------------------------------------


class TestUnauthenticatedWebSocket:
    """WebSocket connections without valid authentication are rejected with 4001."""

    def test_no_token_at_all_closes_with_4001(self, client):
        """Connecting without any token query param or cookie gets 4001."""
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/ws"):
                pass
        assert _get_close_code(exc_info.value) == 4001

    def test_empty_token_closes_with_4001(self, client):
        """Connecting with an empty token string gets 4001."""
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/ws?token="):
                pass
        assert _get_close_code(exc_info.value) == 4001

    def test_invalid_token_closes_with_4001(self, client):
        """Connecting with a non-existent token gets 4001."""
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/ws?token=not-a-real-session-token"):
                pass
        assert _get_close_code(exc_info.value) == 4001

    def test_expired_token_closes_with_4001(self, client, ws_db, ws_user):
        """Connecting with an expired session token gets 4001."""
        expired_session = make_session(
            user_id=ws_user["id"],
            expires_at=(datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)).isoformat(),
        )
        # Insert the expired session synchronously using the event loop
        import asyncio

        async def insert():
            await _insert_session(ws_db, expired_session)

        # The ws_db fixture is created in an async context; use run_until_complete
        # But TestClient manages the event loop, so we use the sync client approach
        loop = asyncio.get_event_loop()
        loop.run_until_complete(insert())

        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect(f"/ws?token={expired_session['id']}"):
                pass
        assert _get_close_code(exc_info.value) == 4001

    def test_valid_token_connects_successfully(self, client, ws_session):
        """Sanity check: a valid token connects without error."""
        with client.websocket_connect(f"/ws?token={ws_session['id']}") as ws:
            # Connection accepted -- no exception
            pass

    def test_unauthenticated_connection_not_registered(self, ws_app, client):
        """A rejected connection should not be registered in the ConnectionManager."""
        mgr = ws_app.state.connection_manager

        with pytest.raises(Exception):
            with client.websocket_connect("/ws?token=bad-token"):
                pass

        # Manager should have no connections
        assert len(mgr._connections) == 0

    def test_valid_connection_registers_and_deregisters(self, ws_app, client, ws_session, ws_user):
        """A valid connection is registered on connect and cleaned up on disconnect."""
        mgr = ws_app.state.connection_manager

        with client.websocket_connect(f"/ws?token={ws_session['id']}"):
            # While connected, should be registered
            assert ws_user["id"] in mgr._connections
            assert len(mgr._connections[ws_user["id"]]) == 1

        # After disconnect, should be cleaned up
        conns = mgr._connections.get(ws_user["id"], [])
        assert len(conns) == 0
