# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it — saves hundreds of tokens per shared column.
- **CodeMirror testing in jsdom**: Mock all `@codemirror/*` modules entirely — CodeMirror requires real DOM measurements that jsdom doesn't support. Use `vi.hoisted()` for shared mock state referenced by `vi.mock()` factories.
- **SSRF prevention needs test bypass**: URL safety checks that reject private IPs will break tests using local HTTP fixture servers (127.0.0.1). Use an env var (`CHATDF_ALLOW_PRIVATE_URLS=1`) set in worker conftest to bypass.
- **Error translator pattern ordering matters**: Patterns are checked top-to-bottom. A message like "function left not found" matches pattern 7 (function...not found regex) before pattern 28 (LEFT/RIGHT). Tests must account for this priority.
