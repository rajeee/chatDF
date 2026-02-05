---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Worker Pool Plan

## Module Structure

### `backend/app/services/worker_pool.py`

Manages the `multiprocessing.Pool` lifecycle and exposes async wrappers for worker tasks.

### `backend/app/workers/data_worker.py`

Pure functions executed in worker processes. No imports from `app/` -- fully self-contained.

## Pool Initialization

Implements: [spec.md#architecture](./spec.md#architecture)

- Pool created in FastAPI lifespan (`main.py`) via `multiprocessing.Pool(processes=config.WORKER_POOL_SIZE)`.
- Pool reference stored on `app.state.worker_pool`.
- `WORKER_POOL_SIZE` read from `config.py` (default: 4).

## Worker Functions

Implements: [spec.md#responsibilities](./spec.md#responsibilities)

All functions in `data_worker.py` are module-level (picklable). Each receives and returns plain dicts/lists -- no Pydantic models cross the process boundary.

| Function | Signature | Returns |
|----------|-----------|---------|
| `fetch_and_validate` | `(url: str) -> dict` | `{"valid": bool, "error": str \| None}` |
| `extract_schema` | `(url: str) -> dict` | `{"columns": list[dict], "row_count": int}` |
| `execute_query` | `(sql: str, datasets: list[dict]) -> dict` | `{"rows": list[dict], "columns": list[str], "total_rows": int}` |

`datasets` is a list of `{"url": str, "table_name": str}` dicts.

## Async Wrappers in `worker_pool.py`

Each wrapper calls `pool.apply_async()` and awaits the result in an async-friendly way using `asyncio.get_event_loop().run_in_executor(None, result.get, timeout)`.

| Function | Signature |
|----------|-----------|
| `async validate_url(pool, url) -> dict` | Calls `fetch_and_validate` |
| `async get_schema(pool, url) -> dict` | Calls `extract_schema` |
| `async run_query(pool, sql, datasets) -> dict` | Calls `execute_query` |

Each wrapper catches `multiprocessing.TimeoutError` and `Exception`, returning a structured error dict.

## Request/Response Serialization

Implements: [spec.md#architecture](./spec.md#architecture)

- All arguments and return values are JSON-serializable primitives (dicts, lists, strings, ints).
- No shared memory, no file handles, no database connections cross the process boundary.
- Polars DataFrames converted to `list[dict]` via `.to_dicts()` before returning.

## Resource Limits

Implements: [spec.md#resource-limits](./spec.md#resource-limits)

| Limit | Mechanism |
|-------|-----------|
| Query timeout (60s) | `apply_async(...).get(timeout=60)` -- raises `TimeoutError` |
| Memory (2GB default) | Worker checks `resource.getrusage()` after each query; exceeding triggers `sys.exit(1)` |
| Result rows (1000) | `execute_query` applies `.head(1000)` before converting to dicts |

## Worker Crash Recovery

Implements: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

- `multiprocessing.Pool` automatically replaces a crashed worker process (default behavior).
- The `maxtasksperchild` parameter is set to `50` to periodically recycle workers and prevent memory leaks.
- On `TimeoutError`, the wrapper returns an error dict with `error_type: "timeout"` -- the pool handles worker replacement.

## Error Response Format

Implements: [spec.md#error-responses](./spec.md#error-responses)

All worker functions catch exceptions and return:

```
{"error_type": str, "message": str, "details": str | None}
```

`error_type` is one of: `"validation"`, `"network"`, `"sql"`, `"timeout"`, `"memory"`.

If a function raises an uncaught exception, the async wrapper in `worker_pool.py` catches it and constructs the same error dict with `error_type: "internal"`.

## Clean Shutdown

Implements: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

In FastAPI lifespan shutdown:
1. Call `pool.terminate()` to stop all workers immediately.
2. Call `pool.join()` to wait for process cleanup.

## Scope

### In Scope
- Pool lifecycle management
- Three worker functions and their async wrappers
- Serialization boundary between main process and workers
- Resource limit enforcement

### Out of Scope
- LLM orchestration calling these wrappers (see llm/plan.md)
- Dataset validation logic (see dataset_handling/plan.md -- uses these wrappers)

### Assumptions
- `resource.getrusage` is available on the deployment platform (Linux/macOS).
- Polars `scan_parquet` supports HTTP URLs natively.
