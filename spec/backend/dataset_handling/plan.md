---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Dataset Handling Plan

## Module Structure

### `backend/app/services/dataset_service.py`

Service module for all dataset operations. Delegates parquet operations to the worker pool and persists metadata in SQLite.

## Functions

| Function | Signature | Returns |
|----------|-----------|---------|
| `validate_url` | `(url: str) -> None` | Raises `ValueError` on invalid format |
| `add_dataset` | `async (db, pool, conversation_id, url) -> dict` | Dataset dict with schema |
| `remove_dataset` | `async (db, conversation_id, dataset_id) -> None` | Nothing |
| `refresh_schema` | `async (db, pool, dataset_id) -> dict` | Updated dataset dict |
| `get_datasets` | `async (db, conversation_id) -> list[dict]` | All datasets for conversation |

## Validation Pipeline

Implements: [spec.md#url-validation-pipeline](./spec.md#url-validation-pipeline)

`add_dataset` runs these steps sequentially (fail-fast):

| Step | Implementation | Timeout |
|------|---------------|---------|
| 1. Format check | `validate_url(url)` -- regex for http(s) scheme, parseable URL | Instant |
| 2. Duplicate check | Query `datasets` table: `WHERE conversation_id = ? AND url = ?` | Instant |
| 3. Limit check | Query `datasets` table: `SELECT COUNT(*) WHERE conversation_id = ?` >= 5 | Instant |
| 4. HEAD + magic bytes | `await worker_pool.validate_url(pool, url)` | 10s (worker) |
| 5. Schema extraction | `await worker_pool.get_schema(pool, url)` | 30s (worker) |
| 6. Persist | Insert into `datasets` table | Instant |

Steps 2-3 are checked before any network calls to fail fast on business rules.

On any failure, raises a service-level exception with a user-facing message matching the spec error strings.

## Auto-Naming

Implements: [spec.md#auto-naming](./spec.md#auto-naming)

`_next_table_name(db, conversation_id) -> str`

1. Query: `SELECT COUNT(*) FROM datasets WHERE conversation_id = ?`.
2. Return `f"table{count + 1}"`.

This produces `table1`, `table2`, etc. in insertion order. If a dataset is removed and a new one added, the new name increments from total-ever-added (using a count of existing rows) -- gaps are acceptable since users can rename.

Alternative considered: tracking a `next_name_index` column on the conversation. Rejected -- counting existing rows is simpler and avoids schema changes.

## Duplicate Detection

Implements: [spec.md#duplicate-detection](./spec.md#duplicate-detection)

Exact string match on `url` column scoped to `conversation_id`. No URL normalization (e.g., trailing slashes, query params are significant).

## Dataset Limit

Implements: [spec.md#dataset-limits](./spec.md#dataset-limits)

Checked in step 3 of `add_dataset`. Constant `MAX_DATASETS_PER_CONVERSATION = 5` in `dataset_service.py`.

## Schema Refresh

Implements: [spec.md#schema-caching](./spec.md#schema-caching)

`refresh_schema` re-runs steps 4-5 of the validation pipeline, then updates the existing `datasets` row with new `schema_json`, `row_count`, `column_count`, and `loaded_at`.

## Dataset Removal

Implements: [spec.md#dataset-removal](./spec.md#dataset-removal)

`remove_dataset` deletes the row from `datasets` table: `DELETE FROM datasets WHERE id = ? AND conversation_id = ?`. No cascading cleanup needed -- no cached data exists beyond the metadata row.

## Database Operations

All SQL in `dataset_service.py` operates on the `datasets` table:

| Operation | SQL Pattern |
|-----------|-------------|
| Insert | `INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, loaded_at) VALUES (...)` |
| Delete | `DELETE FROM datasets WHERE id = ? AND conversation_id = ?` |
| Update (refresh) | `UPDATE datasets SET schema_json = ?, row_count = ?, column_count = ?, loaded_at = ? WHERE id = ?` |
| List | `SELECT * FROM datasets WHERE conversation_id = ? ORDER BY loaded_at` |
| Count | `SELECT COUNT(*) FROM datasets WHERE conversation_id = ?` |
| Duplicate check | `SELECT 1 FROM datasets WHERE conversation_id = ? AND url = ?` |

## Scope

### In Scope
- URL format validation
- Orchestration of worker calls for network validation and schema extraction
- Auto-naming, duplicate detection, limit enforcement
- CRUD operations on the `datasets` table
- Schema refresh flow

### Out of Scope
- Parquet parsing (see worker/plan.md -- handles all Polars operations)
- LLM auto-loading from chat (see llm/plan.md -- calls `add_dataset` when `load_dataset` tool is invoked)
- Dataset card UI state (see frontend/right_panel/plan.md)

### Assumptions
- Worker pool is available via `app.state.worker_pool` (initialized in lifespan).
- `conversation_id` is always validated upstream (router ensures conversation exists and belongs to user).
