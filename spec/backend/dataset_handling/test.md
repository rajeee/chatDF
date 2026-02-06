---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Dataset Handling Test Specification

Tests: [dataset_handling/spec.md](./spec.md)

## Scope

### In Scope
- URL validation pipeline (all 5 steps)
- Fail-fast behavior with specific error messages
- Auto-naming convention
- Duplicate detection
- Dataset limits (max 5 per conversation)
- Schema caching and refresh
- Dataset removal and LLM context update
- Auto-loading from chat messages
- Supported URL schemes

### Out of Scope
- Worker process internals (see worker/test.md)
- LLM tool calling mechanics (see llm/test.md)
- Frontend dataset UI (see frontend/right_panel/test.md)

---

## Test Scenarios

### VALIDATE-1: Step 1 - URL Format Check
Tests: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

- Scenario: URL submitted for validation
- Expected: Valid http/https URL passes, invalid format fails immediately
- Edge cases:
  - HTTP URL: accepted
  - HTTPS URL: accepted
  - FTP URL: rejected with "Invalid URL format"
  - S3 URL (s3://...): rejected with "Invalid URL format"
  - Empty string: rejected with "Invalid URL format"
  - Missing scheme: rejected with "Invalid URL format"
  - URL with spaces: rejected with "Invalid URL format"

### VALIDATE-2: Step 2 - HEAD Request Accessibility
Tests: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

- Scenario: Valid URL format, HEAD request sent
- Expected: URL responds with 200 within 10 seconds
- Edge cases:
  - URL returns 404: fails with "Could not access URL"
  - URL returns 403: fails with "Could not access URL"
  - URL times out (>10 seconds): fails with "Could not access URL"
  - DNS resolution fails: fails with "Could not access URL"
  - Step 1 failed: step 2 never runs (fail fast)

### VALIDATE-3: Step 3 - Parquet Magic Number
Tests: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

- Scenario: URL accessible, first 4 bytes fetched
- Expected: Bytes equal "PAR1" (0x50 0x41 0x52 0x31)
- Edge cases:
  - File is CSV: fails with "Not a valid parquet file"
  - File is JSON: fails with "Not a valid parquet file"
  - File is empty: fails with "Not a valid parquet file"
  - Step 2 failed: step 3 never runs (fail fast)

### VALIDATE-4: Step 4 - scan_parquet Schema Extraction
Tests: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

- Scenario: Valid parquet file, schema extraction attempted
- Expected: Column names, column types, row count extracted within 30 seconds
- Edge cases:
  - Corrupted parquet (valid header but bad data): fails with "Could not read parquet schema"
  - Extraction exceeds 30 seconds: fails with timeout
  - Step 3 failed: step 4 never runs (fail fast)

### VALIDATE-5: Step 5 - Cache Schema in SQLite
Tests: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

- Scenario: Schema successfully extracted
- Expected: Schema (columns, types, row_count, column_count) stored in datasets table
- Edge cases:
  - Database write failure: internal error returned
  - Step 4 failed: step 5 never runs (fail fast)

### VALIDATE-6: Each Step Fails Fast
Tests: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

- Scenario: Step N fails during validation
- Expected: Steps N+1 through 5 are not executed, specific error message from step N returned to caller

---

### NAME-1: Auto-Naming Sequential
Tests: [spec.md#auto-naming](./spec.md#auto-naming)

- Scenario: First three datasets added to a conversation
- Expected: Named table1, table2, table3 in order of addition

### NAME-2: Auto-Naming After Removal
Tests: [spec.md#auto-naming](./spec.md#auto-naming)

- Scenario: Datasets table1, table2, table3 exist; table2 removed; new dataset added
- Expected: New dataset named table4 (sequential counter continues, does not reuse table2)

### NAME-3: Name Must Be Valid SQL Identifier
Tests: [spec.md#auto-naming](./spec.md#auto-naming)

- Scenario: Auto-generated names
- Expected: Names are alphanumeric + underscores, no spaces, valid for use in SQL queries

---

### DUP-1: Duplicate URL in Same Conversation Rejected
Tests: [spec.md#duplicate-detection](./spec.md#duplicate-detection)

- Scenario: Same URL added to the same conversation twice
- Expected: Second attempt rejected with "This dataset is already loaded"

### DUP-2: Exact String Match Comparison
Tests: [spec.md#duplicate-detection](./spec.md#duplicate-detection)

- Scenario: URLs differ only by trailing slash or query parameter
- Expected: Treated as different URLs (no normalization), both allowed
- Edge cases:
  - "https://example.com/data.parquet" vs "https://example.com/data.parquet?v=1": different, both allowed
  - "https://example.com/data.parquet" vs "https://example.com/data.parquet": duplicate, second rejected

### DUP-3: Same URL in Different Conversations Allowed
Tests: [spec.md#duplicate-detection](./spec.md#duplicate-detection)

- Scenario: Same URL added to two different conversations by the same user
- Expected: Both succeed (independent contexts)

---

### LIMIT-1: Maximum 5 Datasets Per Conversation
Tests: [spec.md#dataset-limits](./spec.md#dataset-limits)

- Scenario: Conversation already has 5 datasets, user attempts to add a 6th
- Expected: Rejected with "Maximum 5 datasets reached"

### LIMIT-2: Removing Frees a Slot
Tests: [spec.md#dataset-limits](./spec.md#dataset-limits)

- Scenario: Conversation has 5 datasets, user removes one, then adds a new one
- Expected: Removal succeeds, new addition succeeds (now at 5 again)

### LIMIT-3: Exactly 5 Allowed
Tests: [spec.md#dataset-limits](./spec.md#dataset-limits)

- Scenario: Conversation has 4 datasets, user adds a 5th
- Expected: 5th dataset added successfully

---

### CACHE-1: Schema Cached in SQLite
Tests: [spec.md#schema-caching](./spec.md#schema-caching)

- Scenario: Dataset loaded successfully
- Expected: Schema (columns, types, row_count) stored in datasets table, available without re-fetching from URL

### CACHE-2: Refresh Schema Re-runs Pipeline
Tests: [spec.md#schema-caching](./spec.md#schema-caching)

- Scenario: User triggers schema refresh on an existing dataset
- Expected: Steps 2-5 of validation pipeline re-run (HEAD request, magic number, scan_parquet, cache), updated schema replaces old cache
- Edge cases:
  - URL now inaccessible: refresh fails with "Could not access URL", old schema remains

---

### REMOVE-1: Dataset Removal Clears Schema
Tests: [spec.md#dataset-removal](./spec.md#dataset-removal)

- Scenario: User removes a dataset from a conversation
- Expected: Dataset record deleted from datasets table

### REMOVE-2: LLM Context Updated on Removal
Tests: [spec.md#dataset-removal](./spec.md#dataset-removal)

- Scenario: Dataset removed mid-conversation
- Expected: Next LLM request's system prompt does not include the removed dataset's schema

### REMOVE-3: Removal Mid-Conversation
Tests: [spec.md#dataset-removal](./spec.md#dataset-removal)

- Scenario: User removes a dataset between chat turns
- Expected: Next LLM turn uses updated dataset context, removed dataset's table name no longer usable in SQL

---

### FAIL-QUERY-1: URL Inaccessible During Query
Tests: [spec.md#failure-during-query](./spec.md#failure-during-query)

- Scenario: Dataset URL becomes inaccessible after initial loading, query references that dataset
- Expected: Worker returns network error, error sent to LLM as tool response, LLM informs user the dataset is no longer accessible

---

### AUTO-1: Auto-Loading from Chat Messages
Tests: [spec.md#auto-loading-from-chat-messages](./spec.md#auto-loading-from-chat-messages)

- Scenario: User sends a message containing a parquet URL
- Expected: LLM calls load_dataset tool, same validation pipeline runs, dataset appears in conversation if successful

### AUTO-2: Auto-Loading Respects Limits
Tests: [spec.md#auto-loading-from-chat-messages](./spec.md#auto-loading-from-chat-messages)

- Scenario: Conversation has 5 datasets, user sends message with a parquet URL
- Expected: Auto-load fails due to limit, LLM informs user maximum datasets reached

### AUTO-3: Auto-Loading Respects Duplicate Detection
Tests: [spec.md#auto-loading-from-chat-messages](./spec.md#auto-loading-from-chat-messages)

- Scenario: User sends a message with a URL already loaded in the conversation
- Expected: Auto-load fails due to duplicate, LLM informs user dataset is already loaded

### AUTO-4: Auto-Load Failure Reported to User
Tests: [spec.md#auto-loading-from-chat-messages](./spec.md#auto-loading-from-chat-messages)

- Scenario: Auto-load triggered but URL is not a valid parquet file
- Expected: LLM receives error from load_dataset tool, informs user and suggests adding manually via the right panel

---

### SOURCE-1: HTTP and HTTPS Only
Tests: [spec.md#supported-sources](./spec.md#supported-sources)

- Scenario: Various URL schemes submitted
- Expected: HTTP and HTTPS accepted, all others (ftp, s3, gs, file) rejected

### SOURCE-2: No Authentication for Remote URLs
Tests: [spec.md#supported-sources](./spec.md#supported-sources)

- Scenario: URL requires authentication (returns 401/403)
- Expected: Fails at step 2 with "Could not access URL"
