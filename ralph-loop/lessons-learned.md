# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it — saves hundreds of tokens per shared column.
- **Mock worker_pool via app.state**: For testing endpoints that use `request.app.state.worker_pool`, set the mock directly on `app.state.worker_pool` — the httpx ASGITransport shares the same app instance.
- **Private Python functions are directly importable for testing**: `from app.workers.data_worker import _has_limit` works fine. Don't skip testing helpers just because they're underscore-prefixed — SQL parsing edge cases in `_has_limit` and `_is_select` are critical for query safety.
- **Frontend utility test coverage pays off**: Many utilities (chartDetection, dateGroups, relativeTime, syntaxHighlight) already had good tests from prior iterations. Focus new test effort on truly untested utils like highlightText and tableUtils.
