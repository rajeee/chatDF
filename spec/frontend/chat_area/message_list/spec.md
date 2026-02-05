---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Message List Specification

## Scope

### In Scope
- Message display and layout
- Message content types (text, tables, SQL, errors)
- Streaming behavior
- Auto-scroll
- Per-message actions

### Out of Scope
- Data grid component details (see data_grid/spec.md)
- SQL panel behavior (see sql_panel/spec.md)
- Loading state indicators (see loading_states/spec.md)

### Assumptions
- Messages are rendered in chronological order (oldest first)
- Markdown rendering uses a standard library (specifics in plan)

## Behavior

### Layout
- Scrollable container filling available vertical space above chat input
- Messages stacked vertically with consistent spacing

### User Messages
- Right-aligned
- Distinct background color (differs from assistant messages)
- Plain text only (no markdown rendering)
- Timestamp visible on hover

### Assistant Messages
- Left-aligned
- Different background color from user messages
- Can contain multiple content types within a single message:
  - **Plain text**: rendered as markdown (headings, bold, italic, lists, code blocks)
  - **Data tables**: rendered as inline DataGrid component (see data_grid/spec.md)
  - **"Show SQL" button**: appears when SQL was executed for this response
  - **Error messages**: styled with error color, expandable "Details" section with technical info
- Timestamp visible on hover

### Streaming
- When assistant response is streaming:
  - New assistant message bubble appears immediately
  - Text tokens appended in real-time as they arrive via WebSocket
  - Typing indicator (animated dots) shown at cursor position during active streaming
  - Markdown rendered progressively (may re-render as more tokens arrive)
- When streaming completes:
  - Typing indicator removed
  - Final message rendered with all content (tables, SQL button, etc.)
  - Token count recorded (not displayed to user directly)

### Auto-Scroll
- Automatically scrolls to bottom when new messages arrive
- Exception: if user has manually scrolled up (reading history), auto-scroll pauses
- A "scroll to bottom" button appears when user is scrolled up and new content arrives
- Clicking "scroll to bottom" resumes auto-scroll

### Per-Message Actions
- **Copy button**: appears on hover for each message, copies text content to clipboard
- Copy on assistant messages: copies markdown source (not rendered HTML)
- No edit or delete actions on individual messages (V1)

### Empty Conversation (with datasets loaded)
- Shows suggested prompt chips (defined in chat_area/spec.md)
- No messages displayed
