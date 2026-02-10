"""Extended tests for the WebSocket ConnectionManager.

Supplements tests/websocket/test_connection_manager.py with deeper coverage
of edge cases, concurrency scenarios, dead-socket cleanup, broadcast-style
delivery, and active-connection accounting.

Covers:
- Connect / disconnect lifecycle (idempotency, ordering)
- Multiple connections per user (fan-out, selective removal)
- Dead socket cleanup during send_to_user (single dead, all dead, mixed)
- Disconnect of non-existent users and sockets (edge cases)
- Broadcast to all connected users
- Active connection counting
- State isolation between users
- Rapid connect/disconnect churn
- send_to_websocket error propagation
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.connection_manager import ConnectionManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_ws(*, name: str | None = None) -> AsyncMock:
    """Create a mock WebSocket with an async ``send_json`` method.

    An optional *name* makes assertion failure messages more readable.
    """
    ws = AsyncMock(name=name)
    ws.send_json = AsyncMock(name=f"{name}.send_json" if name else "send_json")
    return ws


def _make_dead_ws(*, name: str | None = None, error: Exception | None = None) -> AsyncMock:
    """Create a mock WebSocket whose ``send_json`` always raises."""
    ws = _make_ws(name=name)
    ws.send_json.side_effect = error or Exception("connection closed")
    return ws


def _active_user_count(mgr: ConnectionManager) -> int:
    """Return the number of users with at least one active connection."""
    return len(mgr._connections)


def _total_connection_count(mgr: ConnectionManager) -> int:
    """Return the total number of active WebSocket connections across all users."""
    return sum(len(sockets) for sockets in mgr._connections.values())


# ---------------------------------------------------------------------------
# 1. Connect and disconnect lifecycle
# ---------------------------------------------------------------------------


class TestConnectDisconnectLifecycle:
    """Full lifecycle: connect -> verify -> disconnect -> verify clean state."""

    @pytest.mark.asyncio
    async def test_fresh_manager_has_no_connections(self):
        """A newly created ConnectionManager has zero connections."""
        mgr = ConnectionManager()
        assert _active_user_count(mgr) == 0
        assert _total_connection_count(mgr) == 0

    @pytest.mark.asyncio
    async def test_connect_then_disconnect_cleans_up(self):
        """After connecting and disconnecting the sole socket, the user key is removed."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws1")
        await mgr.connect("u1", ws)
        assert _active_user_count(mgr) == 1
        await mgr.disconnect("u1", ws)
        assert _active_user_count(mgr) == 0
        assert "u1" not in mgr._connections

    @pytest.mark.asyncio
    async def test_connect_is_idempotent_for_same_socket(self):
        """Connecting the same WebSocket object twice adds it twice (list-based tracking)."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws-dup")
        await mgr.connect("u1", ws)
        await mgr.connect("u1", ws)
        # Implementation uses a list, so the socket appears twice
        assert len(mgr._connections["u1"]) == 2

    @pytest.mark.asyncio
    async def test_disconnect_after_double_connect_removes_one(self):
        """If a socket was added twice, disconnect removes only one occurrence."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws-dup")
        await mgr.connect("u1", ws)
        await mgr.connect("u1", ws)
        await mgr.disconnect("u1", ws)
        # One occurrence remains
        assert len(mgr._connections["u1"]) == 1
        assert ws in mgr._connections["u1"]

    @pytest.mark.asyncio
    async def test_disconnect_all_occurrences_cleans_user_key(self):
        """Disconnecting all occurrences of a socket removes the user key entirely."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws-dup")
        await mgr.connect("u1", ws)
        await mgr.connect("u1", ws)
        await mgr.disconnect("u1", ws)
        await mgr.disconnect("u1", ws)
        assert "u1" not in mgr._connections

    @pytest.mark.asyncio
    async def test_connect_disconnect_ordering(self):
        """Connect multiple sockets, disconnect in LIFO order -- state is correct at each step."""
        mgr = ConnectionManager()
        ws1 = _make_ws(name="ws1")
        ws2 = _make_ws(name="ws2")
        ws3 = _make_ws(name="ws3")

        await mgr.connect("u1", ws1)
        await mgr.connect("u1", ws2)
        await mgr.connect("u1", ws3)
        assert _total_connection_count(mgr) == 3

        await mgr.disconnect("u1", ws3)
        assert mgr._connections["u1"] == [ws1, ws2]

        await mgr.disconnect("u1", ws2)
        assert mgr._connections["u1"] == [ws1]

        await mgr.disconnect("u1", ws1)
        assert "u1" not in mgr._connections


# ---------------------------------------------------------------------------
# 2. Multiple connections per user
# ---------------------------------------------------------------------------


class TestMultipleConnectionsPerUser:
    """Scenarios with several concurrent connections for one user."""

    @pytest.mark.asyncio
    async def test_three_connections_registered(self):
        mgr = ConnectionManager()
        sockets = [_make_ws(name=f"ws{i}") for i in range(3)]
        for ws in sockets:
            await mgr.connect("u1", ws)
        assert len(mgr._connections["u1"]) == 3
        for ws in sockets:
            assert ws in mgr._connections["u1"]

    @pytest.mark.asyncio
    async def test_removing_middle_socket_preserves_order(self):
        """Removing a socket from the middle of the list keeps the rest in order."""
        mgr = ConnectionManager()
        ws1, ws2, ws3 = (_make_ws(name=f"ws{i}") for i in range(3))
        await mgr.connect("u1", ws1)
        await mgr.connect("u1", ws2)
        await mgr.connect("u1", ws3)
        await mgr.disconnect("u1", ws2)
        assert mgr._connections["u1"] == [ws1, ws3]

    @pytest.mark.asyncio
    async def test_connections_are_per_user(self):
        """Connecting sockets for different users keeps them isolated."""
        mgr = ConnectionManager()
        ws_a = _make_ws(name="ws-a")
        ws_b = _make_ws(name="ws-b")
        await mgr.connect("alice", ws_a)
        await mgr.connect("bob", ws_b)
        assert mgr._connections["alice"] == [ws_a]
        assert mgr._connections["bob"] == [ws_b]
        assert _active_user_count(mgr) == 2


# ---------------------------------------------------------------------------
# 3. send_to_user with multiple active connections
# ---------------------------------------------------------------------------


class TestSendToUserMultiple:
    """send_to_user should fan out to every connection the user has."""

    @pytest.mark.asyncio
    async def test_message_delivered_to_all_three_connections(self):
        mgr = ConnectionManager()
        sockets = [_make_ws(name=f"ws{i}") for i in range(3)]
        for ws in sockets:
            await mgr.connect("u1", ws)

        msg = {"type": "chat_token", "token": "hello"}
        await mgr.send_to_user("u1", msg)

        for ws in sockets:
            ws.send_json.assert_awaited_once_with(msg)

    @pytest.mark.asyncio
    async def test_send_does_not_affect_other_users(self):
        """Sending to user-a must not deliver to user-b."""
        mgr = ConnectionManager()
        ws_a = _make_ws(name="ws-a")
        ws_b = _make_ws(name="ws-b")
        await mgr.connect("a", ws_a)
        await mgr.connect("b", ws_b)

        msg = {"type": "chat_token", "token": "private"}
        await mgr.send_to_user("a", msg)

        ws_a.send_json.assert_awaited_once_with(msg)
        ws_b.send_json.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_send_multiple_messages_sequentially(self):
        """Multiple send_to_user calls deliver each message in order."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws1")
        await mgr.connect("u1", ws)

        msgs = [
            {"type": "chat_token", "token": "a"},
            {"type": "chat_token", "token": "b"},
            {"type": "chat_complete", "message_id": "m1", "sql_query": None, "token_count": 2},
        ]
        for m in msgs:
            await mgr.send_to_user("u1", m)

        assert ws.send_json.await_count == 3
        calls = [c.args[0] for c in ws.send_json.await_args_list]
        assert calls == msgs


