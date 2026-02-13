# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **Column stats boost LLM SQL quality cheaply**: Computing min/max/cardinality during schema extraction adds negligible overhead but gives the LLM critical context that prevents bad WHERE clauses and type mismatches.
- **Removing a tab from RightPanel also orphans its sibling components**: DatasetDiscoveryPanel, DatasetSearch, and DatasetCatalog all lived exclusively in the "discover" tab — removing the feature meant removing 3 components + store + backend router + the entire tab bar (14 files, -5478 lines). The handleLoadFromSearch callback and searchLoading state were also tab-only.
