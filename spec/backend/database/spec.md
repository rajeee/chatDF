# Database Schema Specification

SQLite database for application state, user data, and conversation history.

## Tables

### users

Registered users (Google OAuth).

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| google_id | TEXT (UNIQUE) | Google account ID |
| email | TEXT | User email |
| name | TEXT | Display name |
| avatar_url | TEXT | Profile picture URL |
| created_at | TIMESTAMP | Account creation time |
| last_login_at | TIMESTAMP | Last login time |

### sessions

Active sessions for authenticated users.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Session token |
| user_id | TEXT (FK) | References users.id |
| created_at | TIMESTAMP | Session start |
| expires_at | TIMESTAMP | Session expiry |

### referral_keys

Invite keys for controlling sign-up access.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT (PK) | The referral key string |
| created_by | TEXT (FK, nullable) | References users.id (admin who created it) |
| used_by | TEXT (FK, nullable) | References users.id (user who redeemed it) |
| created_at | TIMESTAMP | When key was created |
| used_at | TIMESTAMP (nullable) | When key was redeemed |

### conversations

Chat sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| user_id | TEXT (FK) | References users.id |
| title | TEXT | Conversation title (first message preview) |
| created_at | TIMESTAMP | Conversation start |
| updated_at | TIMESTAMP | Last message time |

### messages

Individual chat messages.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| conversation_id | TEXT (FK) | References conversations.id |
| role | TEXT | 'user' or 'assistant' |
| content | TEXT | Message text |
| sql_query | TEXT (nullable) | Executed SQL (if applicable) |
| token_count | INTEGER | Tokens used for this message |
| created_at | TIMESTAMP | Message timestamp |

### datasets

Loaded datasets per conversation.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| conversation_id | TEXT (FK) | References conversations.id |
| url | TEXT | Source URL |
| name | TEXT | User-editable table name |
| row_count | INTEGER | Number of rows |
| column_count | INTEGER | Number of columns |
| schema_json | TEXT | JSON: column names and types |
| loaded_at | TIMESTAMP | When schema was fetched |

### token_usage

Track token consumption for rate limiting.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| user_id | TEXT (FK) | References users.id |
| model_name | TEXT | Model used (e.g., 'gemini-2.5-flash') |
| input_tokens | INTEGER | Prompt tokens |
| output_tokens | INTEGER | Response tokens |
| cost | REAL | Estimated cost in USD |
| timestamp | TIMESTAMP | When tokens were used |

## Indexes

- `users.google_id` - OAuth lookup
- `sessions.user_id` - Session lookup by user
- `referral_keys.used_by` - Lookup if user used a key
- `conversations.user_id` - User's conversation history
- `messages.conversation_id` - Messages in conversation
- `datasets.conversation_id` - Datasets in conversation
- `token_usage.user_id, timestamp` - Rolling usage calculation

## Notes

- All IDs are UUIDs stored as TEXT
- Timestamps stored as ISO 8601 strings
- All conversations are persisted (no guest mode)
- Messages are stored in flat chronological order per conversation. For context window pruning, keep the most recent 50 messages by `created_at`
- Referral keys are single-use: once redeemed, cannot be reused
