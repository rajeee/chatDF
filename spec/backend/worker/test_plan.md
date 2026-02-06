---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Worker Pool Test Plan

## Fixtures (`tests/worker/conftest.py`)

### `worker_pool` — Real multiprocessing pool for integration tests

```python
@pytest.fixture
def worker_pool():
    pool = multiprocessing.Pool(processes=2)
    yield pool
    pool.terminate()
    pool.join()
```

Uses 2 workers (not 4) for faster test execution. Marked with `@pytest.mark.slow` since pool startup takes time.

### `sample_parquet_url` — URL serving a small test parquet file

A local HTTP server serving test fixture parquet files:

```python
@pytest.fixture(scope="session")
def parquet_server():
    """Start a local HTTP server serving test parquet files."""
    server = start_test_file_server("tests/worker/fixtures/")
    yield server.url
    server.stop()
```

Test parquet files committed to `tests/worker/fixtures/`:
- `simple.parquet` — 10 rows, 3 columns (id: Int64, name: Utf8, value: Float64)
- `empty.parquet` — 0 rows, 2 columns
- `wide.parquet` — 5 rows, 100 columns
- `large.parquet` — 2000 rows (for pagination/limit tests)
- `not_parquet.csv` — CSV file with parquet-like name

### `sample_datasets` — Dataset dicts for SQL execution

```python
@pytest.fixture
def sample_datasets(parquet_server):
    return [
        {"url": f"{parquet_server}/simple.parquet", "table_name": "table1"},
        {"url": f"{parquet_server}/large.parquet", "table_name": "table2"},
    ]
```

## Test Implementation by Scenario

### Pool Lifecycle Tests (`test_pool.py`)

