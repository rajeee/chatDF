---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Chat Area — Implementation Plan

## Component: `ChatArea.tsx`

Implements: [spec.md#layout](./spec.md#layout), [spec.md#states](./spec.md#states)

### File Location

`frontend/src/components/chat-area/ChatArea.tsx`

### Component Structure

```
ChatArea
├── OnboardingGuide (conditional)
├── SuggestedPrompts (conditional)
├── MessageList
├── SQLPanel (conditional)
└── ChatInput
```

### Props

None. ChatArea is a top-level layout component that reads all state from stores.

### State Dependencies

- `chatStore.messages` — determines which state to render (empty vs active)
- `datasetStore.datasets` — determines onboarding vs suggested prompts
- `uiStore.sqlPanelOpen` — controls SQL panel visibility
- `uiStore.sqlPanelMessageId` — which message's SQL to display

### Layout Approach

- Flex column container, `h-full` to fill available vertical space.
- MessageList gets `flex-1 overflow-y-auto` (takes remaining height).
- SQLPanel renders between MessageList and ChatInput when visible. The panel uses a fixed height (~40% of container) and the MessageList shrinks via flex layout.
- ChatInput fixed to bottom with `flex-shrink-0`.

### Conditional Rendering Logic

| Condition | Rendered Content |
|-----------|-----------------|
| No datasets loaded AND no messages | OnboardingGuide replaces MessageList |
| Datasets loaded AND no messages | SuggestedPrompts rendered inside MessageList area |
| Messages exist | MessageList with conversation |

Implements: [spec.md#no-datasets-loaded](./spec.md#no-datasets-loaded), [spec.md#datasets-loaded-no-messages](./spec.md#datasets-loaded-no-messages)

### SQL Panel Integration

- SQLPanel slides up from bottom using CSS transform (`translateY`) with 200ms transition.
- When `uiStore.sqlPanelOpen` is true, the panel occupies ~40% of ChatArea height.
- SQL content fetched from the message referenced by `uiStore.sqlPanelMessageId`.

### Conversation Loading

Implements: [spec.md#conversation-loading](./spec.md#conversation-loading)

- When active conversation changes (via `chatStore.activeConversationId`), ChatArea triggers scroll-to-bottom on MessageList after messages populate.

## Scope

### In Scope
- Layout composition and conditional rendering
- SQL panel visibility coordination

### Out of Scope
- Child component internals (see their respective plans)
- WebSocket connection management (handled by `useWebSocket` hook)
