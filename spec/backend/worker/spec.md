---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Worker Specification

## Scope

### In Scope
- Worker process architecture
- Dataset URL fetching and validation
- Schema extraction
- SQL query execution
- Resource limits and error handling

### Out of Scope
- LLM integration (see llm/spec.md)
- Dataset validation rules (see dataset_handling/spec.md)
- WebSocket communication (see websocket/spec.md)

### Assumptions
- Pool of 4 worker processes
- Communication via Python `multiprocessing.Queue`
- Polars used for all data operations

## Behavior

### Architecture
- Pool of 4 separate Python worker processes
- Communicates with main process via `multiprocessing.Queue` (request/response pattern)
- Each worker has isolated memory space — worker crashes do not take down the main app
- Requests distributed to available workers via work-stealing (`multiprocessing.Pool` default behavior)
- If all workers busy: requests queued until a worker becomes available
- Maximum queue depth: 10 pending tasks. If exceeded, new requests rejected with 503 "Server busy, try again shortly"

### Responsibilities

#### URL Fetch + Parquet Validation
- Fetch parquet file headers from URL
- Verify parquet magic number (first 4 bytes = `PAR1`)
- HEAD request to check URL accessibility (timeout 10s)

#### Schema Extraction
- Use Polars `scan_parquet` to read schema without loading full data
- Extract: column names, column types, row count
- Return schema as structured data to main process

#### SQL Query Execution
- Receives: SQL string + list of dataset URLs with their assigned table names
- Loads datasets lazily via Polars `scan_parquet` over HTTP
- Registers each dataset as a named table for SQL context
- Executes SQL query via Polars SQL engine
- Collects up to 1,000 rows of results
- Returns: result rows (as list of dicts), column names, total row count

### Resource Limits

| Resource | Limit | Behavior on Exceed |
|----------|-------|--------------------|
| Query timeout | 60 seconds | Worker process killed and restarted |
| Memory | Configurable (default 2GB) | Worker process killed and restarted |
| Result rows | 1,000 rows | Excess rows truncated (not an error) |

### Error Responses
- Structured error returned to main process:
  - `error_type`: "validation", "network", "sql", "timeout", "memory"
  - `message`: Human-readable error description
  - `details`: Technical details (stack trace, SQL error message)
- Worker does not crash on handled errors — only resource limit violations cause restart

### Worker Lifecycle
- Pool of 4 workers started when main application starts
- Each worker monitored by main process — individual workers restarted if they die
- Pool size configurable via `WORKER_POOL_SIZE` environment variable (default: 4)
- Clean shutdown on application stop (drain queues, terminate all workers)
- After crash/restart: no state to recover (stateless workers)
