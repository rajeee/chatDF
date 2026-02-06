---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# WebSocket Test Plan

## Fixtures (`tests/websocket/conftest.py`)

### `ws_client` — Authenticated WebSocket test connection

Uses `httpx` + `starlette.testclient.TestClient` WebSocket support:

```python
@pytest.fixture
async def ws_client(db, test_session):
    app.state.db = db
    client = TestClient(app)
    with client.websocket_connect(f"/ws?token={test_session['id']}") as ws:
        yield ws
```

### `ws_helper` — Utility for reading/asserting WebSocket messages

```python
class WSHelper:
    def __init__(self, ws):
        self.ws = ws
        self.received = []

    def receive_json(self, timeout=2.0):
        data = self.ws.receive_json(timeout=timeout)
        self.received.append(data)
        return data

    def assert_received_type(self, expected_type):
        msg = self.receive_json()
        assert msg["type"] == expected_type
        return msg

    def assert_no_message(self, timeout=0.5):
        """Assert no message received within timeout."""
        with pytest.raises(TimeoutError):
            self.ws.receive_json(timeout=timeout)
```

### `connection_manager` — Direct access for integration tests

```python
@pytest.fixture
def connection_manager():
    return app.state.connection_manager
```

## Test Implementation by Scenario

### Connection Tests (`test_connection.py`)

Tests: [test.md#WS-CONN-1 through WS-CONN-4](./test.md)

| Scenario | Approach |
|----------|----------|
| WS-CONN-1 | Connect with valid session token. Assert connection accepted (no exception). Send a test frame to verify bidirectional communication. |
| WS-CONN-2 | Connect with `token=nonexistent-uuid`. Assert connection closed with code 4001. |
| WS-CONN-3 | Create expired session. Connect with its token. Assert close code 4001. |
| WS-CONN-4 | Connect without `token` query param. Assert connection rejected (close code 4001 or HTTP 401 on upgrade). |

### Heartbeat Tests (`test_heartbeat.py`)

Tests: [test.md#WS-HB-1](./test.md)

| Scenario | Approach |
|----------|----------|
| WS-HB-1 | Connect. Wait >30s (use `@pytest.mark.slow`). Assert a ping frame received. Respond with pong. Assert connection stays alive. |

**Note**: This test is marked `slow`. For faster CI, mock the heartbeat interval to 1 second during test.

```python
@pytest.fixture
def fast_heartbeat(monkeypatch):
    monkeypatch.setattr("app.routers.websocket.HEARTBEAT_INTERVAL", 1)
```

### Reconnection Tests (`test_reconnection.py`)

Tests: [test.md#WS-RECON-1, WS-RECON-2](./test.md)

| Scenario | Approach |
|----------|----------|
| WS-RECON-1 | Connect, seed conversation with messages and datasets. Disconnect (close WebSocket). Reconnect. Assert server re-authenticates and re-registers connection. Assert no state replay messages sent — client must re-fetch via REST. |
| WS-RECON-2 | Connect. Trigger a streaming LLM response (via sending a chat message through REST). Disconnect mid-stream. Reconnect. Assert streaming is not resumed. Assert no replay of partial response. |

Reconnection tests require coordination between REST and WebSocket. The test flow:
1. Connect WebSocket
2. POST a message via REST (triggers LLM processing)
3. Receive some `chat_token` messages on WebSocket
4. Close WebSocket
5. Reconnect
6. Assert no state replay messages sent (server does not replay state)

### Message Type Tests (`test_messages.py`)

Tests: [test.md#WS-MSG-1 through WS-MSG-9](./test.md)

Each message type test follows the same pattern:
1. Trigger the action that produces the message (via REST API or direct service call)
2. Read the WebSocket message
3. Assert `type` field and all expected payload fields

| Scenario | Trigger | Assert Fields |
|----------|---------|---------------|
| WS-MSG-1 | Send chat message (mock LLM to stream) | `type: "chat_token"`, `token`, `message_id` |
| WS-MSG-2 | Complete LLM response | `type: "chat_complete"`, `message_id`, `token_count` |
| WS-MSG-3 | Mock LLM error during processing | `type: "chat_error"`, `error` |
| WS-MSG-4 | POST dataset (loading starts) | `type: "dataset_loading"`, `dataset_id`, `url` |
| WS-MSG-5 | Dataset loading completes | `type: "dataset_loaded"`, `name`, `row_count`, `column_count`, `schema` |
| WS-MSG-6 | Dataset loading fails | `type: "dataset_error"`, `dataset_id`, `error` |
| WS-MSG-7 | LLM enters each processing phase | `type: "query_status"`, `phase` in `["queued", "generating", "executing", "formatting"]` |
| WS-MSG-8 | Usage crosses 80% | `type: "rate_limit_warning"`, `usage_percent`, `remaining_tokens` |
| WS-MSG-9 | Usage exceeds 100% | `type: "rate_limit_exceeded"`, `resets_in_seconds` |

### Error Tests (`test_errors.py`)

Tests: [test.md#WS-ERR-1, WS-ERR-2, WS-UNK-1](./test.md)

| Scenario | Approach |
|----------|----------|
| WS-ERR-1 | Inject an unhandled error during message processing. Assert `chat_error` sent. Assert WebSocket still open (send another message, receive response). |
| WS-ERR-2 | Forcefully close the connection from server side. Assert client receives close frame. Assert server cleaned up connection state. |
| WS-UNK-1 | Use `connection_manager.send_to_user` to send `{"type": "unknown_type", "data": "test"}`. Assert client receives it without crashing. (This tests frontend tolerance, but we verify server sends it.) |

### Cleanup Tests (`test_cleanup.py`)

Tests: [test.md#WS-CLEAN-1](./test.md)

| Scenario | Approach |
|----------|----------|
| WS-CLEAN-1 | Connect. Assert `connection_manager._connections[user_id]` has 1 entry. Disconnect. Assert `connection_manager._connections[user_id]` is empty or key removed. |

Edge case: Disconnect during active stream. Assert partial response preserved in `messages` table (query DB after disconnect).

## Integration Test: Full Chat Round-Trip via WebSocket

A single integration test that exercises the full flow:
1. Connect WebSocket
2. POST message via REST
3. Receive `query_status("generating")` on WS
4. Receive `chat_token` events on WS
5. Receive `query_status("executing")` (if tool call)
6. Receive `query_status("formatting")`
7. Receive `chat_complete` on WS
8. Assert message in DB

This test uses a mocked Gemini client but real services, real DB, and real WebSocket.

## Scope

### In Scope
- All WebSocket test scenarios from websocket/test.md
- Connection lifecycle (auth, heartbeat, disconnect)
- All 9 message types verified
- Reconnection without state replay (client re-fetches via REST)
- Error handling without connection drop

### Out of Scope
- Client-side reconnection logic (see frontend test plans)
- LLM response generation (mocked; see llm/test_plan.md)
- Rate limit calculations (see rate_limiting/test_plan.md)
