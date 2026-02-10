# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Background task failures must notify clients**: `asyncio.create_task()` swallows exceptions silently. Always send a WS error event in the exception handler so the frontend doesn't wait forever.
- **SAVEPOINT for multi-statement deletes**: When deleting multiple rows that must be atomic, wrap in `SAVEPOINT`/`RELEASE`/`ROLLBACK TO` to prevent partial state on failure.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it — saves hundreds of tokens per shared column.
