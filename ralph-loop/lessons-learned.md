# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **CodeMirror testing in jsdom**: Mock all `@codemirror/*` modules entirely — CodeMirror requires real DOM measurements. Use `vi.hoisted()` for shared mock state referenced by `vi.mock()` factories.
- **Column stats boost LLM SQL quality cheaply**: Computing min/max/cardinality in a single Polars aggregation pass during schema extraction adds negligible overhead but gives the LLM critical context (data ranges, cardinality) that prevents bad WHERE clauses and type mismatches.
- **Defense in depth for file size limits**: Both `fetch_and_validate()` (early reject via HEAD Content-Length) and `file_cache.download_and_cache()` (per-chunk accumulation) enforce the 500MB limit. The early check prevents wasted bandwidth; the per-chunk check catches servers that lie about Content-Length.
- **Always use context managers for urlopen**: `urllib.request.urlopen()` returns a response object that holds a socket. Without `with`, the socket leaks. When mocking, add `__enter__`/`__exit__` to the mock.
- **Fire-and-forget tasks need done callbacks**: `asyncio.create_task()` swallows exceptions silently. Always add `task.add_done_callback()` to log uncaught exceptions, even when the coroutine has internal try/except.
- **Error translator should cover all error exit paths**: Raw Polars errors can leak through profile_columns, extract_schema, and profile_column — not just execute_query. Apply translate_polars_error at every error boundary that surfaces to users.
