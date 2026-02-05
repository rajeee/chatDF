---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Chat History Plan

## Component Structure

Implements: [spec.md#conversation-list](./spec.md#conversation-list)

File: `frontend/src/components/left-panel/ChatHistory.tsx`

```
<ChatHistory>
  <ul>                                  # scrollable list container
    {conversations.map(c =>
      <ConversationItem                 # inline or extracted sub-component
        key={c.id}
        conversation={c}
        isActive={c.id === activeId}
        onSelect={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    )}
  </ul>
  {isEmpty && <EmptyState />}           # "No conversations yet" text
</ChatHistory>
```

## Data Fetching

Implements: [spec.md#persistence](./spec.md#persistence)

- TanStack Query: `useQuery({ queryKey: ["conversations"], queryFn: fetchConversations })`.
- Returns `Conversation[]` sorted by `updated_at` descending (server provides sort order).
- Stale time: 30 seconds. Refetched on window focus and after mutations.

## Conversation Selection

Implements: [spec.md#conversation-list](./spec.md#conversation-list)

- Click sets `chatStore.activeConversationId` via Zustand action.
- `chatStore` action also fetches messages for the selected conversation (separate query or store action that calls the API).
- Active item styled with `bg-accent/10` (theme-aware highlight).

## Inline Rename

Implements: [spec.md#title-generation](./spec.md#title-generation)

- Double-click on title text switches `<span>` to `<input>` (local component state: `editingId`).
- `onBlur` or Enter key triggers `renameMutation` (`PATCH /conversations/:id { title }`).
- Escape cancels edit, reverts to original title.
- Invalidates `["conversations"]` query on success.

## Deletion

Implements: [spec.md#deletion](./spec.md#deletion)

- Hover reveals a small `X` button (positioned `absolute right-2`, visible on `group-hover`).
- Click on `X` opens a confirmation using a lightweight inline confirm (not a full modal): text "Delete?" with "Yes" / "No" buttons replacing the X momentarily.
- `deleteMutation` calls `DELETE /conversations/:id`. On success, invalidates `["conversations"]`.
- If deleted conversation was active: `chatStore.activeConversationId` set to `null`, which triggers the onboarding empty state in `ChatArea`.

## Empty State

Implements: [spec.md#empty-state](./spec.md#empty-state)

- Rendered when `conversations` array is empty.
- Muted text: "No conversations yet", centered vertically in the list area.

## Overflow

Implements: [spec.md#overflow](./spec.md#overflow)

- List container: `overflow-y-auto` with Tailwind. No virtualization in V1 (conversation count expected to be manageable).

## Scope

### In Scope
- Conversation list rendering, selection, rename, delete
- TanStack Query integration for conversation data

### Out of Scope
- New Chat button (lives in parent LeftPanel)
- Message loading on selection (handled by chatStore action)
