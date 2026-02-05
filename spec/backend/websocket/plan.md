---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# WebSocket Plan

## FastAPI WebSocket Endpoint
Implements: [spec.md#Connection-Lifecycle](./spec.md#connection-lifecycle)

`routers/websocket.py` defines a single endpoint:

`@router.websocket("/ws")`
`async def websocket_endpoint(websocket: WebSocket, token: str = Query(...), db = Depends(get_db))`

Flow:
1. Extract `token` from query params
2. Validate session via `auth_service.validate_session(db, token)`
3. If invalid: `await websocket.close(code=4001)` and return
4. `await websocket.accept()`
5. Register connection: `connection_manager.connect(user_id, websocket)`
6. Enter receive loop (listens for client disconnect and pong frames)
7. On disconnect: `connection_manager.disconnect(user_id, websocket)`

## Connection Manager
Implements: [spec.md#Connection-Lifecycle](./spec.md#connection-lifecycle)

`services/connection_manager.py` — singleton class instantiated in `main.py` lifespan, passed to services via dependency injection.

```
class ConnectionManager:
    _connections: dict[str, list[WebSocket]]   # user_id -> active websockets

    async def connect(user_id: str, websocket: WebSocket) -> None
    async def disconnect(user_id: str, websocket: WebSocket) -> None
    async def send_to_user(user_id: str, message: dict) -> None
    async def send_to_websocket(websocket: WebSocket, message: dict) -> None
```

- `_connections` maps `user_id` to a list of `WebSocket` instances (supports multiple tabs/devices per spec: multiple sessions allowed)
- `send_to_user` serializes `message` to JSON, sends to all connections for that user
- `send_to_websocket` sends to a specific connection (used when service has a reference to the initiating socket)
- On `send` failure (connection closed): silently remove from `_connections`

## Message Serialization
Implements: [spec.md#Message-Format](./spec.md#message-format), [spec.md#Server-Client-Messages](./spec.md#server--client-messages)

All messages are Python dicts serialized to JSON via `json.dumps()`. Every message includes a `type` field.

Message factory functions in `services/ws_messages.py`:

| Function | Returns dict with type |
|----------|----------------------|
| `chat_token(token, message_id)` | `{"type": "chat_token", ...}` |
| `chat_complete(message_id, sql_query, token_count)` | `{"type": "chat_complete", ...}` |
| `chat_error(error, details)` | `{"type": "chat_error", ...}` |
| `dataset_loading(dataset_id, url)` | `{"type": "dataset_loading", ...}` |
| `dataset_loaded(dataset_id, name, row_count, column_count, schema)` | `{"type": "dataset_loaded", ...}` |
| `dataset_error(dataset_id, error)` | `{"type": "dataset_error", ...}` |
| `query_status(phase)` | `{"type": "query_status", ...}` |
| `rate_limit_warning(usage_percent, remaining_tokens)` | `{"type": "rate_limit_warning", ...}` |
| `rate_limit_exceeded(resets_in_seconds)` | `{"type": "rate_limit_exceeded", ...}` |

Services import these factories and pass the resulting dicts to `connection_manager.send_to_user()`.

## Heartbeat Implementation
Implements: [spec.md#Connection-Lifecycle](./spec.md#connection-lifecycle) (ping/pong every 30s)

An `asyncio.Task` runs per WebSocket connection, started after `accept()`:

`async def _heartbeat(websocket: WebSocket)`:
1. Loop: `await asyncio.sleep(30)`
2. Send WebSocket ping frame: `await websocket.send_bytes(b"")` using the ping opcode
3. If send fails (connection dead): cancel task, trigger disconnect cleanup

The heartbeat task is cancelled when `disconnect()` is called. FastAPI/Starlette handle pong frames automatically at the protocol level.

## Auth on Connect
Implements: [spec.md#Error-Handling](./spec.md#error-handling)

Authentication happens before `websocket.accept()`:
1. `token` extracted from query string (`/ws?token=...`)
2. `auth_service.validate_session(db, token)` returns `User | None`
3. If `None`: close with code `4001`, reason `"Authentication failed"`
4. If valid: accept connection, proceed

This prevents unauthenticated clients from holding open WebSocket connections.

## Broadcasting Pattern
Implements: [spec.md#Server-Client-Messages](./spec.md#server--client-messages)

Services push events to clients by calling `connection_manager`. The service layer receives a reference to `connection_manager` via FastAPI dependency injection (or module-level import of the singleton).

Data flow for a chat message:
1. REST `POST /conversations/:id/messages` received by router
2. Router calls `chat_service.process_message(user_id, conversation_id, content)`
3. `chat_service` calls LLM, receives streaming tokens
4. For each token: `await connection_manager.send_to_user(user_id, ws_messages.chat_token(token, msg_id))`
5. On completion: `await connection_manager.send_to_user(user_id, ws_messages.chat_complete(msg_id, sql, count))`

Data flow for dataset loading:
1. REST `POST /conversations/:id/datasets` received by router
2. Router calls `dataset_service.load_dataset(user_id, conversation_id, url)`
3. `dataset_service` sends `dataset_loading` event via connection_manager
4. Worker processes parquet file
5. On success: `dataset_loaded` event; on failure: `dataset_error` event

## Scope

### In Scope
- WebSocket endpoint and auth handshake, ConnectionManager class, message factories, heartbeat, broadcasting pattern

### Out of Scope
- Client-side reconnection (frontend/plan.md), message processing (llm/plan.md), rate limit triggers (rate_limiting/plan.md)

### Assumptions
- Starlette handles protocol-level ping/pong; single-process deployment (in-memory ConnectionManager sufficient)
