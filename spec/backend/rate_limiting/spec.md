---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Rate Limiting Specification

## Scope

### In Scope
- Token-based rate limiting rules
- Rolling window calculation
- Warning and exceeded states
- Enforcement points

### Out of Scope
- Token counting implementation (see llm/spec.md)
- Usage display UI (see frontend/left_panel/usage_stats/spec.md)
- User identification (see auth/spec.md)

### Assumptions
- Rate limiting based on token count (input + output combined)
- Rolling 24-hour window (not calendar day)
- Single user tier (all users are registered)

## Behavior

### Limits

| User Type | Daily Token Limit | Identification |
|-----------|-------------------|----------------|
| Registered | 5,000,000 tokens | user_id |

Single tier — all users are authenticated.

### Rolling Window
- 24-hour rolling window: sum all tokens used in the last 24 hours from the current moment
- Calculated by querying `token_usage` table: `WHERE timestamp > now() - 24 hours AND user_id = ?`
- Window slides continuously (not reset at midnight)
- Old records (older than 24 hours) can be cleaned up periodically but are not deleted in real-time

### Enforcement
- Check performed **before** each LLM API call
- Steps:
  1. Calculate total tokens used in last 24 hours for this user
  2. If over limit: reject request immediately, return 429 via REST + `rate_limit_exceeded` via WebSocket
  3. If under limit: proceed with LLM call
- Post-request: record actual tokens used (may push user over limit for next request — that's acceptable)
- No mid-stream cutoff: once a request starts, it completes even if it exceeds the limit

### Warning State
- When usage exceeds 80% of limit:
  - Server includes `rate_limit_warning` in the `chat_complete` WebSocket event
  - Warning contains: `usage_percent` and `remaining_tokens`
- Warning is informational — does not block requests

### Exceeded State
- When usage meets or exceeds 100% of limit:
  - REST chat endpoint returns 429
  - Server sends `rate_limit_exceeded` via WebSocket
  - Includes: `resets_in_seconds` (time until oldest token usage record falls out of window)
  - All subsequent chat requests rejected until window clears
  - Dataset operations (add/remove) still allowed
  - Conversation management (new, delete, list) still allowed

### Edge Cases
- Multiple tabs: single WebSocket connection enforced, rate limit shared across user's sessions
- Clock skew: server clock is authoritative for all time calculations
