---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Left Panel Plan

## Component Structure

Implements: [spec.md#layout](./spec.md#layout)

File: `frontend/src/components/left-panel/LeftPanel.tsx`

```
<LeftPanel>                         # reads uiStore.leftPanelOpen
  <NewChatButton />                 # inline — calls createConversation mutation
  <ChatHistory />                   # child component
  <div className="flex-1" />        # spacer pushes bottom sections down
  <Settings />                      # child component
  <UsageStats />                    # child component
  <Account />                       # child component
</LeftPanel>
```

Props: none. All state from stores/hooks.

## Collapse/Expand Mechanism

Implements: [spec.md#collapse-expand](./spec.md#collapse-expand)

- `uiStore` exposes `leftPanelOpen: boolean` and `toggleLeftPanel()`.
- `LeftPanel` renders conditionally based on `leftPanelOpen`.
- The hamburger toggle lives in `Header` (parent `AppShell`), not in `LeftPanel` itself.
- Desktop: panel is a grid column. Collapse sets `--left-w` CSS variable to `0px` via inline style on the grid container. Tailwind `transition-[grid-template-columns]` with `duration-200` handles the animation.
- Below 1024px: panel renders as `fixed inset-y-0 left-0 z-40` overlay with a semi-transparent backdrop `<div>`. Clicking backdrop calls `toggleLeftPanel()`.

## Panel Width

- Expanded: `w-[260px]` (Tailwind arbitrary value).
- Collapsed: width transitions to 0; `overflow-hidden` prevents content flash.

## Persistence

Implements: [spec.md (assumptions)](./spec.md#assumptions)

- `uiStore` subscribes to `leftPanelOpen` changes and writes to `localStorage("leftPanelOpen")`.
- On store initialization, reads `localStorage("leftPanelOpen")`. If absent, defaults based on viewport width (open if >= 1024px).

## New Chat Button

Implements: [spec.md#new-chat-button](./spec.md#new-chat-button)

- Rendered at the top of `LeftPanel`, above `ChatHistory`.
- Calls TanStack `useMutation` for `POST /conversations` (creates a new conversation).
- On success: sets `chatStore.activeConversationId` to the new ID, clears `chatStore.messages`, invalidates `["conversations"]` query.

## Section Layout

- Sections stacked via `flex flex-col h-full`.
- `ChatHistory` gets `flex-1 overflow-y-auto` to fill available space and scroll independently.
- `Settings`, `UsageStats`, `Account` are fixed-height at the bottom.
- Subtle `border-t` separators between bottom sections.

## Scope

### In Scope
- Panel container, collapse/expand, layout, new chat button

### Out of Scope
- Child component internals (see child plans)
- Header/hamburger toggle (part of AppShell)
