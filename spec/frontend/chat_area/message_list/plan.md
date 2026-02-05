---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Message List — Implementation Plan

## Component: `MessageList.tsx`

Implements: [spec.md#layout](./spec.md#layout), [spec.md#streaming](./spec.md#streaming)

### File Location

`frontend/src/components/chat-area/MessageList.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `onShowSQL` | `(messageId: string) => void` | Callback when "Show SQL" clicked on a message |

### State Dependencies

- `chatStore.messages` — array of `Message` objects for the active conversation
- `chatStore.streamingMessageId` — ID of message currently being streamed (null if idle)

### Message Data Shape

Each message in `chatStore.messages`:
- `id: string`
- `role: 'user' | 'assistant'`
- `content: string` (markdown for assistant, plain text for user)
- `sql?: string` (SQL executed for this response, if any)
- `tableData?: { columns: string[]; rows: any[][] }` (query result data, if any)
- `error?: { message: string; details: string }` (error info, if any)
- `timestamp: number`
- `loadingPhase?: 'thinking' | 'executing' | 'formatting'` (present during loading)

### Rendering Strategy

Implements: [spec.md#user-messages](./spec.md#user-messages), [spec.md#assistant-messages](./spec.md#assistant-messages)

- Map over `chatStore.messages`, rendering each in a `MessageBubble` sub-component.
- **User messages**: Right-aligned, distinct background (e.g., `bg-blue-100 dark:bg-blue-900`). Plain text only.
- **Assistant messages**: Left-aligned, different background. Content rendered as markdown using `react-markdown` library (added to dependencies). Supports headings, bold, italic, lists, code blocks.

### Inline Components Within Assistant Messages

- **DataGrid**: When `message.tableData` is present, render `<DataGrid>` inline after the text content.
- **"Show SQL" button**: When `message.sql` is present, render a small button below message text. Calls `onShowSQL(message.id)`.
- **Error display**: When `message.error` is present, render error message with expandable details using a `<details>` element.
- **Loading indicator**: When `message.loadingPhase` is present, render `<LoadingStates phase={message.loadingPhase} />` instead of content.

### Auto-Scroll

Implements: [spec.md#auto-scroll](./spec.md#auto-scroll)

- Track scroll position with a `useRef` on the scroll container.
- `userHasScrolledUp` state: set to `true` when user scrolls up (scroll position > threshold from bottom).
- When new content arrives and `userHasScrolledUp` is `false`: call `scrollIntoView` on a sentinel div at the bottom.
- When `userHasScrolledUp` is `true` and new content arrives: show a "Scroll to bottom" floating button.
- Clicking the button: scrolls to bottom and resets `userHasScrolledUp = false`.

### Streaming Display

Implements: [spec.md#streaming](./spec.md#streaming)

- Streaming message identified by `chatStore.streamingMessageId`.
- Content updates arrive via `chatStore` (WebSocket pushes tokens, store appends to message content).
- Markdown re-rendered on each content update. The `react-markdown` component receives the growing string.
- Typing indicator (animated dots via CSS) appended after content during active streaming.

### Per-Message Actions

Implements: [spec.md#per-message-actions](./spec.md#per-message-actions)

- Copy button appears on hover (CSS `group-hover`). Uses `navigator.clipboard.writeText()`.
- For assistant messages: copies raw markdown source (the `content` string), not rendered HTML.

### Timestamp

- Shown on hover via a tooltip or absolutely-positioned span with `opacity-0 group-hover:opacity-100`.
- Formatted as relative time (e.g., "2 min ago") using a small utility function.

## Scope

### In Scope
- Message rendering, auto-scroll, streaming display, per-message actions

### Out of Scope
- DataGrid internals (see data_grid/plan.md)
- Loading indicator internals (see loading_states/plan.md)
- SQL panel behavior (see sql_panel/plan.md)
