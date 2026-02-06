---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Backend Test Plan

## Framework Configuration

### pytest Setup

`backend/pyproject.toml` test dependencies:
```
pytest >= 8.0
pytest-asyncio >= 0.24
pytest-cov >= 5.0
pytest-xdist >= 3.5
httpx >= 0.27          # For FastAPI TestClient async support
```

`pytest.ini` / `pyproject.toml` `[tool.pytest.ini_options]`:
```
asyncio_mode = "auto"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
markers = [
    "unit: Unit tests (isolated, mocked dependencies)",
    "integration: Integration tests (real DB, real services)",
    "slow: Tests that take >1s (worker pool, timeouts)",
]
```

### Test Client

Uses `httpx.AsyncClient` with FastAPI's `ASGITransport` for async test support:

```python
from httpx import AsyncClient, ASGITransport
from app.main import app

async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
    response = await client.get("/auth/me")
```

This replaces the synchronous `TestClient` from Starlette, enabling proper async testing of FastAPI endpoints.

## Shared Fixtures (`tests/conftest.py`)

### `db` — Fresh in-memory SQLite database

```python
@pytest.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    await init_db(conn)
    yield conn
    await conn.close()
```

Provides a clean database for every test. Schema created via the same `init_db()` used in production.

### `test_user` — Pre-seeded user record

```python
@pytest.fixture
async def test_user(db):
    user = make_user()
    await insert_user(db, user)
    return user
```

### `test_session` — Valid session for `test_user`

```python
@pytest.fixture
async def test_session(db, test_user):
    session = make_session(user_id=test_user["id"])
    await insert_session(db, session)
    return session
```

### `authed_client` — HTTP client with session cookie

```python
@pytest.fixture
async def authed_client(db, test_session):
    app.state.db = db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        cookies={"session_token": test_session["id"]}
    ) as client:
        yield client
```

### `mock_worker_pool` — Mocked worker pool

```python
@pytest.fixture
def mock_worker_pool():
    pool = AsyncMock()
    pool.validate_url = AsyncMock(return_value={"valid": True})
    pool.get_schema = AsyncMock(return_value={"columns": [...], "row_count": 100})
    pool.run_query = AsyncMock(return_value={"rows": [...], "columns": [...], "total_rows": 10})
    return pool
```

### Factory Functions (`tests/factories.py`)

```python
def make_user(**overrides) -> dict:
    defaults = {
        "id": str(uuid4()),
        "google_id": f"google_{uuid4().hex[:8]}",
        "email": f"user_{uuid4().hex[:6]}@test.com",
        "name": "Test User",
        "avatar_url": None,
        "created_at": datetime.utcnow().isoformat(),
        "last_login_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **overrides}
```

Similar factories for `make_session`, `make_conversation`, `make_message`, `make_dataset`, `make_token_usage`, `make_referral_key`.

## Test Organization by Scenario

### APP-LIFECYCLE tests (`test_app_lifecycle.py`)

Tests: [test.md#APP-LIFECYCLE-1,2,3](./test.md)

- **APP-LIFECYCLE-1**: Override app lifespan to use in-memory DB. Assert tables exist, worker pool started with expected size.
- **APP-LIFECYCLE-2**: Test shutdown by triggering lifespan exit. Assert worker pool terminated, DB connection closed.
- **APP-LIFECYCLE-3**: After `init_db`, query `PRAGMA journal_mode` and assert WAL. Query `sqlite_master` for all 7 tables and 7 indexes.
- **Config failure tests**: Set env vars to invalid values via `monkeypatch`, assert app startup raises `ValidationError`.

### MIDDLEWARE tests (`test_app_lifecycle.py`)

Tests: [test.md#MIDDLEWARE-1,2,3](./test.md)

- **MIDDLEWARE-1**: Send request with `Origin` header matching `CORS_ORIGINS`. Assert `Access-Control-Allow-Origin` in response.
- **MIDDLEWARE-2**: Verify logging output by capturing log records with `caplog` fixture. Assert method, path, status logged.
- **MIDDLEWARE-3**: Inject a route that raises an exception. Assert 500 response with `{"error": "Internal server error"}` format.

### DEPS tests (`test_dependencies.py`)

Tests: [test.md#DEPS-1,2,3](./test.md)

- **DEPS-1**: Call an endpoint that uses `Depends(get_db)`. Assert no exception, response successful.
- **DEPS-2**: Test `get_current_user` with valid cookie, expired cookie, missing cookie, and malformed cookie. Assert user returned or 401 raised.
- **DEPS-3**: Test `get_conversation` with valid ownership, wrong ownership (403), and nonexistent ID (404).

### CONFIG tests (`test_app_lifecycle.py`)

Tests: [test.md#CONFIG-1,2](./test.md)

- Use `monkeypatch` to set/unset environment variables
- Assert defaults applied when optional vars missing
- Assert startup failure when required vars missing

### ERROR-FORMAT tests (`test_app_lifecycle.py`)

Tests: [test.md#ERROR-FORMAT-1](./test.md)

- Trigger each HTTP error code (400, 401, 403, 404, 429, 500) via appropriate test actions
- Assert response body has `error` key and optionally `details`

## Subsystem Test Plans

Each backend subsystem has its own detailed test plan:

- [Auth Test Plan](./auth/test_plan.md) — OAuth, sessions, referral keys, security
- [Database Test Plan](./database/test_plan.md) — Schema, indexes, constraints, cascades
- [Dataset Handling Test Plan](./dataset_handling/test_plan.md) — Validation pipeline, naming, limits
- [LLM Test Plan](./llm/test_plan.md) — System prompt, tool calls, streaming, token counting
- [Rate Limiting Test Plan](./rate_limiting/test_plan.md) — Rolling window, warning, exceeded states
- [REST API Test Plan](./rest_api/test_plan.md) — All endpoint request/response validation
- [WebSocket Test Plan](./websocket/test_plan.md) — Connection, messages, heartbeat, reconnection
- [Worker Test Plan](./worker/test_plan.md) — Pool lifecycle, SQL execution, resource limits

## Scope

### In Scope
- pytest configuration and async test setup
- Shared fixture definitions and factory functions
- Test organization for top-level backend scenarios
- Links to subsystem test plans

### Out of Scope
- Subsystem-specific test implementations (see individual test plans)
- E2E test setup (see top-level test_plan.md)
- Frontend test architecture (see frontend/test_plan.md)