# ---------------------------------------------------------------------------
# 4. Dead socket cleanup
# ---------------------------------------------------------------------------


class TestDeadSocketCleanup:
    """Verify that send_to_user removes sockets that raise on send."""

    @pytest.mark.asyncio
    async def test_single_dead_socket_removed(self):
        """One dead socket among two is pruned; the alive one remains."""
        mgr = ConnectionManager()
        ws_alive = _make_ws(name="alive")
        ws_dead = _make_dead_ws(name="dead")

        await mgr.connect("u1", ws_alive)
        await mgr.connect("u1", ws_dead)

        msg = {"type": "chat_token", "token": "x"}
        await mgr.send_to_user("u1", msg)

        ws_alive.send_json.assert_awaited_once_with(msg)
        assert ws_dead not in mgr._connections.get("u1", [])
        assert ws_alive in mgr._connections["u1"]

    @pytest.mark.asyncio
    async def test_all_dead_sockets_removed_cleans_user_key(self):
        """When every socket for a user is dead, the user key is removed entirely."""
        mgr = ConnectionManager()
        ws_dead1 = _make_dead_ws(name="dead1")
        ws_dead2 = _make_dead_ws(name="dead2")

        await mgr.connect("u1", ws_dead1)
        await mgr.connect("u1", ws_dead2)

        await mgr.send_to_user("u1", {"type": "ping"})

        assert "u1" not in mgr._connections

    @pytest.mark.asyncio
    async def test_mixed_alive_and_dead(self):
        """Multiple alive and dead sockets: only dead ones are removed."""
        mgr = ConnectionManager()
        alive1 = _make_ws(name="alive1")
        dead1 = _make_dead_ws(name="dead1")
        alive2 = _make_ws(name="alive2")
        dead2 = _make_dead_ws(name="dead2")

        await mgr.connect("u1", alive1)
        await mgr.connect("u1", dead1)
        await mgr.connect("u1", alive2)
        await mgr.connect("u1", dead2)

        msg = {"type": "chat_token", "token": "hi"}
        await mgr.send_to_user("u1", msg)

        remaining = mgr._connections.get("u1", [])
        assert alive1 in remaining
        assert alive2 in remaining
        assert dead1 not in remaining
        assert dead2 not in remaining
        assert len(remaining) == 2

    @pytest.mark.asyncio
    async def test_dead_socket_with_runtime_error(self):
        """Sockets that raise RuntimeError (e.g., event loop closed) are still cleaned up."""
        mgr = ConnectionManager()
        ws = _make_dead_ws(name="runtime-err", error=RuntimeError("Event loop is closed"))
        await mgr.connect("u1", ws)

        await mgr.send_to_user("u1", {"type": "chat_token", "token": "x"})
        assert "u1" not in mgr._connections

    @pytest.mark.asyncio
    async def test_dead_socket_with_connection_reset(self):
        """Sockets that raise ConnectionResetError are cleaned up."""
        mgr = ConnectionManager()
        ws = _make_dead_ws(name="connreset", error=ConnectionResetError("Connection reset"))
        await mgr.connect("u1", ws)

        await mgr.send_to_user("u1", {"type": "chat_token", "token": "x"})
        assert "u1" not in mgr._connections

    @pytest.mark.asyncio
    async def test_dead_socket_cleanup_does_not_affect_other_users(self):
        """Dead socket cleanup for one user must not touch another user's connections."""
        mgr = ConnectionManager()
        ws_alice = _make_ws(name="alice-ws")
        ws_bob_dead = _make_dead_ws(name="bob-dead")

        await mgr.connect("alice", ws_alice)
        await mgr.connect("bob", ws_bob_dead)

        await mgr.send_to_user("bob", {"type": "ping"})

        # Alice is untouched
        assert "alice" in mgr._connections
        assert ws_alice in mgr._connections["alice"]
        # Bob's dead socket was cleaned up
        assert "bob" not in mgr._connections

    @pytest.mark.asyncio
    async def test_alive_socket_still_receives_when_dead_socket_fails_first(self):
        """Even when earlier sockets in the list die, later alive sockets still get the message."""
        mgr = ConnectionManager()
        dead = _make_dead_ws(name="dead-first")
        alive = _make_ws(name="alive-second")

        await mgr.connect("u1", dead)
        await mgr.connect("u1", alive)

        msg = {"type": "chat_token", "token": "yes"}
        await mgr.send_to_user("u1", msg)

        alive.send_json.assert_awaited_once_with(msg)
        assert alive in mgr._connections["u1"]
        assert dead not in mgr._connections["u1"]


