---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Dataset Handling Test Plan

## Fixtures (`tests/dataset_handling/conftest.py`)

### `mock_worker_pool` — Mocked worker pool for isolation

```python
@pytest.fixture
def mock_worker_pool():
    pool = AsyncMock()
    pool.validate_url = AsyncMock(return_value={"valid": True})
    pool.get_schema = AsyncMock(return_value={
        "columns": [{"name": "id", "type": "Int64"}, {"name": "name", "type": "Utf8"}],
        "row_count": 100,
    })
    return pool
```

### `conversation_with_datasets` — Conversation pre-loaded with N datasets

```python
@pytest.fixture
async def conversation_with_datasets(db, test_user, request):
    count = getattr(request, "param", 0)
    conv = make_conversation(user_id=test_user["id"])
    await insert_conversation(db, conv)
    datasets = []
    for i in range(count):
        ds = make_dataset(conversation_id=conv["id"], url=f"https://example.com/data{i}.parquet", name=f"table{i+1}")
        await insert_dataset(db, ds)
        datasets.append(ds)
    return conv, datasets
```

Parameterized: `@pytest.mark.parametrize("conversation_with_datasets", [0, 3, 5], indirect=True)`

### Sample URLs

```python
VALID_PARQUET_URL = "https://example.com/data.parquet"
INVALID_FORMAT_URL = "ftp://example.com/data.parquet"
INACCESSIBLE_URL = "https://example.com/nonexistent.parquet"
NON_PARQUET_URL = "https://example.com/data.csv"
```

## Test Implementation by Scenario

### Validation Pipeline Tests (`test_validation.py`)

Tests: [test.md#VALIDATE-1 through VALIDATE-6](./test.md)

**VALIDATE-1** (URL format): Call `validate_url()` directly with various URL strings. Assert `ValueError` for invalid schemes (ftp, s3, empty, missing scheme, spaces). Assert no error for http/https.

**VALIDATE-2** (HEAD request): Mock `worker_pool.validate_url` to return error for 404, 403, timeout. Assert error message "Could not access URL". Verify step 2 not called when step 1 fails.

**VALIDATE-3** (Magic number): Mock `worker_pool.validate_url` to return `{"valid": False, "error": "Not a valid parquet file"}` for non-parquet files.

**VALIDATE-4** (Schema extraction): Mock `worker_pool.get_schema` to return valid schema, timeout, or corrupted-file error. Assert success or appropriate error.

**VALIDATE-5** (Cache in SQLite): After successful `add_dataset`, query `datasets` table. Assert `schema_json`, `row_count`, `column_count` match worker response.

**VALIDATE-6** (Fail-fast): Mock step 1 to fail. Assert `worker_pool.validate_url` never called. Mock step 2 to fail. Assert `worker_pool.get_schema` never called. Verify call counts.

### Naming Tests (`test_naming.py`)

Tests: [test.md#NAME-1 through NAME-3](./test.md)

| Scenario | Approach |
|----------|----------|
| NAME-1 | Add 3 datasets. Assert names are `table1`, `table2`, `table3`. |
| NAME-2 | Add 3 datasets, remove `table2`, add a new one. Assert new dataset is `table4` (not `table2`). |
| NAME-3 | Assert generated names match regex `^[a-zA-Z_][a-zA-Z0-9_]*$`. |

### Duplicate Tests (`test_duplicates.py`)

Tests: [test.md#DUP-1 through DUP-3](./test.md)

| Scenario | Approach |
|----------|----------|
| DUP-1 | Add a dataset, then add same URL. Assert second call raises with "This dataset is already loaded". |
| DUP-2 | Add URL with trailing `?v=1`, then add URL without param. Assert both succeed (no normalization). |
| DUP-3 | Add same URL to two different conversations. Assert both succeed. |

### Limit Tests (`test_limits.py`)

Tests: [test.md#LIMIT-1 through LIMIT-3](./test.md)

| Scenario | Approach |
|----------|----------|
| LIMIT-1 | Use `conversation_with_datasets` parameterized to 5. Attempt to add 6th. Assert "Maximum 5 datasets reached". |
| LIMIT-2 | Have 5 datasets, remove one, add new. Assert success. |
| LIMIT-3 | Have 4 datasets, add 5th. Assert success. |

### Cache Tests (`test_cache.py`)

Tests: [test.md#CACHE-1, CACHE-2](./test.md)

| Scenario | Approach |
|----------|----------|
| CACHE-1 | After `add_dataset`, query `datasets` table. Assert `schema_json` populated with correct columns. |
| CACHE-2 | After `add_dataset`, mock worker with updated schema. Call `refresh_schema`. Assert DB row updated with new values. Then mock worker failure — assert old schema remains. |

### Removal Tests (`test_removal.py`)

Tests: [test.md#REMOVE-1 through REMOVE-3](./test.md)

| Scenario | Approach |
|----------|----------|
| REMOVE-1 | Add dataset, then remove. Query `datasets` table. Assert row deleted. |
| REMOVE-2 | Add 2 datasets, remove one. Call `build_system_prompt` (from LLM service). Assert only remaining dataset's schema included. (Integration between dataset_service and llm_service.) |
| REMOVE-3 | Remove dataset between two simulated chat turns. Verify second turn's system prompt excludes removed dataset. |

### Auto-Load Tests (`test_auto_load.py`)

Tests: [test.md#AUTO-1 through AUTO-4, FAIL-QUERY-1](./test.md)

| Scenario | Approach |
|----------|----------|
| AUTO-1 | Simulate `load_dataset` tool call from LLM. Assert `add_dataset` called with extracted URL. Assert dataset appears in DB. |
| AUTO-2 | Conversation at 5 datasets. Simulate `load_dataset` tool call. Assert error returned to LLM. |
| AUTO-3 | URL already loaded. Simulate `load_dataset`. Assert duplicate error returned to LLM. |
| AUTO-4 | Mock worker to fail validation. Assert LLM receives error message. |
| FAIL-QUERY-1 | Mock worker query to return network error. Assert error propagated to LLM as tool response. |

### Source Tests (`test_sources.py`)

Tests: [test.md#SOURCE-1, SOURCE-2](./test.md)

| Scenario | Approach |
|----------|----------|
| SOURCE-1 | Parameterize with `http://`, `https://`, `ftp://`, `s3://`, `gs://`, `file://`. Assert only http/https accepted. |
| SOURCE-2 | Mock worker to return 401/403. Assert fails at step 2 with "Could not access URL". |

## Scope

### In Scope
- All dataset handling test scenarios from dataset_handling/test.md
- Testing `dataset_service.py` functions directly
- Mocking worker pool at the service boundary
- Database state assertions after operations

### Out of Scope
- Worker pool internals (see worker/test_plan.md)
- LLM tool call mechanics (see llm/test_plan.md)
- Frontend dataset card rendering (see frontend test plans)
