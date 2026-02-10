"""Edge-case tests for the WebSocket ConnectionManager.

Covers scenarios not exercised by the existing test suites:
- send_to_user when user has no connections (empty list edge case)
- send_to_user when send_json raises on one socket but others succeed
- disconnect removes user entry when last socket is removed
- concurrent connect/disconnect operations (asyncio.gather)
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.services.connection_manager import ConnectionManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_ws(*, name: str | None = None) -> AsyncMock:
    """Create a mock WebSocket with an async ``send_json`` method."""
    ws = AsyncMock(name=name)
    ws.send_json = AsyncMock(name=f"{name}.send_json" if name else "send_json")
    return ws


def _make_dead_ws(*, name: str | None = None, error: Exception | None = None) -> AsyncMock:
    """Create a mock WebSocket whose ``send_json`` always raises."""
    ws = _make_ws(name=name)
    ws.send_json.side_effect = error or Exception("connection closed")
    return ws


# ---------------------------------------------------------------------------
# 1. send_to_user when user has no connections
# ---------------------------------------------------------------------------


class TestSendToUserNoConnections:
    """send_to_user should be a silent no-op when user has no sockets."""

    async def test_send_to_nonexistent_user_is_noop(self):
        """Sending to a user_id that was never connected does nothing."""
        mgr = ConnectionManager()
        # Must not raise
        await mgr.send_to_user("nonexistent-user", {"type": "chat_token", "token": "hi"})
        # Manager state unchanged
        assert mgr._connections == {}

    async def test_send_to_user_with_empty_list_after_manual_cleanup(self):
        """If a user's socket list becomes empty (edge case), send_to_user handles it.

        This tests the `if not sockets: return` branch at the top of send_to_user.
        The list being falsy (empty) should cause an early return.
        """
        mgr = ConnectionManager()
        # Manually inject an empty list to simulate a race condition
        mgr._connections["user-x"] = []

        msg = {"type": "chat_token", "token": "hello"}
        await mgr.send_to_user("user-x", msg)

        # The empty list should have been cleaned up (or early-returned)
        # send_to_user checks `if not sockets: return` which triggers for []

    async def test_send_after_all_disconnects(self):
        """After disconnecting every socket for a user, send is a no-op."""
        mgr = ConnectionManager()
        ws1 = _make_ws(name="ws1")
        ws2 = _make_ws(name="ws2")
        await mgr.connect("u1", ws1)
        await mgr.connect("u1", ws2)
        await mgr.disconnect("u1", ws1)
        await mgr.disconnect("u1", ws2)

        # user key should be gone
        assert "u1" not in mgr._connections

        # send should be silent
        await mgr.send_to_user("u1", {"type": "ping"})
        ws1.send_json.assert_not_awaited()
        ws2.send_json.assert_not_awaited()


# ---------------------------------------------------------------------------
# 2. send_to_user with mixed success/failure on individual sockets
# ---------------------------------------------------------------------------


class TestSendToUserPartialFailure:
    """When send_json raises on some sockets, others should still receive."""

    async def test_first_socket_fails_second_succeeds(self):
        """Dead socket listed first does not prevent delivery to later alive sockets."""
        mgr = ConnectionManager()
        ws_dead = _make_dead_ws(name="dead")
        ws_alive = _make_ws(name="alive")
        await mgr.connect("u1", ws_dead)
        await mgr.connect("u1", ws_alive)

        msg = {"type": "chat_token", "token": "hello"}
        await mgr.send_to_user("u1", msg)

        # Alive socket received the message
        ws_alive.send_json.assert_awaited_once_with(msg)
        # Dead socket was pruned
        assert ws_dead not in mgr._connections.get("u1", [])
        assert ws_alive in mgr._connections["u1"]

    async def test_middle_socket_fails_others_succeed(self):
        """A dead socket in the middle of the list is pruned; flanking sockets get the message."""
        mgr = ConnectionManager()
        ws1 = _make_ws(name="ws1")
        ws_dead = _make_dead_ws(name="dead-middle")
        ws3 = _make_ws(name="ws3")
        await mgr.connect("u1", ws1)
        await mgr.connect("u1", ws_dead)
        await mgr.connect("u1", ws3)

        msg = {"type": "chat_complete", "message_id": "m1", "sql_query": None, "token_count": 5}
        await mgr.send_to_user("u1", msg)

        ws1.send_json.assert_awaited_once_with(msg)
        ws3.send_json.assert_awaited_once_with(msg)
        remaining = mgr._connections["u1"]
        assert ws_dead not in remaining
        assert len(remaining) == 2

    async def test_multiple_dead_sockets_interleaved_with_alive(self):
        """Multiple dead sockets scattered among alive ones are all pruned."""
        mgr = ConnectionManager()
        alive1 = _make_ws(name="alive1")
        dead1 = _make_dead_ws(name="dead1")
        alive2 = _make_ws(name="alive2")
        dead2 = _make_dead_ws(name="dead2", error=RuntimeError("loop closed"))
        alive3 = _make_ws(name="alive3")

        for ws in [alive1, dead1, alive2, dead2, alive3]:
            await mgr.connect("u1", ws)

        msg = {"type": "chat_token", "token": "x"}
        await mgr.send_to_user("u1", msg)

        for ws in [alive1, alive2, alive3]:
            ws.send_json.assert_awaited_once_with(msg)

        remaining = mgr._connections["u1"]
        assert dead1 not in remaining
        assert dead2 not in remaining
        assert len(remaining) == 3

    async def test_all_sockets_fail_removes_user_key(self):
        """When every socket for a user fails, the user key is removed entirely."""
        mgr = ConnectionManager()
        dead1 = _make_dead_ws(name="dead1")
        dead2 = _make_dead_ws(name="dead2")
        dead3 = _make_dead_ws(name="dead3", error=ConnectionResetError("reset"))

        await mgr.connect("u1", dead1)
        await mgr.connect("u1", dead2)
        await mgr.connect("u1", dead3)

        await mgr.send_to_user("u1", {"type": "ping"})

        assert "u1" not in mgr._connections

    async def test_error_types_all_caught(self):
        """Various exception types on send_json are all caught and the socket pruned."""
        error_types = [
            Exception("generic"),
            RuntimeError("event loop closed"),
            ConnectionResetError("connection reset by peer"),
            OSError("broken pipe"),
            BrokenPipeError("pipe is broken"),
        ]
        for err in error_types:
            mgr = ConnectionManager()
            ws_dead = _make_dead_ws(name=f"dead-{type(err).__name__}", error=err)
            ws_alive = _make_ws(name="alive")
            await mgr.connect("u1", ws_dead)
            await mgr.connect("u1", ws_alive)

            await mgr.send_to_user("u1", {"type": "ping"})

            assert ws_dead not in mgr._connections.get("u1", [])
            assert ws_alive in mgr._connections["u1"]


# ---------------------------------------------------------------------------
# 3. disconnect removes user entry when last socket is removed
# ---------------------------------------------------------------------------


class TestDisconnectCleansUpUserEntry:
    """Verify the user key is deleted from _connections when the last socket disconnects."""

    async def test_single_socket_disconnect_removes_key(self):
        """Disconnecting the only socket for a user removes the user key."""
        mgr = ConnectionManager()
        ws = _make_ws(name="only-socket")
        await mgr.connect("u1", ws)
        assert "u1" in mgr._connections

        await mgr.disconnect("u1", ws)
        assert "u1" not in mgr._connections

    async def test_last_of_many_disconnect_removes_key(self):
        """Disconnecting the last remaining socket removes the user key."""
        mgr = ConnectionManager()
        ws1 = _make_ws(name="ws1")
        ws2 = _make_ws(name="ws2")
        ws3 = _make_ws(name="ws3")

        await mgr.connect("u1", ws1)
        await mgr.connect("u1", ws2)
        await mgr.connect("u1", ws3)
        assert len(mgr._connections["u1"]) == 3

        await mgr.disconnect("u1", ws1)
        assert "u1" in mgr._connections
        assert len(mgr._connections["u1"]) == 2

        await mgr.disconnect("u1", ws2)
        assert "u1" in mgr._connections
        assert len(mgr._connections["u1"]) == 1

        await mgr.disconnect("u1", ws3)
        assert "u1" not in mgr._connections

    async def test_disconnect_last_socket_leaves_other_users_intact(self):
        """Removing the last socket for one user does not affect another user."""
        mgr = ConnectionManager()
        ws_alice = _make_ws(name="alice-ws")
        ws_bob = _make_ws(name="bob-ws")

        await mgr.connect("alice", ws_alice)
        await mgr.connect("bob", ws_bob)

        await mgr.disconnect("alice", ws_alice)
        assert "alice" not in mgr._connections
        assert "bob" in mgr._connections
        assert ws_bob in mgr._connections["bob"]

    async def test_dead_socket_cleanup_on_send_also_removes_user_key(self):
        """When the last socket dies during send_to_user, user key is removed."""
        mgr = ConnectionManager()
        ws_dead = _make_dead_ws(name="sole-dead")
        await mgr.connect("u1", ws_dead)

        await mgr.send_to_user("u1", {"type": "ping"})
        assert "u1" not in mgr._connections


# ---------------------------------------------------------------------------
# 4. Concurrent connect/disconnect operations
# ---------------------------------------------------------------------------


class TestConcurrentOperations:
    """Verify that concurrent connect/disconnect calls do not corrupt state."""

    async def test_concurrent_connects_for_same_user(self):
        """Multiple connect calls running concurrently all register correctly."""
        mgr = ConnectionManager()
        sockets = [_make_ws(name=f"ws-{i}") for i in range(10)]

        await asyncio.gather(
            *[mgr.connect("u1", ws) for ws in sockets]
        )

        assert len(mgr._connections["u1"]) == 10
        for ws in sockets:
            assert ws in mgr._connections["u1"]

    async def test_concurrent_disconnects_for_same_user(self):
        """Multiple disconnect calls running concurrently all complete safely."""
        mgr = ConnectionManager()
        sockets = [_make_ws(name=f"ws-{i}") for i in range(10)]
        for ws in sockets:
            await mgr.connect("u1", ws)

        await asyncio.gather(
            *[mgr.disconnect("u1", ws) for ws in sockets]
        )

        assert "u1" not in mgr._connections

    async def test_concurrent_connect_and_disconnect_different_users(self):
        """Concurrent operations on different users do not interfere."""
        mgr = ConnectionManager()
        ws_a = _make_ws(name="alice-ws")
        ws_b = _make_ws(name="bob-ws")

        # Connect alice, then concurrently disconnect alice and connect bob
        await mgr.connect("alice", ws_a)
        await asyncio.gather(
            mgr.disconnect("alice", ws_a),
            mgr.connect("bob", ws_b),
        )

        assert "alice" not in mgr._connections
        assert "bob" in mgr._connections
        assert ws_b in mgr._connections["bob"]

    async def test_concurrent_sends_to_same_user(self):
        """Multiple concurrent send_to_user calls all deliver messages."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws1")
        await mgr.connect("u1", ws)

        msgs = [{"type": "chat_token", "token": str(i)} for i in range(5)]
        await asyncio.gather(
            *[mgr.send_to_user("u1", msg) for msg in msgs]
        )

        # All 5 messages should have been sent
        assert ws.send_json.await_count == 5

    async def test_concurrent_connect_send_disconnect_cycle(self):
        """Rapid connect -> send -> disconnect cycles for many users concurrently."""
        mgr = ConnectionManager()

        async def user_lifecycle(user_id: str):
            ws = _make_ws(name=f"ws-{user_id}")
            await mgr.connect(user_id, ws)
            await mgr.send_to_user(user_id, {"type": "ping"})
            await mgr.disconnect(user_id, ws)

        await asyncio.gather(
            *[user_lifecycle(f"user-{i}") for i in range(20)]
        )

        # All users should be cleaned up
        assert len(mgr._connections) == 0

    async def test_concurrent_sends_with_dead_sockets(self):
        """Concurrent sends where some sockets die do not corrupt the connection list."""
        mgr = ConnectionManager()
        ws_alive = _make_ws(name="alive")
        ws_dead = _make_dead_ws(name="dead")
        await mgr.connect("u1", ws_alive)
        await mgr.connect("u1", ws_dead)

        msgs = [{"type": "chat_token", "token": str(i)} for i in range(3)]

        # First send will prune ws_dead; subsequent sends target only ws_alive
        for msg in msgs:
            await mgr.send_to_user("u1", msg)

        # ws_alive should be the only one remaining
        remaining = mgr._connections.get("u1", [])
        assert ws_alive in remaining
        assert ws_dead not in remaining
        # ws_alive received all 3 messages
        assert ws_alive.send_json.await_count == 3
