# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **CodeMirror testing in jsdom**: Mock all `@codemirror/*` modules entirely — CodeMirror requires real DOM measurements. Use `vi.hoisted()` for shared mock state referenced by `vi.mock()` factories.
- **Column stats boost LLM SQL quality cheaply**: Computing min/max/cardinality in a single Polars aggregation pass during schema extraction adds negligible overhead but gives the LLM critical context (data ranges, cardinality) that prevents bad WHERE clauses and type mismatches.
- **Defense in depth for file size limits**: Both `fetch_and_validate()` (early reject via HEAD Content-Length) and `file_cache.download_and_cache()` (per-chunk accumulation) enforce the 500MB limit. The early check prevents wasted bandwidth; the per-chunk check catches servers that lie about Content-Length.
- **Piped bash commands with `tail` buffer forever**: When running `cmd | tail -N` in background, `tail` buffers until `cmd` completes. Write output to a file instead (`cmd > /tmp/out.txt 2>&1`) and read it separately.
