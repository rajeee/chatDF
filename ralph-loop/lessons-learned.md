# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types (numeric/date/categorical) for context-aware prompts instead of generic suggestions.
- **Full-stack features via SQL subqueries**: Adding derived fields (like `last_message_preview`) to list APIs is cheaply done via correlated subqueries rather than JOINs — keeps response model clean and avoids N+1.
- **jsdom lacks URL.createObjectURL**: Must stub `URL.createObjectURL`/`URL.revokeObjectURL` as `vi.fn()` (not `vi.spyOn`) since they don't exist in jsdom.
- **Test files go in `tests/` not `src/__tests__/`**: Vitest config includes `tests/**/*.test.{ts,tsx}`, not `src/__tests__/`. Files in the wrong location are silently ignored.
- **Grouped rendering preserves test IDs**: When refactoring flat lists into grouped rendering, keep all existing `data-testid` attributes on the inner items — existing tests work if the DOM nodes are still present.
