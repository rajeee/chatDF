---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Backend Plan

## FastAPI Application Structure
Implements: [spec.md#Architecture](./spec.md)

### Lifespan
`main.py` defines an async lifespan context manager that:
1. On startup: initializes SQLite schema via `database.init_db()`, starts worker pool via `worker_pool.start()`
2. On shutdown: drains worker pool via `worker_pool.shutdown()`, closes DB connections

### Middleware Stack (applied in order)
1. `CORSMiddleware` — configured from `Settings.cors_origins`
2. Custom `RequestLoggingMiddleware` — logs method, path, user_id, response time
3. Custom `ErrorHandlingMiddleware` — catches unhandled exceptions, returns JSON error response

### CORS
`CORSMiddleware` configured with:
- `allow_origins`: parsed from `CORS_ORIGINS` env var (comma-separated)
- `allow_methods`: `["GET", "POST", "DELETE", "OPTIONS"]`
- `allow_headers`: `["Content-Type", "Cookie"]`
- `allow_credentials`: `True`

## Router Organization
Implements: [spec.md#Communication](./spec.md)

Routers mounted in `main.py` with prefixes:
- `auth.router` at `/auth`
- `conversations.router` at `/conversations`
- `datasets.router` at `/conversations/{conversation_id}/datasets`
- `usage.router` at `/usage`
- `websocket.router` at `/ws`

## Dependency Injection
Implements: [spec.md#Authentication](./spec.md)

### `get_db() -> aiosqlite.Connection`
Yields an aiosqlite connection from a module-level connection pool (single connection, re-used). Connection opened in lifespan, closed on shutdown.

### `get_current_user(request: Request, db = Depends(get_db)) -> User`
Extracts `session_token` from httpOnly cookie. Queries `sessions` table, validates `expires_at > now`. Refreshes session expiry by 7 days on success. Returns `User` Pydantic model. Raises `HTTPException(401)` on failure.

### `get_conversation(conversation_id: str, user = Depends(get_current_user), db = Depends(get_db)) -> Conversation`
Loads conversation by ID. Validates `user_id` matches current user. Raises 404 if missing, 403 if not owner.

## Service Layer Pattern

Routers contain no business logic. Each router function calls a service function, passing DB connection and validated inputs. Services return Pydantic models or raise domain exceptions. Routers convert domain exceptions to HTTP responses.

Pattern: `router -> service -> database`

Services:
- `auth_service.py` — OAuth flow, session CRUD, referral key validation
- `chat_service.py` — message processing, LLM orchestration
- `dataset_service.py` — URL validation, schema extraction/caching
- `llm_service.py` — Gemini API wrapper, streaming, tool calls
- `rate_limit_service.py` — token usage tracking, limit enforcement
- `worker_pool.py` — multiprocessing pool management

## Chat Service Orchestration
Implements: [spec.md#LLM-Integration](./spec.md#llm-integration), [llm/spec.md](./llm/spec.md), [rate_limiting/spec.md](./rate_limiting/spec.md)

`chat_service.py` is the central orchestrator for the message-send flow. It coordinates rate limiting, LLM calls, tool execution, token recording, and WebSocket events.

### Full Message-Send Flow

`async process_message(user_id: str, conversation_id: str, content: str, db: Connection, connection_manager: ConnectionManager, worker_pool: Pool) -> None`

1. **Concurrency check**: Check if a generation is already in progress for this conversation (in-memory `set` of active conversation IDs). If yes, raise `ConflictError` (409).
2. **Mark active**: Add `conversation_id` to the active-generations set.
3. **Persist user message**: Insert user message into `messages` table.
4. **Rate limit check**: `status = await rate_limit_service.check_limit(db, user_id)`. If `status.allowed` is `False`, send `rate_limit_exceeded` via WebSocket, raise `RateLimitError` (429).
5. **Build context**: Fetch last 50 messages (by `created_at` desc) from `messages` table for this conversation. Apply token-budget pruning per [llm/spec.md#context-pruning-algorithm](./llm/spec.md#context-pruning-algorithm).
6. **Fetch datasets**: Load dataset schemas for this conversation from `datasets` table.
7. **Send query_status("generating")** via WebSocket.
8. **Call LLM**: `result = await llm_service.stream_chat(messages, datasets, ws_send)`. The `ws_send` callback pushes `chat_token` events to the user via `connection_manager`.
9. **Handle tool calls** (inside `stream_chat`): If LLM issues `execute_sql`, dispatch to `worker_pool.run_query()`. Send `query_status("executing")` before execution, `query_status("formatting")` after. If LLM issues `load_dataset`, delegate to `dataset_service.add_dataset()`.
10. **Persist assistant message**: Insert assistant response into `messages` table with `token_count`.
11. **Record usage**: `await rate_limit_service.record_usage(db, user_id, result.input_tokens, result.output_tokens)`.
12. **Send completion**: Send `chat_complete` via WebSocket with `message_id`, `sql_query`, `token_count`.
13. **Check warning**: Re-check rate limit. If `status.warning`, include `rate_limit_warning` in the completion event.
14. **Mark inactive**: Remove `conversation_id` from active-generations set (in a `finally` block).

### Error Handling at Each Step

| Step | Error | Behavior |
|------|-------|----------|
| Rate limit check | DB error | `chat_error` via WebSocket, log error |
| LLM call | Gemini API error | `chat_error` via WebSocket, partial response preserved if any tokens streamed |
| Tool execution | Worker timeout/error | Error passed back to LLM as tool response (LLM can retry up to 3 times) |
| Context too large | Gemini rejects payload | Prune 10 more messages and retry once; if still fails, `chat_error` |
| Any step | Unhandled exception | `chat_error` via WebSocket, log full traceback, remove from active set |

### Stop/Cancel

`async stop_generation(conversation_id: str) -> None`

- Sets a cancellation flag for the conversation's active generation.
- `stream_chat` checks this flag between stream chunks and tool calls.
- On cancellation: partial response preserved in `messages` table, `chat_complete` sent with what was generated so far.

## Configuration
Implements: [spec.md#Configuration](./spec.md)

`config.py` defines a `Settings` class using `pydantic_settings.BaseSettings`:

| Field | Env Var | Default |
|-------|---------|---------|
| `gemini_api_key` | `GEMINI_API_KEY` | required |
| `google_client_id` | `GOOGLE_CLIENT_ID` | required |
| `google_client_secret` | `GOOGLE_CLIENT_SECRET` | required |
| `database_url` | `DATABASE_URL` | `"sqlite:///chatdf.db"` |
| `cors_origins` | `CORS_ORIGINS` | `"http://localhost:5173"` |
| `token_limit` | `TOKEN_LIMIT` | `5_000_000` |
| `worker_memory_limit` | `WORKER_MEMORY_LIMIT` | `512` (MB) |
| `worker_pool_size` | `WORKER_POOL_SIZE` | `4` |
| `session_duration_days` | `SESSION_DURATION_DAYS` | `7` |

Loaded via `python-dotenv` from `.env`. Singleton instance via `functools.lru_cache`.

## Error Handling Middleware
Implements: [spec.md#Logging](./spec.md)

`ErrorHandlingMiddleware` catches all unhandled exceptions:
- Logs full traceback at ERROR level
- Returns `{"error": "Internal server error", "details": str(exc)}` with status 500

Domain exceptions (defined in `services/`) map to HTTP codes:
- `NotFoundError` -> 404
- `ForbiddenError` -> 403
- `RateLimitError` -> 429

## Logging Setup
Implements: [spec.md#Logging](./spec.md)

Standard library `logging` with JSON-formatted output. Root logger set to INFO. Log fields: timestamp, level, module, message, request_id (if available), user_id (if available).

`RequestLoggingMiddleware` logs on response: method, path, status_code, duration_ms, user_id.

## Scope

### In Scope
- FastAPI app wiring, middleware, router mounting
- Dependency injection functions
- Configuration class
- Service layer pattern
- Error handling and logging patterns

### Out of Scope
- Individual endpoint implementations (see rest_api/plan.md)
- Auth flow details (see auth/plan.md)
- WebSocket implementation (see websocket/plan.md)
- Database schema (see database/plan.md)
- Worker implementation (see worker/plan.md)

### Assumptions
- Single aiosqlite connection is sufficient (SQLite single-writer constraint)
- JSON logging is acceptable for V1 (no structured log aggregation needed)
