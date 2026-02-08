# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types (numeric/date/categorical) for context-aware prompts instead of generic suggestions.
- **Full-stack features via SQL subqueries**: Adding derived fields (like `last_message_preview`) to list APIs is cheaply done via correlated subqueries rather than JOINs — keeps response model clean and avoids N+1.
- **Test files go in `tests/` not `src/__tests__/`**: Vitest config includes `tests/**/*.test.{ts,tsx}`, not `src/__tests__/`. Files in the wrong location are silently ignored.
- **MSW + jsdom AbortSignal incompatibility**: Tests using MSW handlers to intercept fetch calls fail in jsdom due to AbortSignal type mismatch. Fix: use `queryClient.setQueryData()` to pre-populate TanStack Query cache, bypassing fetch entirely. For mutation testing, use `vi.spyOn(apiModule, "apiPatch")`.
- **Schema migration tests need updating**: When adding columns to SQLite tables, update `test_*_table_structure` tests in `tests/database/test_schema.py` to match new column count and schema.
