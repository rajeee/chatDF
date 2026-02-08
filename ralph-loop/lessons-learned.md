# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Schema data is already available — use it**: Parse `schema_json` column types for context-aware prompts instead of generic suggestions.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **Theme transitions need transient class**: Don't add global `transition: all` permanently — use a transient class added/removed around the switch to avoid interfering with existing animations.
- **Use `border-transparent` for layout-stable borders**: When adding conditional border accents, apply the border class to ALL items with `border-transparent` for inactive ones to prevent layout shifts.
- **CSS-only tooltips via group/name**: Tailwind `group/name` variant enables scoped hover tooltips without JS state — use `opacity-0 group-hover/name:opacity-100` with `pointer-events-none` on a positioned child.
- **Validation with warnings vs errors**: Return `{ error, warning }` from validate functions. Errors block submit; warnings inform but allow submit. Different border colors (red/amber/green) give clear visual feedback.
- **Module-level dict caching is fine for single-process**: Simple `dict[key, (value, expiry)]` with `time.time()` suffices. No need for Redis. Invalidate on write operations.
- **Inline styles block Tailwind hover**: Setting `backgroundColor: "transparent"` inline overrides Tailwind's `hover:bg-*` classes. Use `undefined` instead to let CSS take effect.
- **Exit animations need delayed removal**: For smooth exit animations, set a CSS class immediately but delay the actual DOM removal with `setTimeout` matching animation duration.
