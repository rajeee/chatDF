# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it — saves hundreds of tokens per shared column.
- **CodeMirror testing in jsdom**: Mock all `@codemirror/*` modules entirely — CodeMirror requires real DOM measurements that jsdom doesn't support. Use `vi.hoisted()` for shared mock state referenced by `vi.mock()` factories.
- **Polars OOM in tests**: Building large SQL expressions (2000-condition OR, 2500-column SELECT) and executing them via `execute_query()` caused Polars to allocate 9.5 GB in-process, triggering the Linux OOM killer on our 11 GB VPS. Keep test SQL to ~100 conditions/columns max. Confirmed via `journalctl | grep oom`.
