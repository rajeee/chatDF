# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types (numeric/date/categorical) for context-aware prompts instead of generic suggestions.
- **Full-stack features via SQL subqueries**: Adding derived fields (like `last_message_preview`) to list APIs is cheaply done via correlated subqueries rather than JOINs.
- **Test files go in `tests/` not `src/__tests__/`**: Vitest config includes `tests/**/*.test.{ts,tsx}`, not `src/__tests__/`. Files in the wrong location are silently ignored.
- **Schema migration tests need updating**: When adding columns to SQLite tables, update `test_*_table_structure` tests to match new column count and schema.
- **Fragment → div for fade-in transitions**: Replace `<>...</>` with `<div className="animate-fade-in">...</div>` to animate state transitions. When React unmounts old and mounts new, the animation triggers automatically — no transition library needed.
- **Theme token hover pattern**: `hover:bg-black/5 dark:hover:bg-white/10` is the best theme-independent hover background — works in both light and dark without explicit color tokens.