# ---------------------------------------------------------------------------
# 5. Disconnect non-existent user (edge cases)
# ---------------------------------------------------------------------------


class TestDisconnectEdgeCases:
    """Edge cases around disconnect that should never raise."""

    @pytest.mark.asyncio
    async def test_disconnect_user_never_connected(self):
        mgr = ConnectionManager()
        ws = _make_ws(name="phantom")
        # Must not raise
        await mgr.disconnect("never-connected", ws)
        assert _active_user_count(mgr) == 0

    @pytest.mark.asyncio
    async def test_disconnect_wrong_socket_for_user(self):
        """Disconnecting a socket that belongs to a different user (or no user) is safe."""
        mgr = ConnectionManager()
        ws_a = _make_ws(name="ws-a")
        ws_b = _make_ws(name="ws-b")
        await mgr.connect("alice", ws_a)

        # ws_b was never connected to alice
        await mgr.disconnect("alice", ws_b)

        # alice's real socket should still be there
        assert ws_a in mgr._connections["alice"]

    @pytest.mark.asyncio
    async def test_double_disconnect_same_socket(self):
        """Disconnecting the same socket twice is safe (second call is a no-op)."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ws1")
        await mgr.connect("u1", ws)

        await mgr.disconnect("u1", ws)
        # Second disconnect - user key is already gone
        await mgr.disconnect("u1", ws)

        assert "u1" not in mgr._connections

    @pytest.mark.asyncio
    async def test_disconnect_from_empty_manager(self):
        """Disconnecting from a manager that has never had any connections is safe."""
        mgr = ConnectionManager()
        ws = _make_ws(name="orphan")
        await mgr.disconnect("nobody", ws)
        assert mgr._connections == {}


# ---------------------------------------------------------------------------
# 6. Broadcast to all users
# ---------------------------------------------------------------------------


class TestBroadcast:
    """Simulate broadcasting by sending to every known user.

    The ConnectionManager does not have a native broadcast method, so these
    tests verify that iterating over all users and calling send_to_user
    delivers messages correctly, and that dead sockets are cleaned up across
    the board.
    """

    @staticmethod
    async def _broadcast(mgr: ConnectionManager, message: dict) -> None:
        """Send *message* to every user currently tracked."""
        # Snapshot user IDs to avoid mutation during iteration
        user_ids = list(mgr._connections.keys())
        for uid in user_ids:
            await mgr.send_to_user(uid, message)

    @pytest.mark.asyncio
    async def test_broadcast_to_multiple_users(self):
        mgr = ConnectionManager()
        ws_a = _make_ws(name="ws-a")
        ws_b = _make_ws(name="ws-b")
        ws_c = _make_ws(name="ws-c")
        await mgr.connect("alice", ws_a)
        await mgr.connect("bob", ws_b)
        await mgr.connect("carol", ws_c)

        msg = {"type": "system", "text": "server restarting"}
        await self._broadcast(mgr, msg)

        ws_a.send_json.assert_awaited_once_with(msg)
        ws_b.send_json.assert_awaited_once_with(msg)
        ws_c.send_json.assert_awaited_once_with(msg)

    @pytest.mark.asyncio
    async def test_broadcast_with_dead_sockets_cleans_up(self):
        mgr = ConnectionManager()
        ws_alive = _make_ws(name="alive")
        ws_dead = _make_dead_ws(name="dead")
        await mgr.connect("alice", ws_alive)
        await mgr.connect("bob", ws_dead)

        msg = {"type": "system", "text": "maintenance"}
        await self._broadcast(mgr, msg)

        ws_alive.send_json.assert_awaited_once_with(msg)
        assert "alice" in mgr._connections
        assert "bob" not in mgr._connections

    @pytest.mark.asyncio
    async def test_broadcast_to_empty_manager(self):
        """Broadcasting to zero users completes without error."""
        mgr = ConnectionManager()
        await self._broadcast(mgr, {"type": "ping"})
        assert _active_user_count(mgr) == 0

    @pytest.mark.asyncio
    async def test_broadcast_fan_out_multiple_connections_per_user(self):
        """Broadcast delivers to every connection of every user."""
        mgr = ConnectionManager()
        ws_a1 = _make_ws(name="alice-1")
        ws_a2 = _make_ws(name="alice-2")
        ws_b1 = _make_ws(name="bob-1")
        await mgr.connect("alice", ws_a1)
        await mgr.connect("alice", ws_a2)
        await mgr.connect("bob", ws_b1)

        msg = {"type": "system", "text": "hello all"}
        await self._broadcast(mgr, msg)

        ws_a1.send_json.assert_awaited_once_with(msg)
        ws_a2.send_json.assert_awaited_once_with(msg)
        ws_b1.send_json.assert_awaited_once_with(msg)


# ---------------------------------------------------------------------------
# 7. Active connection count
# ---------------------------------------------------------------------------


class TestActiveConnectionCount:
    """Verify user count and total connection count track correctly."""

    @pytest.mark.asyncio
    async def test_counts_after_connects(self):
        mgr = ConnectionManager()
        await mgr.connect("alice", _make_ws())
        await mgr.connect("alice", _make_ws())
        await mgr.connect("bob", _make_ws())

        assert _active_user_count(mgr) == 2
        assert _total_connection_count(mgr) == 3

    @pytest.mark.asyncio
    async def test_counts_after_disconnect(self):
        mgr = ConnectionManager()
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect("alice", ws1)
        await mgr.connect("alice", ws2)
        await mgr.disconnect("alice", ws1)

        assert _active_user_count(mgr) == 1
        assert _total_connection_count(mgr) == 1

    @pytest.mark.asyncio
    async def test_counts_after_full_disconnect(self):
        mgr = ConnectionManager()
        ws = _make_ws()
        await mgr.connect("alice", ws)
        await mgr.disconnect("alice", ws)

        assert _active_user_count(mgr) == 0
        assert _total_connection_count(mgr) == 0

    @pytest.mark.asyncio
    async def test_counts_after_dead_socket_cleanup(self):
        """Dead socket removal via send_to_user decrements counts correctly."""
        mgr = ConnectionManager()
        alive = _make_ws()
        dead = _make_dead_ws()
        await mgr.connect("alice", alive)
        await mgr.connect("alice", dead)

        assert _total_connection_count(mgr) == 2

        await mgr.send_to_user("alice", {"type": "ping"})

        assert _active_user_count(mgr) == 1
        assert _total_connection_count(mgr) == 1

    @pytest.mark.asyncio
    async def test_counts_many_users(self):
        mgr = ConnectionManager()
        for i in range(10):
            await mgr.connect(f"user-{i}", _make_ws())
            await mgr.connect(f"user-{i}", _make_ws())

        assert _active_user_count(mgr) == 10
        assert _total_connection_count(mgr) == 20


# ---------------------------------------------------------------------------
# 8. State isolation between tests (each test creates its own manager)
# ---------------------------------------------------------------------------


class TestStateIsolation:
    """Confirm that the manager instances are independent."""

    @pytest.mark.asyncio
    async def test_manager_a_does_not_see_manager_b(self):
        mgr_a = ConnectionManager()
        mgr_b = ConnectionManager()
        ws = _make_ws()
        await mgr_a.connect("u1", ws)

        assert _active_user_count(mgr_a) == 1
        assert _active_user_count(mgr_b) == 0

    @pytest.mark.asyncio
    async def test_separate_instances_have_separate_dicts(self):
        mgr_a = ConnectionManager()
        mgr_b = ConnectionManager()
        assert mgr_a._connections is not mgr_b._connections


# ---------------------------------------------------------------------------
# 9. send_to_websocket edge cases
# ---------------------------------------------------------------------------


class TestSendToWebsocket:
    """Tests for the direct send_to_websocket method."""

    @pytest.mark.asyncio
    async def test_sends_to_unregistered_socket(self):
        """send_to_websocket does not require prior connect()."""
        mgr = ConnectionManager()
        ws = _make_ws(name="unregistered")
        msg = {"type": "dataset_loading", "dataset_id": "d1", "url": "u", "status": "loading"}
        await mgr.send_to_websocket(ws, msg)
        ws.send_json.assert_awaited_once_with(msg)

    @pytest.mark.asyncio
    async def test_error_propagates(self):
        """send_to_websocket does NOT swallow errors (unlike send_to_user)."""
        mgr = ConnectionManager()
        ws = _make_dead_ws(name="broken")
        with pytest.raises(Exception, match="connection closed"):
            await mgr.send_to_websocket(ws, {"type": "ping"})

    @pytest.mark.asyncio
    async def test_does_not_modify_connections_dict(self):
        """send_to_websocket should not add or remove from _connections."""
        mgr = ConnectionManager()
        ws = _make_ws(name="ephemeral")
        await mgr.send_to_websocket(ws, {"type": "ping"})
        assert _active_user_count(mgr) == 0


# ---------------------------------------------------------------------------
# 10. send_to_user for non-existent users
# ---------------------------------------------------------------------------


class TestSendToNonExistentUser:
    """Sending to a user that has no connections should be a silent no-op."""

    @pytest.mark.asyncio
    async def test_send_to_unknown_user_does_nothing(self):
        mgr = ConnectionManager()
        # Must not raise
        await mgr.send_to_user("ghost", {"type": "chat_token", "token": "boo"})

    @pytest.mark.asyncio
    async def test_send_after_full_disconnect_does_nothing(self):
        mgr = ConnectionManager()
        ws = _make_ws()
        await mgr.connect("u1", ws)
        await mgr.disconnect("u1", ws)

        # User key should be gone; send should be silent
        await mgr.send_to_user("u1", {"type": "chat_token", "token": "x"})
        # ws should NOT have been called after the disconnect
        ws.send_json.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_send_after_dead_socket_cleanup_does_nothing(self):
        """After all sockets die and get cleaned up, subsequent sends are silent."""
        mgr = ConnectionManager()
        ws_dead = _make_dead_ws()
        await mgr.connect("u1", ws_dead)

        # First send triggers cleanup
        await mgr.send_to_user("u1", {"type": "ping"})
        assert "u1" not in mgr._connections

        # Second send should be silent no-op
        await mgr.send_to_user("u1", {"type": "ping"})


# ---------------------------------------------------------------------------
# 11. Rapid connect / disconnect churn
# ---------------------------------------------------------------------------


class TestChurn:
    """Simulate rapid connection/disconnection cycles."""

    @pytest.mark.asyncio
    async def test_rapid_connect_disconnect_cycles(self):
        """Connect and immediately disconnect many sockets in a loop."""
        mgr = ConnectionManager()
        for i in range(50):
            ws = _make_ws(name=f"ws-{i}")
            await mgr.connect("u1", ws)
            await mgr.disconnect("u1", ws)

        assert _active_user_count(mgr) == 0
        assert _total_connection_count(mgr) == 0

    @pytest.mark.asyncio
    async def test_connect_many_then_disconnect_all(self):
        """Connect 20 sockets, then disconnect them all."""
        mgr = ConnectionManager()
        sockets = [_make_ws(name=f"ws-{i}") for i in range(20)]
        for ws in sockets:
            await mgr.connect("u1", ws)

        assert _total_connection_count(mgr) == 20

        for ws in sockets:
            await mgr.disconnect("u1", ws)

        assert _active_user_count(mgr) == 0

    @pytest.mark.asyncio
    async def test_interleaved_connect_disconnect_multiple_users(self):
        """Interleave connect/disconnect across multiple users."""
        mgr = ConnectionManager()
        ws_a1 = _make_ws(name="a1")
        ws_b1 = _make_ws(name="b1")
        ws_a2 = _make_ws(name="a2")
        ws_b2 = _make_ws(name="b2")

        await mgr.connect("alice", ws_a1)
        await mgr.connect("bob", ws_b1)
        await mgr.disconnect("alice", ws_a1)
        await mgr.connect("alice", ws_a2)
        await mgr.connect("bob", ws_b2)
        await mgr.disconnect("bob", ws_b1)

        assert mgr._connections["alice"] == [ws_a2]
        assert mgr._connections["bob"] == [ws_b2]
        assert _active_user_count(mgr) == 2
        assert _total_connection_count(mgr) == 2
