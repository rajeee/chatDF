"""Tests for the WebSocket ConnectionManager.

Tests: spec/backend/websocket/test.md#WS-CLEAN-1 and connection management scenarios.

Covers:
- Connection tracking (connect registers, disconnect removes)
- Multiple connections per user
- send_to_user routes to all user connections
- send_to_websocket sends to a specific socket
- Disconnect cleanup removes only the target socket
- send_to_user with dead connection removes it silently
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.connection_manager import ConnectionManager


def _make_ws() -> AsyncMock:
    """Create a mock WebSocket with an async ``send_json`` method."""
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


class TestConnect:
    """Verify ``connect`` registers sockets correctly."""

    @pytest.mark.asyncio
    async def test_single_connection_registered(self):
        mgr = ConnectionManager()
        ws = _make_ws()
        await mgr.connect("user-1", ws)
        assert ws in mgr._connections["user-1"]

    @pytest.mark.asyncio
    async def test_multiple_connections_same_user(self):
        """Multiple tabs/devices: same user_id can have multiple WebSocket connections."""
        mgr = ConnectionManager()
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect("user-1", ws1)
        await mgr.connect("user-1", ws2)
        assert len(mgr._connections["user-1"]) == 2
        assert ws1 in mgr._connections["user-1"]
        assert ws2 in mgr._connections["user-1"]

    @pytest.mark.asyncio
    async def test_different_users_isolated(self):
        mgr = ConnectionManager()
        ws_a = _make_ws()
        ws_b = _make_ws()
        await mgr.connect("user-a", ws_a)
        await mgr.connect("user-b", ws_b)
        assert mgr._connections["user-a"] == [ws_a]
        assert mgr._connections["user-b"] == [ws_b]


class TestDisconnect:
    """Verify ``disconnect`` removes sockets and cleans up."""

    @pytest.mark.asyncio
    async def test_disconnect_removes_socket(self):
        mgr = ConnectionManager()
        ws = _make_ws()
        await mgr.connect("user-1", ws)
        await mgr.disconnect("user-1", ws)
        # user key should be empty or removed
        assert mgr._connections.get("user-1", []) == []

    @pytest.mark.asyncio
    async def test_disconnect_one_of_multiple(self):
        """Disconnecting one socket leaves the others."""
        mgr = ConnectionManager()
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect("user-1", ws1)
        await mgr.connect("user-1", ws2)
        await mgr.disconnect("user-1", ws1)
        assert ws1 not in mgr._connections["user-1"]
        assert ws2 in mgr._connections["user-1"]

    @pytest.mark.asyncio
    async def test_disconnect_unknown_user_no_error(self):
        """Disconnecting a user that was never connected should not raise."""
        mgr = ConnectionManager()
        ws = _make_ws()
        # Should not raise
        await mgr.disconnect("nobody", ws)

    @pytest.mark.asyncio
    async def test_disconnect_unknown_socket_no_error(self):
        """Disconnecting a socket that isn't tracked should not raise."""
        mgr = ConnectionManager()
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect("user-1", ws1)
        # ws2 was never connected
        await mgr.disconnect("user-1", ws2)
        # ws1 should still be there
        assert ws1 in mgr._connections["user-1"]


class TestSendToUser:
    """Verify ``send_to_user`` delivers messages to all user connections."""

    @pytest.mark.asyncio
    async def test_sends_to_single_connection(self):
        mgr = ConnectionManager()
        ws = _make_ws()
        await mgr.connect("user-1", ws)
        msg = {"type": "chat_token", "token": "hi"}
        await mgr.send_to_user("user-1", msg)
        ws.send_json.assert_awaited_once_with(msg)

    @pytest.mark.asyncio
    async def test_sends_to_all_connections(self):
        mgr = ConnectionManager()
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect("user-1", ws1)
        await mgr.connect("user-1", ws2)
        msg = {"type": "chat_complete", "message_id": "m1", "sql_query": None, "token_count": 10}
        await mgr.send_to_user("user-1", msg)
        ws1.send_json.assert_awaited_once_with(msg)
        ws2.send_json.assert_awaited_once_with(msg)

    @pytest.mark.asyncio
    async def test_no_connections_no_error(self):
        """Sending to a user with no connections should silently do nothing."""
        mgr = ConnectionManager()
        # Should not raise
        await mgr.send_to_user("ghost-user", {"type": "chat_token", "token": "x"})

    @pytest.mark.asyncio
    async def test_dead_connection_removed_on_send(self):
        """If a WebSocket.send_json raises, that connection is silently removed."""
        mgr = ConnectionManager()
        ws_alive = _make_ws()
        ws_dead = _make_ws()
        ws_dead.send_json.side_effect = Exception("connection closed")
        await mgr.connect("user-1", ws_alive)
        await mgr.connect("user-1", ws_dead)

        msg = {"type": "chat_token", "token": "hi"}
        await mgr.send_to_user("user-1", msg)

        # alive socket received the message
        ws_alive.send_json.assert_awaited_once_with(msg)
        # dead socket should have been removed
        assert ws_dead not in mgr._connections.get("user-1", [])
        assert ws_alive in mgr._connections["user-1"]


class TestSendToWebsocket:
    """Verify ``send_to_websocket`` sends to a specific socket."""

    @pytest.mark.asyncio
    async def test_sends_json_to_specific_socket(self):
        mgr = ConnectionManager()
        ws = _make_ws()
        msg = {"type": "query_status", "phase": "generating"}
        await mgr.send_to_websocket(ws, msg)
        ws.send_json.assert_awaited_once_with(msg)

    @pytest.mark.asyncio
    async def test_does_not_require_prior_connect(self):
        """send_to_websocket works with any WebSocket, not just connected ones."""
        mgr = ConnectionManager()
        ws = _make_ws()
        msg = {"type": "dataset_loading", "dataset_id": "ds-1", "url": "u", "status": "loading"}
        await mgr.send_to_websocket(ws, msg)
        ws.send_json.assert_awaited_once_with(msg)
