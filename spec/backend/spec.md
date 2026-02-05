# Backend Specification

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Frontend  │◄──────────────────►│   FastAPI       │
└─────────────┘                    │   (main app)    │
                                   └────────┬────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
             ┌─────────────┐        ┌─────────────┐         ┌─────────────┐
             │   SQLite    │        │   Gemini    │         │   Worker    │
             │   (state)   │        │   API       │         │  (Polars)   │
             └─────────────┘        └─────────────┘         └─────────────┘
```

## Communication

### REST Endpoints (Actions)
- `POST /auth/google` - Google OAuth initiation
- `GET /auth/google/callback` - OAuth callback
- `POST /auth/register` - Sign up with referral key
- `GET /auth/me` - Current user info
- `POST /auth/logout` - Logout
- `GET /usage` - Token usage stats
- `POST /conversations` - Create conversation
- `POST /conversations/:id/messages` - Send chat message
- `POST /conversations/:id/datasets` - Add dataset
- `DELETE /conversations/:id/datasets/:dataset_id` - Remove dataset
- `POST /conversations/:id/stop` - Stop generation
- `GET /conversations` - List conversations
- `GET /conversations/:id` - Get conversation details
- `DELETE /conversations/:id` - Delete conversation

### WebSocket (Server-Push Events Only)
- Streaming response tokens
- Dataset loading progress updates
- Query execution status updates
- Rate limit warnings

## Background Worker

- **Technology**: Python `multiprocessing` with pool of 4 workers
- **Responsibilities**:
  - Fetch and validate dataset URLs
  - Extract schema from parquet files
  - Execute Polars SQL queries
- **Memory management**: Track worker memory usage, enforce limits per worker

## Dataset Handling

### URL Validation
1. Check URL format
2. Fetch first bytes to verify parquet header
3. Extract schema (column names, types, row count)
4. Cache schema in SQLite (no expiry)
5. Option to reload/refresh schema

### Storage
- Schema cached in SQLite
- No parquet data stored - always lazy-load from URL
- Limit: 5 datasets per conversation

## LLM Integration

### Provider
- Google Gemini (server-side API key)
- Tool calling for SQL execution (like notebook)

### Conversation Management
- Server maintains full conversation state in SQLite
- Fixed limit: 50 messages per conversation
- Oldest messages dropped when limit exceeded
- System prompt includes: column names for all loaded datasets

### Error Handling
- SQL errors sent back to LLM for self-correction
- LLM can retry with modified query
- Final failure returns user-friendly error + expandable details

## Rate Limiting

### Token Budgets (Rolling 24-hour window)
| User Type | Daily Limit |
|-----------|-------------|
| Registered | 5M tokens |

Single tier — all users are registered.

## Authentication

### Google OAuth
- Single OAuth provider
- Server issues session token on success
- Session stored in SQLite
- Sign-up requires valid referral key
- No guest/anonymous access

## Logging

Detailed logging:
- All requests (method, path, user type)
- Query execution timing
- Token usage per request
- Errors with stack traces
- Worker memory usage

## Configuration

Environment variables:
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL` (SQLite path)
- `CORS_ORIGINS`
- `TOKEN_LIMIT` (default 5M)
- `WORKER_MEMORY_LIMIT`
- `WORKER_POOL_SIZE` (default 4)
