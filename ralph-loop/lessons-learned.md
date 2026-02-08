# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Schema data is already available — use it**: Parse `schema_json` column types for context-aware prompts instead of generic suggestions.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **Theme transitions need transient class**: Don't add global `transition: all` permanently — use a transient class added/removed around the switch to avoid interfering with existing animations.
- **Use `border-transparent` for layout-stable borders**: Apply border class to ALL items with `border-transparent` for inactive ones to prevent layout shifts.
- **Validation with warnings vs errors**: Return `{ error, warning }` from validate functions. Errors block submit; warnings inform but allow. Different border colors give clear visual feedback.
- **Module-level dict caching is fine for single-process**: Simple `dict[key, (value, expiry)]` with `time.time()` suffices. Invalidate on write operations.
- **Exit animations need delayed removal**: Set CSS class immediately but delay DOM removal with `setTimeout` matching animation duration.
