---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Rate Limiting Test Specification

Tests: [rate_limiting/spec.md](./spec.md)

## Scope

### In Scope
- 24-hour rolling window calculation
- Under-limit, warning, and exceeded states
- Enforcement behavior (pre-request check)
- No mid-stream cutoff guarantee
- Post-request recording
- Non-chat operations allowed when exceeded
- Reset time calculation
- Server clock authority

### Out of Scope
- Token counting from Gemini (see llm/test.md)
- Usage display UI (see frontend/left_panel/usage_stats)
- WebSocket message delivery (see websocket/test.md)

---

## Test Scenarios

### WINDOW-1: 24-Hour Rolling Window Calculation
Tests: [spec.md#rolling-window](./spec.md#rolling-window)

- Scenario: User has token_usage records at various timestamps within and outside the last 24 hours
- Expected: Only records with timestamp > (now - 24 hours) included in the sum
- Edge cases:
  - Record exactly 24 hours old: excluded from window
  - Record 23 hours 59 minutes old: included in window

### WINDOW-2: Window Slides Continuously
Tests: [spec.md#rolling-window](./spec.md#rolling-window)

- Scenario: User was at limit 23 hours ago, no usage in last 23 hours
- Expected: Old tokens have fallen out of the window, user is under limit

---

### UNDER-1: Usage Below Limit - Request Proceeds
Tests: [spec.md#enforcement](./spec.md#enforcement)

- Scenario: User has used 1,000,000 tokens in the last 24 hours (limit is 5,000,000)
- Expected: LLM request proceeds normally, no rate_limit_warning

### UNDER-2: Usage Below 80% - No Warning
Tests: [spec.md#warning-state](./spec.md#warning-state)

- Scenario: User has used 3,999,999 tokens (79.99% of 5M limit)
- Expected: Request proceeds, no rate_limit_warning included in chat_complete

---

### WARN-1: Warning at 80% Usage
Tests: [spec.md#warning-state](./spec.md#warning-state)

- Scenario: After a completed request, user's cumulative usage crosses 80% of limit
- Expected: rate_limit_warning included in the chat_complete WebSocket message with usage_percent and remaining_tokens

### WARN-2: Warning Is Informational Only
Tests: [spec.md#warning-state](./spec.md#warning-state)

- Scenario: User at 85% usage sends another chat request
- Expected: Request proceeds (not blocked), response includes rate_limit_warning

---

### EXCEED-1: Usage At Limit - Request Blocked
Tests: [spec.md#enforcement](./spec.md#enforcement)

- Scenario: User has used exactly 5,000,000 tokens in the last 24 hours
- Expected: REST endpoint returns 429, rate_limit_exceeded sent via WebSocket with resets_in_seconds

### EXCEED-2: Usage Above Limit - Request Blocked
Tests: [spec.md#enforcement](./spec.md#enforcement)

- Scenario: User has used 5,100,000 tokens (went over due to post-request recording)
- Expected: REST endpoint returns 429, rate_limit_exceeded sent via WebSocket

### EXCEED-3: No Mid-Stream Cutoff
Tests: [spec.md#enforcement](./spec.md#enforcement)

- Scenario: User is at 4,900,000 tokens, sends a request that consumes 200,000 tokens (pushing total to 5,100,000)
- Expected: Request completes fully (not cut off mid-stream), tokens recorded, next request will be blocked

### EXCEED-4: Post-Request Recording May Push Over
Tests: [spec.md#enforcement](./spec.md#enforcement)

- Scenario: User is at 4,999,000 tokens, sends a request consuming 50,000 tokens
- Expected: Request completes, total recorded as 5,049,000, subsequent requests blocked until window clears

---

### ALLOWED-1: Dataset Operations Allowed When Exceeded
Tests: [spec.md#exceeded-state](./spec.md#exceeded-state)

- Scenario: User has exceeded rate limit, attempts to add a dataset
- Expected: Dataset add request succeeds (not blocked by rate limiter)

### ALLOWED-2: Conversation Operations Allowed When Exceeded
Tests: [spec.md#exceeded-state](./spec.md#exceeded-state)

- Scenario: User has exceeded rate limit, attempts to create/list/delete conversations
- Expected: Conversation operations succeed (not blocked by rate limiter)

### ALLOWED-3: Chat Blocked When Exceeded
Tests: [spec.md#exceeded-state](./spec.md#exceeded-state)

- Scenario: User has exceeded rate limit, attempts to send a chat message
- Expected: POST /conversations/:id/messages returns 429

---

### RESET-1: Reset Time Calculation
Tests: [spec.md#exceeded-state](./spec.md#exceeded-state)

- Scenario: User's oldest token_usage record in the window was recorded 20 hours ago
- Expected: resets_in_seconds = approximately 4 hours (24 - 20), reflecting when that oldest record falls out of the window

### RESET-2: Reset Restores Access
Tests: [spec.md#rolling-window](./spec.md#rolling-window)

- Scenario: User was exceeded, enough time passes that old records fall out of the 24-hour window
- Expected: User's rolling total drops below limit, next chat request proceeds normally

---

### CLOCK-1: Server Clock Authoritative
Tests: [spec.md#edge-cases](./spec.md#edge-cases)

- Scenario: Client sends a request with a local timestamp that differs from server time
- Expected: Server uses its own clock for all token_usage timestamps and window calculations, client time ignored

### CLOCK-2: Multiple Sessions Share Rate Limit
Tests: [spec.md#edge-cases](./spec.md#edge-cases)

- Scenario: Same user is active from two different devices/sessions
- Expected: Rate limit calculated across all sessions for that user_id (single shared budget)
