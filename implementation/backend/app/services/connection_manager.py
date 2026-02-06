"""WebSocket connection manager.

Implements: spec/backend/websocket/plan.md#Connection-Manager

Singleton class instantiated in ``main.py`` lifespan, passed to services
via dependency injection. Maps user IDs to their active WebSocket connections
(supports multiple tabs/devices per user).
"""

from __future__ import annotations

from starlette.websockets import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections per user and routes messages."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Register a WebSocket for *user_id*."""
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        """Remove *websocket* from *user_id*'s connection list.

        Safe to call even if the user or socket is not tracked.
        """
        sockets = self._connections.get(user_id)
        if sockets is None:
            return
        try:
            sockets.remove(websocket)
        except ValueError:
            pass
        # Clean up empty list
        if not sockets:
            del self._connections[user_id]

    async def send_to_user(self, user_id: str, message: dict) -> None:
        """Send *message* as JSON to **all** connections for *user_id*.

        If a send fails (connection already closed), that socket is silently
        removed from the connections list.
        """
        sockets = self._connections.get(user_id)
        if not sockets:
            return

        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)

        # Remove dead sockets
        for ws in dead:
            try:
                sockets.remove(ws)
            except ValueError:
                pass

        # Clean up empty list
        if not sockets:
            del self._connections[user_id]

    async def send_to_websocket(self, websocket: WebSocket, message: dict) -> None:
        """Send *message* as JSON to a specific *websocket*."""
        await websocket.send_json(message)
