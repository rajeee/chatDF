---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Database Test Plan

## Fixtures (`tests/database/conftest.py`)

### `fresh_db` — Clean in-memory database with schema

```python
@pytest.fixture
async def fresh_db():
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    await init_db(conn)
    yield conn
    await conn.close()
```

### `populated_db` — Database with a full entity graph

Pre-seeds: 2 users, sessions for each, referral keys (used and unused), conversations with messages and datasets, token_usage records. Used for cascade and relationship tests.

```python
@pytest.fixture
async def populated_db(fresh_db):
    # Insert full entity graph
    user_a = make_user(id="user-a")
    user_b = make_user(id="user-b")
    await insert_user(fresh_db, user_a)
    await insert_user(fresh_db, user_b)
    # ... sessions, conversations, messages, datasets, token_usage
    yield fresh_db
```

## Test Implementation by Scenario

### Schema Tests (`test_schema.py`)

Tests: [test.md#SCHEMA-1 through SCHEMA-8](./test.md)

**Approach**: Query `sqlite_master` for table names and `PRAGMA table_info(tablename)` for column details.

| Scenario | Approach |
|----------|----------|
| SCHEMA-1 | `SELECT name FROM sqlite_master WHERE type='table'`. Assert 7 table names present. |
| SCHEMA-2–8 | For each table, `PRAGMA table_info({table})`. Assert column names, types, nullable flags, and primary key match spec. |

Column verification pattern:
```python
async def assert_table_columns(db, table_name, expected_columns):
    rows = await db.execute(f"PRAGMA table_info({table_name})")
    columns = {row["name"]: row for row in await rows.fetchall()}
    for col in expected_columns:
        assert col["name"] in columns
        assert columns[col["name"]]["type"] == col["type"]
        assert columns[col["name"]]["notnull"] == col["notnull"]
```

### Index Tests (`test_indexes.py`)

Tests: [test.md#INDEX-1 through INDEX-3](./test.md)

| Scenario | Approach |
|----------|----------|
| INDEX-1 | `SELECT name FROM sqlite_master WHERE type='index'`. Assert all 7 index names present. |
| INDEX-2 | Insert two users with same `google_id`. Assert `IntegrityError` raised on second insert. |
| INDEX-3 | Insert two referral keys with same `key` value. Assert `IntegrityError`. |

### Foreign Key Tests (`test_foreign_keys.py`)

Tests: [test.md#FK-1 through FK-9](./test.md)

| Scenario | Approach |
|----------|----------|
| FK-1 | Insert session with nonexistent `user_id`. Assert `IntegrityError`. |
| FK-2 | Delete user from `populated_db`. Assert `SELECT COUNT(*) FROM sessions WHERE user_id = ?` returns 0. |
| FK-3 | Delete user. Assert conversations for that user deleted. |
| FK-4 | Delete conversation. Assert all messages in that conversation deleted. |
| FK-5 | Delete conversation. Assert all datasets in that conversation deleted. |
| FK-6 | Delete user. Assert all token_usage for that user deleted. |
| FK-7 | Delete user who created referral keys. Assert `created_by` set to NULL on those keys. |
| FK-8 | Delete user who redeemed a referral key. Assert `used_by` set to NULL, key still exists. |

### Cascade Tests (`test_cascade.py`)

Tests: [test.md#CASCADE-1, CASCADE-2](./test.md)

| Scenario | Approach |
|----------|----------|
| CASCADE-1 | In `populated_db`, delete user_a. Count rows in sessions, conversations, messages, datasets, token_usage for user_a. All should be 0. Verify user_b's data untouched. |
| CASCADE-2 | Delete a specific conversation with 10 messages and 3 datasets. Assert all gone. Other conversations' data unaffected. |

### Constraint Tests (`test_constraints.py`)

Tests: [test.md#WAL-1, UUID-1, TS-1, CHECK-1, CHECK-2](./test.md)

| Scenario | Approach |
|----------|----------|
| WAL-1 | `PRAGMA journal_mode`. Assert result is `"wal"`. |
| UUID-1 | Insert records into each table. Assert all `id` values match UUID regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`. |
| TS-1 | Insert records. Assert all timestamp columns parse as valid ISO 8601. |
| CHECK-1 | Insert messages with `role="user"` (pass), `role="assistant"` (pass), `role="system"` (fail), `role=""` (fail). |
| CHECK-2 | Insert datasets with valid `status` values (pass) and invalid values (fail). |

## Scope

### In Scope
- All schema, index, foreign key, cascade, and constraint test scenarios from database/test.md
- Direct SQL assertions against in-memory SQLite
- No service layer involvement — pure database-level tests

### Out of Scope
- Application-level query logic (tested via service layer tests in other plans)
- Migration testing (V1 uses CREATE IF NOT EXISTS only)
