# Lessons Learned

## General Principles

- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Background task failures must notify clients**: `asyncio.create_task()` swallows exceptions silently. Always send a WS error event in the exception handler so the frontend doesn't wait forever.
- **Schema deduplication saves LLM context**: When multiple datasets share columns (same name+type), reference the first table's column definition instead of repeating it — saves hundreds of tokens per shared column.
- **HEAD pre-check saves bandwidth**: Before downloading large files, a HEAD request checking Content-Length can reject oversized files instantly without wasting bandwidth. Always fall back to per-chunk checking if HEAD fails.
- **Track ALL requestAnimationFrame IDs**: Any RAF callback that calls setState must have its ID stored in a ref so it can be cancelled on component unmount. Orphaned RAFs cause `ReferenceError: window is not defined` in tests and potential memory leaks in production. This applies to scroll handlers, animation loops, and manual scroll-to calls.
- **Stale temp file cleanup prevents disk leaks**: When using atomic rename (write to temp → os.replace), process crashes can leave `.download_` prefixed temp files. Add periodic cleanup based on mtime age.
- **Mock worker_pool via app.state**: For testing dataset profiling endpoints that use `request.app.state.worker_pool`, set the mock directly on `app.state.worker_pool` from `app.main import app` — the httpx ASGITransport shares the same app instance.
- **Dead store code accumulates silently**: Zustand store properties that were replaced by local component state (e.g., `promptPreviewOpen` replaced by local `previewOpen` in ChatInput) persist as dead code. Periodically grep for unused store exports.
