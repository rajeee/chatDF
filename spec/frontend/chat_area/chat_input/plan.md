---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Chat Input — Implementation Plan

## Component: `ChatInput.tsx`

Implements: [spec.md#textarea](./spec.md#textarea), [spec.md#sending-messages](./spec.md#sending-messages)

### File Location

`frontend/src/components/chat-area/ChatInput.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `onSend` | `(text: string) => void` | Callback to send a message |
| `onStop` | `() => void` | Callback to cancel streaming |

### State Dependencies

- `chatStore.isStreaming` — determines send vs stop button display
- `chatStore.dailyLimitReached` — disables input entirely

### Internal State

- `inputValue: string` — controlled textarea value
- `charCount: number` — derived from `inputValue.length`

### Textarea Behavior

Implements: [spec.md#textarea](./spec.md#textarea)

- Native `<textarea>` element (not contenteditable).
- Auto-resize: on each `onChange`, set `textarea.style.height = 'auto'` then `textarea.style.height = textarea.scrollHeight + 'px'`. Clamped to max-height equivalent of ~5 lines via `max-h-[7.5rem]` (Tailwind) with `overflow-y-auto` beyond that.
- Starts at 1 line height (`rows={1}`).

### Keyboard Handling

Implements: [spec.md#sending-messages](./spec.md#sending-messages)

- `onKeyDown` handler on textarea:
  - `Enter` without `Shift`: call `handleSend()`, `preventDefault()`.
  - `Shift+Enter`: default behavior (newline inserted).
- `handleSend()`: trims whitespace, checks non-empty, calls `onSend(trimmedText)`, resets `inputValue` to empty string, resets textarea height.

### Send / Stop Button

Implements: [spec.md#stop-button](./spec.md#stop-button)

- Single button to the right of the textarea.
- When `chatStore.isStreaming` is `false`: arrow icon, `aria-label="Send message"`. Disabled if `inputValue.trim()` is empty.
- When `chatStore.isStreaming` is `true`: square icon, `aria-label="Stop generating"`. Clicking calls `onStop()`.

### Disabled States

Implements: [spec.md#disabled-states](./spec.md#disabled-states)

| Condition | Textarea | Send Button | Placeholder |
|-----------|----------|-------------|-------------|
| Normal | Enabled | Enabled (if non-empty) | "Ask a question about your data..." |
| Streaming | Enabled (type-ahead) | Replaced by stop button | Normal |
| Daily limit reached | Disabled | Disabled | "Daily limit reached" |

### Character Limit

Implements: [spec.md#character-limit](./spec.md#character-limit)

- Hard limit: 2000 characters. Enforced in `onChange` by slicing `value.slice(0, 2000)`.
- Counter shown when `charCount > 1800`: render `<span>` below textarea showing `"{charCount} / 2,000"`.
- Counter turns warning color (`text-red-500`) when `charCount >= 2000`.
- Paste handling: `onPaste` event, truncate pasted text to fit within 2000 limit.

### Accessibility

Implements: [spec.md#accessibility](./spec.md#accessibility)

- Textarea is natively focusable via Tab.
- Send/stop button has `aria-label` as specified.
- Textarea has `aria-label="Message input"`.

## Scope

### In Scope
- Textarea with auto-resize, keyboard shortcuts, send/stop, character limit

### Out of Scope
- Message sending logic (parent provides `onSend`)
- Streaming cancellation mechanics (parent provides `onStop`)
