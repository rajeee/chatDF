---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Chat Area Specification

## Scope

### In Scope
- Chat area container layout and states
- Coordination between child components

### Out of Scope
- Individual component behavior (see child specs)
- WebSocket protocol (see backend/websocket/spec.md)

### Assumptions
- Chat area fills all horizontal space between left and right panels
- SQL panel overlays within chat area, does not replace it

## Behavior

### Layout
- Vertically stacked layout:
  1. Message list (scrollable, fills available vertical space)
  2. Chat input (fixed to bottom)
- SQL panel overlays from bottom when activated (sits above input, below messages)

### States

#### No Datasets Loaded
- Message list shows onboarding guide
- Chat input **enabled** — user can chat even without datasets
  - LLM will suggest adding a dataset if user asks a data question
  - If user pastes a parquet URL in their message, it is auto-detected and loaded
- SQL panel not available (no queries yet)

#### Datasets Loaded, No Messages
- Message list shows suggested prompts for the loaded data
  - 3-4 clickable prompt chips based on dataset schema
  - Examples: "Show me the first 10 rows", "What columns are available?", "Summarize this data"
- Chat input enabled with standard placeholder
- Clicking a suggested prompt sends it as a message

#### Active Conversation
- Message list shows conversation history
- Chat input enabled
- SQL panel available when messages contain SQL

#### Streaming Response
- New assistant message bubble appears with streaming content
- Chat input shows stop button instead of send button
- Auto-scroll follows new content

### Conversation Loading
- When user selects a conversation from chat history:
  - Message list populates with stored messages
  - Datasets associated with the conversation load in right panel
  - Chat input becomes active
  - Scrolls to bottom of message list

## Child Specs
- [Onboarding](./onboarding/spec.md)
- [Message List](./message_list/spec.md)
- [Chat Input](./chat_input/spec.md)
- [SQL Panel](./sql_panel/spec.md)
- [Data Grid](./data_grid/spec.md)
- [Loading States](./loading_states/spec.md)
