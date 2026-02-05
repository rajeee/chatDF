---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Loading States Specification

## Scope

### In Scope
- Three-phase progress indicator during assistant response
- Phase transitions
- Timeout and error handling display

### Out of Scope
- WebSocket message protocol (see backend/websocket/spec.md)
- LLM processing (see backend/llm/spec.md)
- Dataset loading progress (see right_panel/dataset_card/spec.md)

### Assumptions
- Phase transitions driven by WebSocket `query_status` messages from the server

## Behavior

### Progress Indicator
- Displayed within the assistant message bubble (not a separate element)
- Three sequential phases:

| Phase | Label | Visual | Trigger |
|-------|-------|--------|---------|
| 1 | "Thinking..." | Animated dots (…) | User sends message |
| 2 | "Running query..." | Spinner icon | Server sends `query_status: "executing"` |
| 3 | "Preparing response..." | Spinner icon | Server sends `query_status: "formatting"` |

### Phase Transitions
- Phases always progress forward (1 → 2 → 3), never backward
- Not all phases may occur (e.g., if LLM responds with text only, skip phases 2 and 3)
- When streaming begins: loading indicator replaced by streaming text content
- Phase indicator replaced, not appended to — only one phase shown at a time

### Timeout
- If no response after 30 seconds from any phase start:
  - Current phase label changes to: "Taking longer than expected..."
  - No automatic cancellation (user can use stop button)
- Total timeout: 60 seconds → shows error state

### Error State
- Loading indicator replaced by error message within the same message bubble
- Error display:
  - User-friendly message: "Something went wrong. Please try again."
  - Expandable "Details" section with technical error information
  - "Try again" button that re-sends the same user message
- Error styling: muted red/warning coloring

### Interruption
- If user clicks stop button during any loading phase:
  - Loading indicator removed
  - If partial content received: shown as-is
  - If no content received: message bubble removed entirely
