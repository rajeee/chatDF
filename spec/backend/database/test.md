---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Database Test Specification

Tests: [database/spec.md](./spec.md)

## Scope

### In Scope
- Schema initialization (all 7 tables)
- Index creation (all 7 indexes)
- Foreign key constraints and cascading behavior
- WAL mode
- UUID generation
- Timestamp format
- CHECK constraints
- Unique constraints
- Cascading deletes across the full entity graph

### Out of Scope
- Application-level query logic (see rest_api/test.md, rate_limiting/test.md)
- Worker data operations (see worker/test.md)

---

## Test Scenarios

### SCHEMA-1: All 7 Tables Created
Tests: [spec.md#tables](./spec.md#tables)

- Scenario: Database initialized from scratch
- Expected: The following tables exist: users, sessions, referral_keys, conversations, messages, datasets, token_usage

### SCHEMA-2: Users Table Structure
Tests: [spec.md#users](./spec.md#users)

- Scenario: Users table inspected
- Expected: Columns present: id (TEXT PK), google_id (TEXT UNIQUE), email (TEXT), name (TEXT), avatar_url (TEXT), created_at (TIMESTAMP), last_login_at (TIMESTAMP)

### SCHEMA-3: Sessions Table Structure
Tests: [spec.md#sessions](./spec.md#sessions)

- Scenario: Sessions table inspected
- Expected: Columns present: id (TEXT PK), user_id (TEXT FK -> users.id), created_at (TIMESTAMP), expires_at (TIMESTAMP)

### SCHEMA-4: Referral Keys Table Structure
Tests: [spec.md#referral_keys](./spec.md#referral_keys)

- Scenario: Referral keys table inspected
- Expected: Columns present: key (TEXT PK), created_by (TEXT FK nullable -> users.id), used_by (TEXT FK nullable -> users.id), created_at (TIMESTAMP), used_at (TIMESTAMP nullable)

### SCHEMA-5: Conversations Table Structure
Tests: [spec.md#conversations](./spec.md#conversations)

- Scenario: Conversations table inspected
- Expected: Columns present: id (TEXT PK), user_id (TEXT FK -> users.id), title (TEXT), created_at (TIMESTAMP), updated_at (TIMESTAMP)

### SCHEMA-6: Messages Table Structure
Tests: [spec.md#messages](./spec.md#messages)

- Scenario: Messages table inspected
- Expected: Columns present: id (TEXT PK), conversation_id (TEXT FK -> conversations.id), role (TEXT), content (TEXT), sql_query (TEXT nullable), token_count (INTEGER), created_at (TIMESTAMP)

### SCHEMA-7: Datasets Table Structure
Tests: [spec.md#datasets](./spec.md#datasets)

- Scenario: Datasets table inspected
- Expected: Columns present: id (TEXT PK), conversation_id (TEXT FK -> conversations.id), url (TEXT), name (TEXT), row_count (INTEGER), column_count (INTEGER), schema_json (TEXT), loaded_at (TIMESTAMP)

### SCHEMA-8: Token Usage Table Structure
Tests: [spec.md#token_usage](./spec.md#token_usage)

- Scenario: Token usage table inspected
- Expected: Columns present: id (TEXT PK), user_id (TEXT FK -> users.id), model_name (TEXT), input_tokens (INTEGER), output_tokens (INTEGER), cost (REAL), timestamp (TIMESTAMP)

---

### INDEX-1: All 7 Indexes Created
Tests: [spec.md#indexes](./spec.md#indexes)

- Scenario: Database initialized
- Expected: The following indexes exist:
  - users.google_id (unique)
  - sessions.user_id
  - referral_keys.used_by
  - conversations.user_id
  - messages.conversation_id
  - datasets.conversation_id
  - token_usage(user_id, timestamp) (composite)

### INDEX-2: Unique Index on users.google_id
Tests: [spec.md#indexes](./spec.md#indexes)

- Scenario: Attempt to insert two users with the same google_id
- Expected: Second insert fails with unique constraint violation

### INDEX-3: Unique Constraint on referral_keys.key
Tests: [spec.md#referral_keys](./spec.md#referral_keys)

- Scenario: Attempt to insert two referral keys with the same key value
- Expected: Second insert fails with unique constraint violation

---

### FK-1: Foreign Key Constraints Enforced
Tests: [spec.md#tables](./spec.md#tables)

- Scenario: Attempt to insert a session with a user_id that does not exist in users table
- Expected: Insert fails with foreign key constraint violation

### FK-2: ON DELETE CASCADE - Sessions
Tests: [spec.md#sessions](./spec.md#sessions)

- Scenario: User deleted from users table
- Expected: All sessions for that user automatically deleted

### FK-3: ON DELETE CASCADE - Conversations
Tests: [spec.md#conversations](./spec.md#conversations)

- Scenario: User deleted from users table
- Expected: All conversations for that user automatically deleted

### FK-4: ON DELETE CASCADE - Messages via Conversation
Tests: [spec.md#messages](./spec.md#messages)

- Scenario: Conversation deleted
- Expected: All messages in that conversation automatically deleted

### FK-5: ON DELETE CASCADE - Datasets via Conversation
Tests: [spec.md#datasets](./spec.md#datasets)

- Scenario: Conversation deleted
- Expected: All datasets in that conversation automatically deleted

### FK-6: ON DELETE CASCADE - Token Usage
Tests: [spec.md#token_usage](./spec.md#token_usage)

- Scenario: User deleted from users table
- Expected: All token_usage records for that user automatically deleted

### FK-7: ON DELETE SET NULL - referral_keys.created_by
Tests: [spec.md#referral_keys](./spec.md#referral_keys)

- Scenario: Admin user (who created referral keys) is deleted
- Expected: referral_keys.created_by set to NULL for keys created by that admin, keys remain in table

### FK-8: ON DELETE SET NULL - referral_keys.used_by
Tests: [spec.md#referral_keys](./spec.md#referral_keys)

- Scenario: User who redeemed a referral key is deleted
- Expected: referral_keys.used_by set to NULL, key remains in table

---

### CASCADE-1: Delete User - Full Cascade
Tests: [spec.md#tables](./spec.md#tables)

- Scenario: User with sessions, conversations (containing messages and datasets), and token_usage records is deleted
- Expected: All related records deleted: sessions, conversations, messages (via conversation cascade), datasets (via conversation cascade), token_usage

### CASCADE-2: Delete Conversation - Cascade to Messages and Datasets
Tests: [spec.md#conversations](./spec.md#conversations)

- Scenario: Conversation with 10 messages and 3 datasets is deleted
- Expected: All 10 messages and 3 datasets automatically deleted

---

### WAL-1: WAL Mode Enabled
Tests: [spec.md#notes](./spec.md#notes)

- Scenario: Database connection established
- Expected: SQLite journal_mode is WAL (Write-Ahead Logging)

---

### UUID-1: UUID Generation for All IDs
Tests: [spec.md#notes](./spec.md#notes)

- Scenario: New records created in users, sessions, conversations, messages, datasets, token_usage tables
- Expected: id column populated with valid UUID format (8-4-4-4-12 hex pattern)

---

### TS-1: Timestamp Format ISO 8601
Tests: [spec.md#notes](./spec.md#notes)

- Scenario: Record with timestamp columns created
- Expected: All timestamp values stored in ISO 8601 format (e.g., "2026-02-05T12:00:00Z")

---

### CHECK-1: Role CHECK Constraint on Messages
Tests: [spec.md#messages](./spec.md#messages)

- Scenario: Attempt to insert message with role other than "user" or "assistant"
- Expected: Insert fails with CHECK constraint violation
- Edge cases:
  - role="user": accepted
  - role="assistant": accepted
  - role="system": rejected
  - role="": rejected

### CHECK-2: Dataset Status CHECK Constraint
Tests: [spec.md#datasets](./spec.md#datasets)

- Scenario: Dataset record with status field validation
- Expected: Only valid status values accepted (if status column uses a CHECK constraint)
