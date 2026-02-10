# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Fake timers prevent post-teardown errors**: When source code uses `setTimeout` that accesses DOM, test teardown can race with pending timers. Use `vi.useFakeTimers()` in beforeEach and `vi.useRealTimers()` in afterEach to eliminate the race entirely.
- **E2E tests should use API calls, not fragile UI selectors**: Tests that rely on right-click context menus or conditional visibility checks silently pass without asserting anything. API-driven tests with unconditional assertions are far more reliable.
- **Error translators should never return raw errors**: Always have a generic fallback message for unrecognized errors. Raw engine errors confuse users and leak implementation details.
