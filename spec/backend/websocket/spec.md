---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# WebSocket Specification

## Scope

### In Scope
- WebSocket connection lifecycle
- Server → Client event message types
- Heartbeat and reconnection behavior

### Out of Scope
- Message processing logic (see llm/spec.md, worker/spec.md)
- Authentication details (see auth/spec.md)
- Rate limiting logic (see rate_limiting/spec.md)
- Client actions (sent via REST — see rest_api/spec.md)

### Assumptions
- Single WebSocket connection per client session
- WebSocket is server-push only — client does not send action messages via WebSocket
- All client actions (send message, add dataset, etc.) go through REST endpoints

## Behavior

### Connection Lifecycle
1. Client connects with session token as query parameter
2. Server validates session (checks sessions table)
3. Server loads active conversation state (if any)
4. Connection established — ready to receive events
5. Heartbeat ping/pong every 30 seconds to detect stale connections
6. On disconnect: server cleans up connection state

### Reconnection
- Client auto-reconnects with exponential backoff:
  - 1s → 2s → 4s → 8s → 16s → max 30s between attempts
- On reconnect: server re-authenticates the session and re-registers the connection. No state replay — client re-fetches current conversation via REST `GET /conversations/:id`
- If disconnected during streaming: partial response is lost. User can resend their message
- If reconnection fails after 5 attempts: show user "Connection lost" message with manual retry button

### Message Format
- All messages are JSON with a `type` field for routing
- Unknown message types are silently ignored
- WebSocket is server → client only (no client → server action messages)

### Server → Client Messages

| Type | Fields | Description |
|------|--------|-------------|
| `chat_token` | `type`, `token`, `message_id` | Single streamed token |
| `chat_complete` | `type`, `message_id`, `sql_query?`, `token_count` | Response finished |
| `chat_error` | `type`, `error`, `details?` | Chat error occurred |
| `dataset_loading` | `type`, `dataset_id`, `url`, `status: "loading"` | Dataset load started |
| `dataset_loaded` | `type`, `dataset_id`, `name`, `row_count`, `column_count`, `schema` | Dataset ready |
| `dataset_error` | `type`, `dataset_id`, `error` | Dataset load failed |
| `query_status` | `type`, `phase: "queued"\|"generating"\|"executing"\|"formatting"` | Query progress phase |
| `rate_limit_warning` | `type`, `usage_percent`, `remaining_tokens` | Approaching limit |
| `rate_limit_exceeded` | `type`, `resets_in_seconds` | Limit hit, request rejected |

### Error Handling
- Server errors during processing: `chat_error` sent, connection maintained
- Connection-level errors: connection dropped, client reconnects via backoff
- Authentication failure on connect: connection rejected with 401
