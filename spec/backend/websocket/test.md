---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# WebSocket Test Specification

Tests: [websocket/spec.md](./spec.md)

## Scope

### In Scope
- WebSocket connection establishment and authentication
- Heartbeat ping/pong
- Reconnection behavior
- All server-to-client message types
- Error handling and connection cleanup

### Out of Scope
- LLM response generation logic (see llm/test.md)
- Dataset loading pipeline (see dataset_handling/test.md)
- Rate limit calculation (see rate_limiting/test.md)

---

## Test Scenarios

### WS-CONN-1: Connection with Valid Session
Tests: [spec.md#connection-lifecycle](./spec.md#connection-lifecycle)

- Scenario: Client connects to WebSocket endpoint with a valid session token as query parameter
- Expected: Connection established, server ready to push events

### WS-CONN-2: Connection with Invalid Token
Tests: [spec.md#connection-lifecycle](./spec.md#connection-lifecycle)

- Scenario: Client connects with an invalid session token (does not exist in sessions table)
- Expected: Connection rejected with 401 status

### WS-CONN-3: Connection with Expired Token
Tests: [spec.md#connection-lifecycle](./spec.md#connection-lifecycle)

- Scenario: Client connects with a session token whose expires_at is in the past
- Expected: Connection rejected with 401 status

### WS-CONN-4: Connection without Token
Tests: [spec.md#connection-lifecycle](./spec.md#connection-lifecycle)

- Scenario: Client connects without providing a session token
- Expected: Connection rejected with 401 status

---

### WS-HB-1: Heartbeat Ping/Pong
Tests: [spec.md#connection-lifecycle](./spec.md#connection-lifecycle)

- Scenario: WebSocket connection is idle
- Expected: Server sends ping every 30 seconds, client responds with pong, connection stays alive
- Edge cases:
  - Client fails to respond to ping: server detects stale connection and closes it

---

### WS-RECON-1: Reconnection Re-authentication
Tests: [spec.md#reconnection](./spec.md#reconnection)

- Scenario: Client disconnects and reconnects with a valid session
- Expected: Server re-authenticates session and re-registers connection. No state replay messages sent — client fetches state via REST `GET /conversations/:id`

### WS-RECON-2: Reconnection During Active Stream
Tests: [spec.md#reconnection](./spec.md#reconnection)

- Scenario: Client disconnects while an LLM response is being streamed, then reconnects
- Expected: On reconnect, streaming is not resumed. Partial response is lost. Client can resend the message

---

### WS-MSG-1: chat_token Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: LLM generates a token during streaming
- Expected: Client receives `{type: "chat_token", token: "...", message_id: "..."}`

### WS-MSG-2: chat_complete Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: LLM finishes generating a response
- Expected: Client receives `{type: "chat_complete", message_id: "...", token_count: N}`, optionally includes sql_query if SQL was executed

### WS-MSG-3: chat_error Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: Error occurs during LLM processing
- Expected: Client receives `{type: "chat_error", error: "...", details?: "..."}`

### WS-MSG-4: dataset_loading Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: Dataset loading is initiated
- Expected: Client receives `{type: "dataset_loading", dataset_id: "...", url: "...", status: "loading"}`

### WS-MSG-5: dataset_loaded Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: Dataset successfully loaded and schema extracted
- Expected: Client receives `{type: "dataset_loaded", dataset_id: "...", name: "...", row_count: N, column_count: N, schema: {...}}`

### WS-MSG-6: dataset_error Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: Dataset loading fails at any validation step
- Expected: Client receives `{type: "dataset_error", dataset_id: "...", error: "..."}`

### WS-MSG-7: query_status Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: Query execution progresses through phases
- Expected: Client receives `{type: "query_status", phase: "queued"|"generating"|"executing"|"formatting"}` at each phase transition

### WS-MSG-8: rate_limit_warning Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: User's token usage exceeds 80% of limit after a completed request
- Expected: Client receives `{type: "rate_limit_warning", usage_percent: N, remaining_tokens: N}`

### WS-MSG-9: rate_limit_exceeded Message
Tests: [spec.md#server--client-messages](./spec.md#server--client-messages)

- Scenario: User's token usage meets or exceeds 100% of limit
- Expected: Client receives `{type: "rate_limit_exceeded", resets_in_seconds: N}`

---

### WS-UNK-1: Unknown Message Type Ignored
Tests: [spec.md#message-format](./spec.md#message-format)

- Scenario: Server logic sends a message with an unrecognized type field
- Expected: Client receives the message and silently ignores it (no crash, no error surfaced)

---

### WS-ERR-1: Server Error During Processing
Tests: [spec.md#error-handling](./spec.md#error-handling)

- Scenario: An unhandled error occurs during LLM processing or query execution
- Expected: chat_error message sent to client, WebSocket connection remains open and functional for subsequent operations

### WS-ERR-2: Connection-Level Error
Tests: [spec.md#error-handling](./spec.md#error-handling)

- Scenario: Network-level failure causes WebSocket connection to drop
- Expected: Server cleans up connection state, client triggers reconnection with exponential backoff

---

### WS-CLEAN-1: Cleanup on Disconnect
Tests: [spec.md#connection-lifecycle](./spec.md#connection-lifecycle)

- Scenario: Client disconnects (tab closed, network lost, explicit close)
- Expected: Server removes connection from active connections, releases associated resources
- Edge cases:
  - Disconnect during active stream: stream cancelled, partial response preserved in database
