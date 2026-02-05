---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Chat Input Specification

## Scope

### In Scope
- Textarea behavior and sizing
- Send and stop actions
- Disabled states
- Character limits
- Keyboard shortcuts

### Out of Scope
- Message sending protocol (see backend/rest_api/spec.md)
- Rate limiting display (see left_panel/usage_stats/spec.md)

### Assumptions
- Input is a textarea, not a contenteditable div

## Behavior

### Textarea
- Multi-line text input
- Auto-resizes vertically: starts at 1 line, grows up to ~5 lines as user types
- Beyond 5 lines: textarea height fixed, content scrolls internally
- Placeholder text varies by state (see Disabled States below)
- Default placeholder: "Ask a question about your data..."

### Sending Messages
- **Enter** key sends the message (if input is not empty and not disabled)
- **Shift+Enter** inserts a newline (does not send)
- **Send button**: arrow icon to the right of the textarea, clicks to send
- On send: input clears immediately, message appears in message list
- Empty messages cannot be sent (send button disabled, Enter does nothing)
- Leading/trailing whitespace trimmed before sending

### Stop Button
- While assistant is responding (streaming): send button replaced with a stop button (square icon)
- Clicking stop: cancels in-progress streaming
- Partial response preserved in message list (whatever has been received so far)
- After stopping: input returns to normal send state

### Disabled States

| State | Input Behavior | Placeholder Text |
|-------|---------------|-----------------|
| Assistant responding | Enabled (can type ahead), send disabled | Normal placeholder |
| Daily limit reached | Disabled, cannot type | "Daily limit reached" |
| Normal (with or without datasets) | Enabled | "Ask a question about your data..." |

Note: Input is **always enabled** regardless of whether datasets are loaded. The LLM handles missing data scenarios gracefully.

### Character Limit
- Soft limit: 2,000 characters
- When approaching limit (>1,800 chars): character counter appears below textarea
- Counter format: "1,847 / 2,000"
- At 2,000: counter turns warning color, additional typing prevented
- Pasting text that would exceed limit: text truncated at 2,000 characters

### Accessibility
- Textarea is focusable via Tab key
- Send button has aria-label "Send message"
- Stop button has aria-label "Stop generating"
