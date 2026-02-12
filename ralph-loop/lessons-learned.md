# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it.
- **CodeMirror testing in jsdom**: Mock all `@codemirror/*` modules entirely — CodeMirror requires real DOM measurements. Use `vi.hoisted()` for shared mock state referenced by `vi.mock()` factories.
- **Playwright globalSetup/globalTeardown must be declared in config**: Having the files exist isn't enough — they must be referenced via `globalSetup` and `globalTeardown` keys in `playwright.config.ts`.
