# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types (numeric/date/categorical) for context-aware prompts instead of generic suggestions.
- **Check for pre-existing implementations before picking ideas**: Several "pending" ideas were already implemented. Always verify current state before starting work.
- **Use `useToastStore.getState().error()` for WS error visibility**: WS event handlers run outside React render cycle, so use `.getState()` pattern to fire toasts from Zustand stores.
- **`touch-action-btn` class is the standard pattern for mobile-visible hover buttons**: Already used on CodeBlock copy, ChatHistory pin/delete, DatasetCard remove buttons.
- **Multiple subagents editing the same file works if edits are non-overlapping**: Three agents edited MessageBubble.tsx in parallel (copy feedback, SQL error, retry button) and all changes merged cleanly because they touched different sections.
- **Safe-area insets are CSS-only with graceful degradation**: `@supports (padding: env(safe-area-inset-top))` + `viewport-fit=cover` handles notched phones without affecting non-notched devices.