Tests: [test.md#POOL-1 through POOL-3](./test.md)

| Scenario | Approach |
|----------|----------|
| POOL-1 | Start pool with `processes=4`. Assert `pool._processes == 4` (or use `pool._pool` length). |
| POOL-2 | Start pool with `processes=2`. Assert 2 workers. |
| POOL-3 | Start pool, submit a simple task, verify result. Call `pool.terminate()` + `pool.join()`. Assert no orphan processes (check `pool._pool` empty after join). |

For POOL-3 edge case (worker executing during shutdown): Submit a long-running task, then terminate. Assert `pool.join()` completes within grace period.

### Fetch & Validation Tests (`test_fetch.py`)

Tests: [test.md#FETCH-1, FETCH-2](./test.md)

These test `data_worker.fetch_and_validate()` directly (called in a worker process):

| Scenario | Approach |
|----------|----------|
| FETCH-1 | Call `fetch_and_validate(parquet_server + "/simple.parquet")`. Assert `{"valid": True}`. Call with `not_parquet.csv`. Assert `{"valid": False, "error": "Not a valid parquet file"}`. |
| FETCH-2 | Call with `parquet_server + "/simple.parquet"` (200 response). Assert valid. Call with nonexistent path (404). Assert error. Call with unreachable host. Assert timeout error. |

For timeout testing, use a server endpoint that delays >10 seconds.

### Schema Extraction Tests (`test_schema.py`)

Tests: [test.md#SCHEMA-1](./test.md)

| Scenario | Approach |
|----------|----------|
| SCHEMA-1 | Call `extract_schema(simple_parquet_url)`. Assert columns list matches expected: `[{"name": "id", "type": "Int64"}, ...]`. Assert `row_count == 10`. |

Edge cases:
- `empty.parquet`: Assert `row_count == 0`, columns still returned.
- `wide.parquet`: Assert all 100 columns returned.

### SQL Execution Tests (`test_sql.py`)

Tests: [test.md#SQL-1 through SQL-5](./test.md)

| Scenario | Approach |
|----------|----------|
| SQL-1 | Call `execute_query("SELECT * FROM table1", sample_datasets)`. Assert table1 registered and queryable. Call cross-table query. |
| SQL-2 | Call `execute_query("SELECT name FROM table1 WHERE id > 5", ...)`. Assert correct rows returned. |
| SQL-3 | Call query against `large.parquet` (2000 rows) with no LIMIT. Assert `rows` has 1000 entries (truncated). Assert `total_rows == 2000`. |
| SQL-4 | Call `execute_query("SELEC * FROM table1", ...)` (syntax error). Assert error returned with `error_type: "sql"`. |
| SQL-5 | Call `execute_query("SELECT nonexistent FROM table1", ...)`. Assert error with `error_type: "sql"` mentioning the missing column. |

### Timeout Tests (`test_timeout.py`)

Tests: [test.md#TIMEOUT-1, TIMEOUT-2](./test.md)

| Scenario | Approach |
|----------|----------|
| TIMEOUT-1 | Submit a deliberately slow query (e.g., cross-join producing huge result). Set timeout to 2 seconds for faster test. Assert `TimeoutError` caught by wrapper. Assert error dict with `error_type: "timeout"`. |
| TIMEOUT-2 | After timeout kill, submit another simple query. Assert it succeeds (pool replaced the dead worker). |

**Fast timeout for tests**: Override `QUERY_TIMEOUT = 2` in test config (instead of 60s production value).

### Memory Tests (`test_memory.py`)

Tests: [test.md#MEM-1, MEM-2](./test.md)

| Scenario | Approach |
|----------|----------|
| MEM-1 | Set `WORKER_MEMORY_LIMIT` to a very low value (e.g., 10 MB). Submit a query that allocates significant memory. Assert worker killed and error returned with `error_type: "memory"`. |
| MEM-2 | After memory kill, submit a simple query. Assert success (worker replaced). |

**Note**: Memory tests may be flaky across platforms. Mark with `@pytest.mark.slow` and consider making them optional in CI.

### Error Response Tests (`test_errors.py`)

Tests: [test.md#ERR-1, ERR-2](./test.md)

| Scenario | Approach |
|----------|----------|
| ERR-1 | Trigger each error type (validation, network, sql, timeout, memory). Assert each returns dict with `error_type`, `message`, and `details` fields. Parameterized test. |
| ERR-2 | Submit a query with SQL error. Assert error returned. Submit a second valid query. Assert success (worker still alive). |

### Crash Recovery Tests (`test_crash.py`)

Tests: [test.md#CRASH-1, CRASH-2](./test.md)

| Scenario | Approach |
|----------|----------|
| CRASH-1 | Create a worker function that calls `os._exit(1)` (simulates segfault). Submit it. Assert error returned to caller. Submit a normal task. Assert success (pool replaced worker). |
| CRASH-2 | After crash in CRASH-1, assert no state carryover. The new worker handles the next request cleanly. |

### Queue Tests (`test_queue.py`)

Tests: [test.md#QUEUE-1](./test.md)

| Scenario | Approach |
|----------|----------|
| QUEUE-1 | Use pool with 2 workers. Submit 4 slow tasks concurrently. Assert first 2 start immediately, last 2 queued. When first tasks complete, queued tasks execute. Assert all 4 eventually complete. Verify FIFO ordering by tracking completion order. |

```python
async def test_QUEUE_1_all_workers_busy(worker_pool):
    import asyncio
    results = []
    tasks = [
        run_query_async(worker_pool, slow_query, sample_datasets)
        for _ in range(4)
    ]
    completed = await asyncio.gather(*tasks)
    assert len(completed) == 4
    assert all(r.get("error_type") is None for r in completed)
```

## Test Parquet Fixtures

Committed to `tests/worker/fixtures/` and generated by a setup script:

```python
# tests/worker/fixtures/generate.py
import polars as pl

pl.DataFrame({"id": range(10), "name": [f"item_{i}" for i in range(10)], "value": [i * 1.5 for i in range(10)]}).write_parquet("simple.parquet")
pl.DataFrame({"a": [], "b": []}).write_parquet("empty.parquet")
pl.DataFrame({f"col_{i}": range(5) for i in range(100)}).write_parquet("wide.parquet")
pl.DataFrame({"id": range(2000), "val": range(2000)}).write_parquet("large.parquet")
```

## Scope

### In Scope
- All worker pool test scenarios from worker/test.md
- Real multiprocessing pool tests (not mocked)
- Real Polars operations against test parquet files
- Resource limit enforcement (timeout, memory)
- Crash recovery verification

### Out of Scope
- LLM orchestration of worker calls (see llm/test_plan.md)
- Dataset service validation pipeline (see dataset_handling/test_plan.md)
