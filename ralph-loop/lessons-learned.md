# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Schema data is already available — use it**: Parse `schema_json` column types for context-aware prompts instead of generic suggestions.
- **Scroll-based virtualization needs cumulative height array + binary search**: For mixed-height items, pre-compute cumulative heights in `useMemo` and binary search for the first visible item.
- **Swipe gesture hooks need a `locked` ref**: Prevent new gestures while dismiss animation plays.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **Theme transitions need transient class**: Don't add global `transition: all` permanently — use a transient class added/removed around the switch to avoid interfering with existing animations.
