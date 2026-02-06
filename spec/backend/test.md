---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Backend Test Specification

Tests: [backend/spec.md](./spec.md)

## Scope

### In Scope
- FastAPI application lifecycle (startup, shutdown)
- Middleware stack behavior (CORS, logging, error handling)
- Dependency injection (database sessions, auth, conversation lookup)
- Service layer pattern enforcement
- Configuration loading from environment
- Error response format consistency

### Out of Scope
- Individual endpoint behavior (see rest_api/test.md)
- Authentication logic (see auth/test.md)
- WebSocket behavior (see websocket/test.md)
- Worker pool internals (see worker/test.md)

---

## Test Scenarios

### APP-LIFECYCLE-1: Application startup initializes all subsystems
Tests: [spec.md#Architecture](./spec.md#architecture)

- Scenario: Application starts with valid configuration
- Expected: Worker pool of 4 processes created, SQLite database initialized with all tables, WebSocket manager ready to accept connections
- Edge cases:
  - Missing GEMINI_API_KEY: startup fails with clear error
  - Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET: startup fails
  - Missing DATABASE_URL: defaults to local SQLite path
  - Invalid WORKER_POOL_SIZE (0, negative): startup fails with validation error

### APP-LIFECYCLE-2: Application shutdown cleans up resources
Tests: [spec.md#Background Worker](./spec.md#background-worker)

- Scenario: Application receives shutdown signal
- Expected: Worker pool drained and terminated, database connections closed, active WebSocket connections closed gracefully
- Edge cases:
  - Worker stuck in long query during shutdown: worker killed after grace period
  - Active WebSocket connections: clients receive close frame

### APP-LIFECYCLE-3: Database initialized with WAL mode
Tests: [spec.md#Architecture](./spec.md#architecture)

- Scenario: Application starts and initializes SQLite
- Expected: SQLite WAL mode enabled, all 7 tables exist, all 7 indexes created

---

### MIDDLEWARE-1: CORS headers present on responses
Tests: [spec.md#Communication](./spec.md#communication)

- Scenario: Request from allowed origin
- Expected: Access-Control-Allow-Origin matches request origin, credentials allowed, allowed methods include GET/POST/DELETE/OPTIONS
- Edge cases:
  - Request from disallowed origin: CORS headers absent or origin rejected
  - Preflight OPTIONS request: returns 200 with correct CORS headers
  - CORS_ORIGINS env var with multiple origins: all listed origins accepted

### MIDDLEWARE-2: Request logging captures all requests
Tests: [spec.md#Logging](./spec.md#logging)

- Scenario: Any HTTP request processed
- Expected: Log entry includes method, path, user type (authenticated/unauthenticated), response status, timing
- Edge cases:
  - Failed requests logged with error details
  - WebSocket upgrade requests logged

### MIDDLEWARE-3: Unhandled exceptions return consistent error format
Tests: [spec.md#Communication](./spec.md#communication)

- Scenario: Unhandled exception raised during request processing
- Expected: Response is 500 with body `{ "error": "Internal server error", "details": ... }`, error logged with stack trace
- Edge cases:
  - Exception in middleware itself: still returns 500 JSON
  - Exception during streaming response: connection closed, error logged

---

### DEPS-1: get_db dependency provides database session
Tests: [spec.md#Architecture](./spec.md#architecture)

- Scenario: Endpoint that depends on get_db is called
- Expected: Receives a valid SQLite database session, session closed after request completes
- Edge cases:
  - Exception during request: session still closed (no leaked connections)

### DEPS-2: get_current_user dependency validates session
Tests: [spec.md#Authentication](./spec.md#authentication)

- Scenario: Endpoint with get_current_user dependency called with valid session cookie
- Expected: Returns user object with id, email, name, avatar_url
- Edge cases:
  - No session cookie: raises 401
  - Expired session cookie: raises 401
  - Malformed session cookie: raises 401
  - Valid cookie but session deleted from DB: raises 401

### DEPS-3: get_conversation dependency validates ownership
Tests: [spec.md#Communication](./spec.md#communication)

- Scenario: Endpoint with get_conversation dependency called with valid conversation ID
- Expected: Returns conversation object, confirms current user owns it
- Edge cases:
  - Conversation does not exist: raises 404
  - Conversation owned by different user: raises 403

---

### SERVICE-1: Router-to-service separation enforced
Tests: [spec.md#Architecture](./spec.md#architecture)

- Scenario: Any endpoint handler is invoked
- Expected: Router delegates to service layer, service layer handles business logic, service layer calls database layer
- Edge cases:
  - Service layer error propagated as appropriate HTTP status

---

### CONFIG-1: All environment variables loaded at startup
Tests: [spec.md#Configuration](./spec.md#configuration)

- Scenario: Application starts with all required env vars set
- Expected: GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL, CORS_ORIGINS, TOKEN_LIMIT, WORKER_MEMORY_LIMIT, WORKER_POOL_SIZE all loaded
- Edge cases:
  - TOKEN_LIMIT not set: defaults to 5,000,000
  - WORKER_POOL_SIZE not set: defaults to 4
  - WORKER_MEMORY_LIMIT not set: defaults to 2GB
  - CORS_ORIGINS empty: no origins allowed

### CONFIG-2: Invalid configuration rejected at startup
Tests: [spec.md#Configuration](./spec.md#configuration)

- Scenario: Required environment variable missing
- Expected: Application fails to start with descriptive error naming the missing variable
- Edge cases:
  - Non-numeric WORKER_POOL_SIZE: startup fails with descriptive error
  - Non-numeric TOKEN_LIMIT: startup fails with descriptive error

---

### ERROR-FORMAT-1: All error responses share consistent structure
Tests: [spec.md#Communication](./spec.md#communication)

- Scenario: Any endpoint returns an error (400, 401, 403, 404, 429, 500)
- Expected: Response body is JSON with `error` (string, always present) and optional `details` (string)
- Edge cases:
  - Validation errors include details about which field failed
  - 500 errors do not leak internal stack traces in production
