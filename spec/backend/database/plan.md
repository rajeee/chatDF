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
2. `sessions` (FK → users)
3. `referral_keys` (FK → users)
4. `conversations` (FK → users)
5. `messages` (FK → conversations)
6. `datasets` (FK → conversations)
7. `token_usage` (FK → users)

### Column Conventions

- All IDs are `TEXT` (UUID strings via `uuid.uuid4()`).
- All timestamps are `TEXT` (ISO 8601 via `datetime.utcnow().isoformat()`).
- `NOT NULL` on every column unless explicitly nullable.

### Table Schemas

```sql
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,                   -- UUID
    google_id   TEXT NOT NULL UNIQUE,               -- Google account ID (OAuth sub)
    email       TEXT NOT NULL,                      -- Google email
    name        TEXT NOT NULL,                      -- Display name
    avatar_url  TEXT,                               -- Profile picture URL (nullable)
    created_at  TEXT NOT NULL,                      -- ISO 8601
    last_login_at TEXT NOT NULL                     -- ISO 8601, updated on each sign-in
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,                   -- Session token (UUID)
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,                      -- ISO 8601
    expires_at  TEXT NOT NULL                       -- ISO 8601, 7 days from creation
);

CREATE TABLE IF NOT EXISTS referral_keys (
    key         TEXT PRIMARY KEY,                   -- The referral key string
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,  -- Admin who created it (nullable)
    used_by     TEXT REFERENCES users(id) ON DELETE SET NULL,  -- User who redeemed it (nullable)
    created_at  TEXT NOT NULL,                      -- ISO 8601
    used_at     TEXT                                -- ISO 8601, NULL until redeemed
);

CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,                   -- UUID
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',           -- First message preview or user-edited title
    created_at  TEXT NOT NULL,                      -- ISO 8601
    updated_at  TEXT NOT NULL                       -- ISO 8601, updated on each new message
);

CREATE TABLE IF NOT EXISTS messages (
    id                TEXT PRIMARY KEY,               -- UUID
    conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role              TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content           TEXT NOT NULL,                  -- Message text (markdown for assistant)
    sql_query         TEXT,                           -- SQL executed for this message (nullable)
    token_count       INTEGER NOT NULL DEFAULT 0,     -- Tokens used for this message
    created_at        TEXT NOT NULL                   -- ISO 8601
);

CREATE TABLE IF NOT EXISTS datasets (
    id              TEXT PRIMARY KEY,               -- UUID
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,                  -- Source parquet URL
    name            TEXT NOT NULL,                  -- Table name (auto: table1, table2, ...)
    row_count       INTEGER NOT NULL DEFAULT 0,     -- Row count from schema scan
    column_count    INTEGER NOT NULL DEFAULT 0,     -- Column count from schema scan
    schema_json     TEXT NOT NULL DEFAULT '[]',     -- JSON array: [{name, type}, ...]
    status          TEXT NOT NULL DEFAULT 'loading' CHECK(status IN ('loading', 'ready', 'error')),
    error_message   TEXT,                           -- Error detail if status='error' (nullable)
    loaded_at       TEXT NOT NULL                   -- ISO 8601, when schema was last fetched
);

CREATE TABLE IF NOT EXISTS token_usage (
    id              TEXT PRIMARY KEY,               -- UUID
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,  -- Context (nullable)
    model_name      TEXT NOT NULL DEFAULT 'gemini-2.5-flash',  -- Model used for this request
    input_tokens    INTEGER NOT NULL,               -- Prompt tokens for this request
    output_tokens   INTEGER NOT NULL,               -- Response tokens for this request
    cost            REAL NOT NULL DEFAULT 0.0,      -- Estimated cost in USD for this request
    timestamp       TEXT NOT NULL                   -- ISO 8601, when tokens were consumed
);
```

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
- Schema initialization (all 7 tables and 7 indexes)
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
