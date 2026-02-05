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
