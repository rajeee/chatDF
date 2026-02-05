---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Loading States — Implementation Plan

## Component: `LoadingStates.tsx`

Implements: [spec.md#progress-indicator](./spec.md#progress-indicator), [spec.md#phase-transitions](./spec.md#phase-transitions)

### File Location

`frontend/src/components/chat-area/LoadingStates.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `phase` | `'thinking' \| 'executing' \| 'formatting'` | Current loading phase |
| `phaseStartTime` | `number` | Timestamp when current phase began (for timeout detection) |

### No Store Dependencies

All state passed via props from the parent message bubble in MessageList.

### Phase Display

Implements: [spec.md#progress-indicator](./spec.md#progress-indicator)

| Phase | Label | Visual Element |
|-------|-------|----------------|
| `thinking` | "Thinking..." | Animated dots (CSS `@keyframes` on three `<span>` elements with staggered `animation-delay`) |
| `executing` | "Running query..." | Spinner icon (CSS `animate-spin` on an SVG circle) |
| `formatting` | "Preparing response..." | Same spinner icon |

- Render label and visual side-by-side in a flex row.
- Only one phase shown at a time (component receives current phase as prop).

### Phase Transition Mechanism

Implements: [spec.md#phase-transitions](./spec.md#phase-transitions)

- Transitions driven by WebSocket `query_status` events, which update `message.loadingPhase` in `chatStore`.
- MessageList reads `message.loadingPhase` and passes it to `LoadingStates`.
- Phases progress forward only (1 to 2 to 3). The store enforces forward-only transitions.
- When streaming begins: parent stops rendering LoadingStates (message gets content instead of `loadingPhase`).

### Timeout Handling

Implements: [spec.md#timeout](./spec.md#timeout)

- Internal `useEffect` with a `setInterval` (every 1 second) comparing `Date.now() - phaseStartTime`.
- At 30 seconds: local state `isDelayed = true`, label changes to "Taking longer than expected...".
- At 60 seconds: local state `isTimedOut = true`. Component renders error state inline.
- No automatic cancellation; user can use the stop button in ChatInput.

### Error State

Implements: [spec.md#error-state](./spec.md#error-state)

- When timeout or server error occurs, LoadingStates is replaced by error content within the same message bubble. This replacement is handled by the parent (MessageList sets `message.error` in store).
- Error display rendered by MessageList directly (not by LoadingStates), consisting of:
  - User-friendly message text.
  - `<details>` element for expandable technical info.
  - "Try again" button calling `chatStore.resendMessage(messageId)`.

### Interruption

Implements: [spec.md#interruption](./spec.md#interruption)

- Stop button in ChatInput triggers cancellation.
- If `message.content` is empty after stop: parent removes the message from the store entirely.
- If partial content exists: LoadingStates unmounted, partial content displayed as-is.

## Scope

### In Scope
- Phase indicator rendering, timeout detection, animated visuals

### Out of Scope
- WebSocket event handling (chatStore handles this)
- Error display rendering (MessageList handles this)
- Stop button mechanics (ChatInput handles this)
