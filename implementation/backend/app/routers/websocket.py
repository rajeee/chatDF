"""WebSocket endpoint for real-time server-push events.

Implements: spec/backend/websocket/plan.md#FastAPI-WebSocket-Endpoint

Provides:
- ``WS /ws?token=...``: WebSocket endpoint with token auth and heartbeat.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.services import auth_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HEARTBEAT_INTERVAL: float = 30.0  # seconds between heartbeat pings

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter()


# ---------------------------------------------------------------------------
# Heartbeat task
# Implements: spec/backend/websocket/plan.md#Heartbeat-Implementation
# ---------------------------------------------------------------------------


async def _heartbeat(websocket: WebSocket) -> None:
    """Send periodic ping messages to keep the connection alive.

    Runs as a background task per WebSocket connection. If sending fails
    (connection dead), the task ends and disconnect cleanup takes over.
    """
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await websocket.send_json({"type": "ping"})
    except Exception:
        # Connection closed or errored — task exits, disconnect handles cleanup
        pass


# ---------------------------------------------------------------------------
# WS /ws?token=...
# Implements: spec/backend/websocket/plan.md#FastAPI-WebSocket-Endpoint
# ---------------------------------------------------------------------------


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=None),
) -> None:
    """WebSocket endpoint: authenticate, accept, heartbeat, receive loop.

    Flow per plan:
    1. Validate token via auth_service.validate_session
    2. If invalid: close with 4001, return
    3. Accept connection
    4. Register with connection_manager
    5. Start heartbeat task
    6. Enter receive loop
    7. On disconnect: cleanup
    """
    db = websocket.app.state.db
    connection_manager = websocket.app.state.connection_manager

    # --- Auth ---
    # Implements: spec/backend/websocket/plan.md#Auth-on-Connect
    # Accept token from query param or fall back to session cookie
    # (browsers send cookies on WS upgrade, so cookie auth works reliably)
    if not token:
        token = websocket.cookies.get("session_token")
    if not token:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    user = await auth_service.validate_session(db, token)
    if user is None:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    user_id: str = user["id"]

    # --- Accept and register ---
    await websocket.accept()
    await connection_manager.connect(user_id, websocket)

    # --- Heartbeat ---
    heartbeat_task = asyncio.create_task(_heartbeat(websocket))

    # --- Receive loop ---
    try:
        while True:
            # Server-push only: we just listen for disconnect or client messages.
            # Any client message is ignored (spec: WS is server->client only).
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # --- Cleanup ---
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await connection_manager.disconnect(user_id, websocket)
