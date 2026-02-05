---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# SQL Panel Specification

## Scope

### In Scope
- SQL panel display and layout
- Open/close behavior
- SQL content presentation

### Out of Scope
- SQL execution (see backend/worker/spec.md)
- SQL generation (see backend/llm/spec.md)
- Syntax highlighting implementation details (plan phase)

### Assumptions
- Only one SQL panel open at a time
- SQL panel does not block chat interaction

## Behavior

### Trigger
- Activated by clicking "Show SQL" button on an assistant message
- Only available on messages where SQL was executed

### Layout
- Slides up from bottom of the chat area
- Height: ~40% of the chat area
- Positioned above the chat input, below the message list
- Message list area shrinks to accommodate the panel
- Does not block chat interaction — user can still scroll messages above it

### Content
- Syntax-highlighted SQL query (read-only)
- Copy button: copies SQL text to clipboard
- Close button (X icon) in top-right corner of panel

### Open/Close
- Open: click "Show SQL" on any assistant message
- If panel is already open with different SQL: replaces content with new SQL (no animation)
- If panel is open and same "Show SQL" clicked again: panel closes (toggle behavior)
- Close via:
  - X button in panel
  - Clicking the same "Show SQL" button again
  - Escape key (when panel is focused)
- Close animation: slides down (~200ms)
- Open animation: slides up (~200ms)

### Constraints
- Only one SQL panel open at a time
- Panel content is read-only (no editing)
- No SQL execution from the panel (view only)
