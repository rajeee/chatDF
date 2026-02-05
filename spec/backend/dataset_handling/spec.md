---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Dataset Handling Specification

## Scope

### In Scope
- URL validation pipeline
- Schema extraction and caching
- Auto-naming convention
- Duplicate detection
- Dataset limits
- Refresh behavior

### Out of Scope
- Worker process details (see worker/spec.md)
- Frontend dataset UI (see frontend/right_panel/spec.md)
- SQL query execution (see worker/spec.md)

### Assumptions
- Only publicly accessible HTTP/HTTPS URLs supported
- No data caching — always lazy-load from URL at query time
- Polars handles all parquet operations

## Behavior

### URL Validation Pipeline
Sequential steps — fail fast on any step:

| Step | Action | Timeout | Failure |
|------|--------|---------|---------|
| 1 | Format check: valid URL, http/https only | Instant | "Invalid URL format" |
| 2 | HEAD request to check accessibility | 10 seconds | "Could not access URL" |
| 3 | Fetch first 4 bytes, verify parquet magic number (`PAR1`) | 10 seconds | "Not a valid parquet file" |
| 4 | `scan_parquet` to extract schema | 30 seconds | "Could not read parquet schema" |
| 5 | Cache schema in `datasets` table | Instant | Internal error |

### Auto-Naming
- Datasets are assigned sequential default names: `table1`, `table2`, `table3`, ...
- Names assigned in the order datasets are added to a conversation
- Users can rename via the schema modal (see frontend/right_panel/schema_modal/spec.md)
- Renamed table names used in all subsequent SQL queries
- Names must be valid SQL identifiers (alphanumeric + underscores, no spaces)

### Duplicate Detection
- Same URL in same conversation → rejected with "This dataset is already loaded"
- Comparison is exact string match (no URL normalization)
- Same URL in different conversations → allowed (independent contexts)

### Dataset Limits
- Maximum 5 datasets per conversation
- Enforced on `add_dataset` request
- Attempting to add a 6th: rejected with "Maximum 5 datasets reached"
- Removing a dataset frees a slot for a new one

### Schema Caching
- Schema (columns, types, row count) cached in `datasets` table in SQLite
- Cached at load time — not refreshed automatically
- User can manually refresh via schema modal ("Refresh Schema" button)
- Refresh re-runs the full validation pipeline (steps 2-5)

### Dataset Removal
- Dataset removed from `datasets` table
- LLM system prompt updated to exclude removed dataset's schema
- If removal happens mid-conversation: next LLM turn will not include the dataset
- No data to clean up (no cached data, only schema metadata)

### Failure During Query
- If URL becomes inaccessible during a query execution:
  - Worker returns error to main process
  - Error sent to LLM as tool response
  - LLM informs the user: "The dataset at [URL] is no longer accessible"
- Dataset card remains in error state until user retries or removes

### Supported Sources
- HTTP and HTTPS URLs only
- No native S3, GCS, or Azure Blob support (URL must be publicly accessible via HTTP)
- No file upload (V1)
- No authentication for remote URLs (public access only)

### Auto-Loading from Chat Messages
- When the LLM detects a parquet URL in a user's message, it can call the `load_dataset` tool
- This triggers the same validation pipeline as manual dataset addition
- Auto-loaded datasets appear in the right panel like manually added ones
- Same limits apply (max 5 per conversation, duplicate detection)
- If auto-load fails: LLM informs user of the error and suggests adding manually via the right panel
