# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **Column stats boost LLM SQL quality cheaply**: Computing min/max/cardinality during schema extraction adds negligible overhead but gives the LLM critical context that prevents bad WHERE clauses and type mismatches.
- **Orphaned components accumulate silently**: QueryResultComparisonModal was never imported anywhere — 591 lines of dead code with 2 test files. Always grep for imports before assuming a component is used.
