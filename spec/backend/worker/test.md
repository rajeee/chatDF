---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Worker Pool Test Specification

Tests: [worker/spec.md](./spec.md)

## Scope

### In Scope
- Worker pool startup and shutdown
- URL fetch and parquet validation
- Schema extraction
- SQL query execution
- Resource limits (timeout, memory)
- Worker crash recovery
- Error response structure
- Queue behavior when all workers busy

### Out of Scope
- LLM tool calling logic (see llm/test.md)
- Dataset validation pipeline orchestration (see dataset_handling/test.md)
- WebSocket communication (see websocket/test.md)

---

## Test Scenarios

### POOL-1: Pool Starts on App Startup
Tests: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

- Scenario: Application starts with WORKER_POOL_SIZE=4
- Expected: 4 worker processes launched and ready to accept tasks

### POOL-2: Pool Size Configurable
Tests: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

- Scenario: WORKER_POOL_SIZE environment variable set to 2
- Expected: 2 worker processes launched

### POOL-3: Clean Shutdown on App Stop
Tests: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

- Scenario: Application receives shutdown signal
- Expected: Worker queues drained, all worker processes terminated gracefully
- Edge cases:
  - Worker executing a query during shutdown: query finishes (up to timeout), then worker terminates

---

### FETCH-1: Parquet Magic Number Validation
Tests: [spec.md#url-fetch--parquet-validation](./spec.md#url-fetch--parquet-validation)

- Scenario: Worker fetches first 4 bytes of a URL
- Expected: If bytes equal "PAR1", validation passes
- Edge cases:
  - First 4 bytes are not "PAR1": validation fails with "Not a valid parquet file"
  - URL returns less than 4 bytes: validation fails
  - Empty response body: validation fails

### FETCH-2: HEAD Request Accessibility Check
Tests: [spec.md#url-fetch--parquet-validation](./spec.md#url-fetch--parquet-validation)

- Scenario: Worker sends HEAD request to dataset URL
- Expected: If URL responds within 10 seconds with 200, URL is accessible
- Edge cases:
  - URL returns 404: fails with "Could not access URL"
  - URL returns 403: fails with "Could not access URL"
  - URL does not respond within 10 seconds: fails with timeout error
  - URL host does not resolve: fails with network error

---

### SCHEMA-1: Schema Extraction via scan_parquet
Tests: [spec.md#schema-extraction](./spec.md#schema-extraction)

- Scenario: Worker receives a valid parquet URL
- Expected: Polars scan_parquet reads schema without loading full data, returns column names, column types, and row count
- Edge cases:
  - Parquet file has 0 rows: schema extracted, row_count = 0
  - Parquet file has many columns (100+): all columns returned
  - Parquet file has nested types: types represented as strings

---

### SQL-1: Dataset Registration as Named Tables
Tests: [spec.md#sql-query-execution](./spec.md#sql-query-execution)

- Scenario: Worker receives SQL query with 2 datasets and their assigned table names
- Expected: Each dataset registered as a named table in Polars SQL context, query can reference both by name

### SQL-2: SQL Query Execution
Tests: [spec.md#sql-query-execution](./spec.md#sql-query-execution)

- Scenario: Worker receives a valid SQL query against registered datasets
- Expected: Query executed via Polars SQL engine, returns result rows as list of dicts, column names, and total row count

### SQL-3: Result Row Limit (1000 Rows)
Tests: [spec.md#sql-query-execution](./spec.md#sql-query-execution)

- Scenario: Query result has more than 1000 rows
- Expected: First 1000 rows returned, excess truncated (not an error), total row count reflects actual count

### SQL-4: SQL Syntax Error
Tests: [spec.md#error-responses](./spec.md#error-responses)

- Scenario: Invalid SQL submitted to worker
- Expected: Structured error returned with error_type="sql", message describing the syntax error

### SQL-5: Missing Column Reference
Tests: [spec.md#error-responses](./spec.md#error-responses)

- Scenario: SQL references a column not present in the dataset
- Expected: Structured error returned with error_type="sql", message identifying the missing column

---

### TIMEOUT-1: Query Timeout at 60 Seconds
Tests: [spec.md#resource-limits](./spec.md#resource-limits)

- Scenario: SQL query takes longer than 60 seconds
- Expected: Worker process killed, new worker process spawned to replace it, timeout error returned to main process with error_type="timeout"

### TIMEOUT-2: Worker Restarted After Timeout Kill
Tests: [spec.md#resource-limits](./spec.md#resource-limits)

- Scenario: Worker killed due to timeout
- Expected: Pool detects dead worker, spawns replacement, pool returns to full capacity

---

### MEM-1: Memory Limit Exceeded
Tests: [spec.md#resource-limits](./spec.md#resource-limits)

- Scenario: Worker memory usage exceeds configured WORKER_MEMORY_LIMIT
- Expected: Worker process killed, replacement spawned, memory error returned with error_type="memory"

### MEM-2: Worker Restarted After Memory Kill
Tests: [spec.md#resource-limits](./spec.md#resource-limits)

- Scenario: Worker killed due to memory limit
- Expected: Replacement worker spawned, pool returns to full capacity

---

### ERR-1: Structured Error Responses
Tests: [spec.md#error-responses](./spec.md#error-responses)

- Scenario: Any error occurs in the worker (validation, network, sql, timeout, memory)
- Expected: Error returned as structured object with `error_type`, `message`, and `details` fields
- Edge cases:
  - Validation error: error_type="validation"
  - Network error (URL unreachable): error_type="network"
  - SQL error: error_type="sql"
  - Timeout: error_type="timeout"
  - Memory: error_type="memory"

### ERR-2: Handled Errors Do Not Crash Worker
Tests: [spec.md#error-responses](./spec.md#error-responses)

- Scenario: SQL query fails with a syntax error
- Expected: Worker returns error to main process, worker remains alive and ready for next task

---

### CRASH-1: Worker Crash Auto-Restart
Tests: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

- Scenario: Worker process dies unexpectedly (segfault, unhandled exception)
- Expected: Main process detects dead worker, spawns replacement, no state to recover (stateless workers)

### CRASH-2: No State Recovery Needed
Tests: [spec.md#worker-lifecycle](./spec.md#worker-lifecycle)

- Scenario: Worker crashes mid-query
- Expected: Error returned for the in-flight request, new worker starts fresh with no leftover state

---

### QUEUE-1: All Workers Busy
Tests: [spec.md#architecture](./spec.md#architecture)

- Scenario: All 4 workers are executing queries, a new request arrives
- Expected: New request queued until a worker becomes available, then processed
- Edge cases:
  - Multiple queued requests: processed in order (FIFO)
