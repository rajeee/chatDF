# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **CodeMirror testing in jsdom**: Mock all `@codemirror/*` modules entirely — CodeMirror requires real DOM measurements. Use `vi.hoisted()` for shared mock state referenced by `vi.mock()` factories.
- **Column stats boost LLM SQL quality cheaply**: Computing min/max/cardinality during schema extraction adds negligible overhead but gives the LLM critical context that prevents bad WHERE clauses and type mismatches.
- **Defense in depth for file size limits**: Both `fetch_and_validate()` (HEAD Content-Length) and `file_cache.download_and_cache()` (per-chunk accumulation) enforce the 500MB limit. Early check prevents wasted bandwidth; per-chunk check catches servers that lie.
- **Error translator must cover all exit paths**: Raw Polars errors can leak through profile_columns, extract_schema, and profile_column — not just execute_query. Apply translate_polars_error at every error boundary that surfaces to users.
- **Verify before deleting "dead" code**: Always Grep for imports/references before removing functions. `searchDatasets()` appeared unused but was imported in `DatasetSearch.tsx`. Quick Grep saves accidental breakage.
- **Dead exception classes accumulate**: Custom exception classes with registered handlers but no raise sites are noise. Periodically audit `exceptions.py` against actual usage.
