# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] **Remove correlation/statistics feature entirely**: The `compute_correlations` function uses `df.pearson_corr()` which no longer exists in the installed Polars version — the feature is broken in production. Delete the correlation feature: remove backend endpoint/worker code, remove frontend CorrelationMatrix component, remove the "Show Correlations" button, remove related tests. Clean deletion, not a fix. DO NOT PRUNE THIS TASK.

- [ ] **Fix ALL 17 failing backend tests**: Run `pytest tests/ -q --ignore=tests/worker/test_timeout.py` and fix every failure. Known issues: (1) 6 tests in `test_chat_service.py` assert old WS event type strings like `"chat_complete"` but code now uses compressed types like `"cc"` — update assertions. (2) `test_messages_table_structure` hardcodes `len(cols) == 8` but table now has 11 columns — update count. (3) 3 tests in `test_correlations.py` — delete these since we're removing the feature. (4) `test_fetch.py::test_invalid_file_not_parquet` — update assertion since CSV is now accepted. (5) Rate limit tests expect 429 from async handlers that return 200 — fix test architecture. After this task, ALL backend tests must pass (except `test_timeout.py`). DO NOT PRUNE THIS TASK.

- [ ] **Write Playwright E2E tests for core user journeys**: Write REAL end-to-end tests that hit the actual backend (NO mocked API routes). Tests must cover: (1) Load the app, paste a dataset URL, verify dataset appears with schema. (2) Type a question, send it, verify LLM response with SQL results in DataGrid. (3) Click Visualize, verify chart renders. (4) Create/rename/delete/pin a conversation. (5) Export results as CSV. Use the dev-login endpoint for auth. These tests should be in `implementation/frontend/tests/e2e/`. DO NOT PRUNE THIS TASK.

- [ ] **Harden LLM system prompt for Polars SQL**: In `llm_service.py`, improve the system prompt: (1) Add explicit Polars SQL dialect notes — no ILIKE (use LIKE with LOWER()), no DATE_TRUNC (use strftime), string functions differ from PostgreSQL, etc. (2) Include 3-5 sample values per column in the schema extraction (modify `extract_schema` in the worker to return sample values). (3) Add 3-4 few-shot examples of good query patterns. (4) Improve `prune_context` to preferentially keep messages containing SQL results over plain text messages. DO NOT PRUNE THIS TASK.

- [ ] **Cache downloaded remote files**: In `data_worker.py`, downloaded CSV/parquet files are re-fetched from the URL on every query. Add a file cache: hash the URL, store downloaded file in a cache directory, reuse on subsequent queries. Add a max cache size (1GB) with LRU eviction. Add a size limit on URL datasets (500MB, matching upload limit). Clean up temp files in a finally block. DO NOT PRUNE THIS TASK.

- [ ] **Translate Polars SQL errors to user-friendly messages**: When the LLM writes SQL that fails, the raw Polars error is shown to the user. Add an error translation layer in `chat_service.py` or `worker` that maps common Polars errors to helpful messages. E.g., "column X not found" → "Column 'X' doesn't exist in this dataset. Available columns: ..." . "ILIKE not supported" → explain to use LIKE with LOWER(). DO NOT PRUNE THIS TASK.

