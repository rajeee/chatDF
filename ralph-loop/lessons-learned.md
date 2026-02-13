# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **Column stats boost LLM SQL quality cheaply**: Computing min/max/cardinality during schema extraction adds negligible overhead but gives the LLM critical context that prevents bad WHERE clauses and type mismatches.
- **Removing a tab orphans its sibling components**: Deleting one tab can cascade to 3+ components, stores, backend routers, and callbacks that lived exclusively in that tab. Grep thoroughly after removal.
- **Dead components accumulate store state**: SchemaDiffModal was never rendered but had state+actions in uiStore and utility functions in schemaUtils. Always check stores for dead state when removing components.
- **Shared utility files may have dead exports**: schemaUtils.ts had `computeSchemaDiff`/`DiffRow`/`DiffStatus` only used by the deleted component. Grep each export individually before keeping shared files intact.
