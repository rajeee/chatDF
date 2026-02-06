---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Settings Plan

## Component Structure

Implements: [spec.md#layout](./spec.md#layout)

File: `frontend/src/components/left-panel/Settings.tsx`

```
<Settings>
  <ThemeToggle />                     # three-way toggle row
  <ClearHistoryButton />              # button + confirmation dialog
  <AboutLink />                       # opens AboutModal
  <HelpLink />                        # opens HelpModal
</Settings>
```

All sub-elements are inline within `Settings.tsx` (no separate files needed given their simplicity).

## Theme Toggle

Implements: [spec.md#theme-toggle](./spec.md#theme-toggle)

- Uses standalone `useTheme` hook (from `hooks/useTheme.ts`) which manages its own state via `localStorage("theme-mode")` — not wired through `uiStore`. See [theme/plan.md](../../theme/plan.md#usetheme-hook) for hook details.
- Rendered as a segmented control (three adjacent buttons) with the active option visually highlighted.
- On change: `useTheme.setMode(mode)` updates localStorage, resolves effective theme, and toggles `dark` class on `<html>`.

## Clear All Conversations

Implements: [spec.md#clear-all-conversations](./spec.md#clear-all-conversations)

- Button text: "Clear all conversations".
- Click opens a confirmation dialog (React portal-based modal overlay).
- Dialog content: warning text from spec, "Cancel" and "Delete All" (red) buttons.
- "Delete All" triggers `clearAllMutation` (`DELETE /conversations`).
- On success: invalidates `["conversations"]` query, sets `chatStore.activeConversationId` to `null`.

## About Modal

Implements: [spec.md#about-chatdf](./spec.md#about-chatdf)

- Local state `showAbout: boolean` controls visibility.
- Modal component: fixed overlay with centered card. Closes on X button, Escape key, or backdrop click.
- Static content: app name, version (from `import.meta.env.VITE_APP_VERSION` or hardcoded), description.

## Help Modal

Implements: [spec.md#help](./spec.md#help)

- Same modal pattern as About. Local state `showHelp: boolean`.
- Content: keyboard shortcuts table and tips list, all static text rendered inline.

## Scope

### In Scope
- Theme toggle UI and hook integration
- Clear history button with confirmation
- About and Help modals

### Out of Scope
- Theme CSS variable definitions (in globals.css, covered by frontend plan)
- Actual conversation deletion API (backend concern)
