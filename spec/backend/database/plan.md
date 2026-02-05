---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Database Plan

## Module Structure

### `backend/app/database.py`

Single module for connection management and schema initialization. All query logic lives in the service modules -- `database.py` only provides the connection and ensures the schema exists.

## Connection Management

Implements: [spec.md#tables](./spec.md#tables) (infrastructure for all tables)

- Connection opened in FastAPI lifespan (`main.py`):
  `db = await aiosqlite.connect(config.DATABASE_URL)`.
- Stored on `app.state.db`.
- WAL mode enabled immediately after connection: `PRAGMA journal_mode=WAL`.
- Foreign keys enabled: `PRAGMA foreign_keys=ON`.
- Row factory set to `aiosqlite.Row` for dict-like access.

### FastAPI Dependency

`async def get_db(request: Request) -> aiosqlite.Connection`

Returns `request.app.state.db`. Used by all routers via `Depends(get_db)`.

## Schema Initialization

Implements: [spec.md#tables](./spec.md) (all table definitions)

`async init_db(db: Connection) -> None`

Called once during lifespan startup, after connection is opened. Executes `CREATE TABLE IF NOT EXISTS` for each table and `CREATE INDEX IF NOT EXISTS` for each index.

### Table Creation Order (respects foreign keys)

1. `users`
2. `sessions` (FK: users)
3. `referral_keys` (FK: users)
4. `conversations` (FK: users)
5. `messages` (FK: conversations)
6. `datasets` (FK: conversations)
7. `token_usage` (FK: users)

### Column Types

Per spec: all IDs are `TEXT` (UUID strings), timestamps are `TEXT` (ISO 8601).

## Index Creation

Implements: [spec.md#indexes](./spec.md#indexes)

Indexes created in `init_db` after tables:

| Index Name | Table.Column(s) |
|------------|-----------------|
| `idx_users_google_id` | `users.google_id` |
| `idx_sessions_user_id` | `sessions.user_id` |
| `idx_referral_keys_used_by` | `referral_keys.used_by` |
| `idx_conversations_user_id` | `conversations.user_id` |
| `idx_messages_conversation_id` | `messages.conversation_id` |
| `idx_messages_sequence` | `messages.sequence` |
| `idx_datasets_conversation_id` | `datasets.conversation_id` |
| `idx_token_usage_user_timestamp` | `token_usage(user_id, timestamp)` |

## Database Access Pattern

All query logic lives in service modules, NOT in `database.py`. Services receive the `db` connection via dependency injection and execute their own SQL.

| Service Module | Tables Accessed |
|---------------|-----------------|
| `auth_service.py` | `users`, `sessions`, `referral_keys` |
| `chat_service.py` | `conversations`, `messages` |
| `dataset_service.py` | `datasets` |
| `rate_limit_service.py` | `token_usage` |
| `llm_service.py` | None (receives data from chat_service) |

Services use parameterized queries (`?` placeholders) for all user-provided values.

## Connection Lifecycle

Implements: [spec.md (overall)](./spec.md)

```
App startup (lifespan):
  1. Open aiosqlite connection
  2. Set PRAGMAs (WAL, foreign_keys)
  3. Run init_db (CREATE TABLE/INDEX IF NOT EXISTS)
  4. Store on app.state.db

App running:
  - All requests share the single connection
  - aiosqlite handles async locking internally
  - Services call db.execute / db.executemany / db.fetchone / db.fetchall

App shutdown (lifespan):
  1. await db.close()
```

## UUID Generation

All services generate UUIDs via `str(uuid.uuid4())` at insert time. No database-level UUID generation.

## Timestamp Handling

All timestamps inserted as `datetime.utcnow().isoformat()`. SQLite `datetime()` functions used in queries (e.g., rate limiting rolling window).

## Scope

### In Scope
- `aiosqlite` connection open/close in lifespan
- PRAGMA configuration
- Schema initialization (all 7 tables and 8 indexes)
- `get_db` dependency for routers
- Connection lifecycle documentation

### Out of Scope
- Individual CRUD queries (owned by each service module)
- Migration tooling (V1 uses CREATE IF NOT EXISTS only)
- Backup strategy
- Connection pooling (single connection is sufficient for SQLite)

### Assumptions
- SQLite 3.35+ available (for RETURNING clause if needed by services).
- Single-writer concurrency model is acceptable (SQLite limitation).
- WAL mode provides adequate read concurrency for the expected user load.
