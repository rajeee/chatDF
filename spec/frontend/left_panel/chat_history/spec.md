---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Chat History Specification

## Scope

### In Scope
- Conversation list display and behavior
- Conversation selection, renaming, deletion
- Conversation persistence

### Out of Scope
- Conversation data persistence (see backend/database/spec.md)
- Message display (see chat_area/message_list/spec.md)

### Assumptions
- Conversation titles auto-generated from first user message

## Behavior

### Conversation List
- Scrollable list of conversations sorted by most recent activity (newest first)
- Each item displays:
  - Title: truncated to ~50 characters with ellipsis
  - Relative timestamp: "2h ago", "yesterday", "3 days ago"
- Active conversation visually highlighted (distinct background color)
- Click loads the conversation and its associated datasets in the chat area and right panel

### Title Generation
- Auto-generated from the first user message in the conversation
- Takes the first ~50 characters of the message text
- Editable: inline rename on double-click or via context menu
- Title changes saved immediately

### Persistence
- All conversations persisted across sessions (all users are authenticated)
- Conversations loaded from server on sign-in

### New Chat
- "New Chat" button at top of the panel (defined in parent left_panel/spec.md)
- Creates a new conversation, sets it as active
- Previous conversation remains in the list

### Deletion
- Delete via:
  - Right-click context menu → "Delete"
  - Hover reveals X icon on the conversation item
- Confirmation required before deletion ("Delete this conversation?")
- If active conversation is deleted, chat area shows onboarding/empty state
- Deleted conversations removed from list immediately

### Empty State
- When no conversations exist: subtle text "No conversations yet"
- New users see this on first sign-in

### Overflow
- Long list scrolls independently within the chat history section
- No pagination — continuous scroll
