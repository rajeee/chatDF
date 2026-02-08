# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types for context-aware prompts instead of generic suggestions.
- **Check for pre-existing implementations before picking ideas**: Always verify current state before starting work.
- **Use `useToastStore.getState().error()` for WS error visibility**: WS event handlers run outside React render cycle — use `.getState()` for Zustand access.
- **Scroll-based virtualization needs cumulative height array + binary search**: For mixed-height items, pre-compute cumulative heights in `useMemo` and binary search for the first visible item.
- **Swipe gesture hooks need a `locked` ref**: Prevent new gestures while dismiss animation plays.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT conversation_id, COUNT(*) AS cnt ... GROUP BY conversation_id)` instead of `(SELECT COUNT(*) ... WHERE id = c.id)` per row. Significant perf win with many conversations.
- **Theme transitions need transient class**: Don't add global `transition: all` permanently — use a transient `.theme-transitioning` class added/removed around the switch. Avoids interfering with existing animations.
