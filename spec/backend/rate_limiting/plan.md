---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Rate Limiting Plan

## Module Structure

### `backend/app/services/rate_limit_service.py`

Stateless service module with functions for checking and recording token usage. All state lives in the `token_usage` SQLite table.

## Functions

Implements: [spec.md#enforcement](./spec.md#enforcement), [spec.md#warning-state](./spec.md#warning-state)

| Function | Signature | Returns |
|----------|-----------|---------|
| `check_limit` | `async (db: Connection, user_id: str) -> RateLimitStatus` | Current usage status |
| `record_usage` | `async (db: Connection, user_id: str, input_tokens: int, output_tokens: int) -> None` | Nothing |

### `RateLimitStatus` (Pydantic model in `models.py`)

Fields: `allowed: bool`, `usage_tokens: int`, `limit_tokens: int`, `usage_percent: float`, `remaining_tokens: int`, `resets_in_seconds: int | None`, `warning: bool`.

## Rolling 24h Window Query

Implements: [spec.md#rolling-window](./spec.md#rolling-window)

`check_limit` executes a single SQL query:

```
SELECT
  COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
  MIN(timestamp) AS oldest_timestamp
FROM token_usage
WHERE user_id = ? AND timestamp > datetime('now', '-24 hours')
```

From the result:
- `total_tokens` compared against `config.TOKEN_LIMIT` (default 5,000,000).
- `usage_percent` = `total_tokens / config.TOKEN_LIMIT * 100`.
- `allowed` = `total_tokens < config.TOKEN_LIMIT`.
- `warning` = `usage_percent >= 80`.
- `remaining_tokens` = `max(0, config.TOKEN_LIMIT - total_tokens)`.
- `resets_in_seconds`: if over limit, calculate seconds until `oldest_timestamp + 24h` passes. Otherwise `None`.

## Recording Usage

Implements: [spec.md#enforcement](./spec.md#enforcement) (post-request recording)

`record_usage` inserts a row:

```
INSERT INTO token_usage (id, user_id, input_tokens, output_tokens, timestamp)
VALUES (?, ?, ?, ?, datetime('now'))
```

UUID generated via `uuid.uuid4()`.

## Integration Point

Implements: [spec.md#enforcement](./spec.md#enforcement)

Called by `chat_service.py` in the chat message flow:

1. **Before LLM call**: `status = await check_limit(db, user_id)`.
   - If `status.allowed` is `False`: return 429 HTTP response and send `rate_limit_exceeded` via WebSocket with `resets_in_seconds`.
   - If allowed: proceed.
2. **After LLM call**: `await record_usage(db, user_id, input_tokens, output_tokens)`.
3. **In `chat_complete` event**: if `status.warning` is `True` (re-check after recording), include `rate_limit_warning` with `usage_percent` and `remaining_tokens`.

## Warning Threshold

Implements: [spec.md#warning-state](./spec.md#warning-state)

- Threshold is 80%, stored as constant `WARNING_THRESHOLD_PERCENT = 80` in `rate_limit_service.py`.
- Warning data included in the `chat_complete` WebSocket event payload when triggered.

## Exceeded Response

Implements: [spec.md#exceeded-state](./spec.md#exceeded-state)

When `allowed` is `False`, `chat_service` returns HTTP 429 with body:

```
{"error": "rate_limit_exceeded", "resets_in_seconds": <int>, "usage_percent": 100.0}
```

And sends WebSocket event `rate_limit_exceeded` with the same data.

## Scope

### In Scope
- `check_limit` and `record_usage` function implementations
- Rolling window SQL query
- Warning and exceeded status computation
- Integration contract with `chat_service`

### Out of Scope
- Token counting (see llm/plan.md -- provides the token counts)
- Usage display endpoint (see routers/usage.py -- calls `check_limit` for current stats)
- Periodic cleanup of old `token_usage` rows (deferred to V2)

### Assumptions
- SQLite `datetime('now')` uses UTC consistently.
- `config.TOKEN_LIMIT` is a single integer (no per-tier logic in V1).
