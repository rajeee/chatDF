# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Fake timers prevent post-teardown errors**: When source code uses `setTimeout` that accesses DOM, test teardown can race with pending timers. Use `vi.useFakeTimers()` in beforeEach and `vi.useRealTimers()` in afterEach.
- **MSW `onUnhandledRequest` custom callback for WebSocket**: Use a callback instead of `"error"` string to selectively bypass WS URLs while keeping strict HTTP enforcement.
- **Background task failures must notify clients**: `asyncio.create_task()` swallows exceptions silently. Always send a WS error event in the exception handler so the frontend doesn't wait forever.
- **SAVEPOINT for multi-statement deletes**: When deleting multiple rows that must be atomic, wrap in `SAVEPOINT`/`RELEASE`/`ROLLBACK TO` to prevent partial state on failure.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), referencing the first table's column definition instead of repeating it can save hundreds of tokens per shared column. Implement as a reference dict from the first dataset, then check subsequent datasets against it.
