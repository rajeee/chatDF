---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# ChatDF - Test Plan (Overall Architecture)

## Testing Framework Stack

| Layer | Framework | Rationale |
|-------|-----------|-----------|
| Backend unit/integration | **pytest** + **pytest-asyncio** | Native async support, fixture system, wide ecosystem |
| Frontend unit/integration | **Vitest** + **React Testing Library** | Vite-native, fast HMR-aware runner, RTL encourages testing behavior over implementation |
| E2E | **Playwright** | Cross-browser, auto-waiting, built-in WebSocket interception |
| Coverage | **pytest-cov** (backend), **vitest --coverage** with **v8** (frontend) | Native integration with each runner |
| Mocking (backend) | **unittest.mock** + **pytest-httpx** | stdlib mocks for services, httpx mocking for external HTTP calls |
| Mocking (frontend) | **MSW (Mock Service Worker)** | Intercepts fetch/WebSocket at the network level, works in browser and Node |

## Test Directory Structure

Tests live inside their respective projects so they share the same environment,
dependencies, and toolchain configuration (no cross-project path hacks).

```
implementation/
├── backend/
│   └── tests/                             # pytest (uv run pytest tests/)
│       ├── conftest.py                    # Shared fixtures: test DB, test client, mock user
│       ├── test_app_lifecycle.py          # APP-LIFECYCLE-*, MIDDLEWARE-*, CONFIG-*
│       ├── test_dependencies.py           # DEPS-*
│       ├── auth/
│       │   ├── conftest.py               # OAuth mock fixtures, referral key fixtures
│       │   ├── test_oauth.py             # OAUTH-*
│       │   ├── test_referral.py          # REFERRAL-*
│       │   ├── test_session.py           # SESSION-*
│       │   ├── test_logout.py            # LOGOUT-*
│       │   └── test_security.py          # UNAUTH-*, SECURITY-*
│       ├── database/
│       │   ├── conftest.py               # Fresh DB fixture
│       │   ├── test_schema.py            # SCHEMA-*
│       │   ├── test_indexes.py           # INDEX-*
│       │   ├── test_foreign_keys.py      # FK-*, CASCADE-*
│       │   ├── test_constraints.py       # CHECK-*, UUID-*, TS-*, WAL-*
│       │   └── test_cascade.py           # CASCADE-*
│       ├── dataset_handling/
│       │   ├── conftest.py               # Mock worker pool, sample parquet URLs
│       │   ├── test_validation.py        # VALIDATE-*
│       │   ├── test_naming.py            # NAME-*
│       │   ├── test_duplicates.py        # DUP-*
│       │   ├── test_limits.py            # LIMIT-*
│       │   ├── test_cache.py             # CACHE-*
│       │   ├── test_removal.py           # REMOVE-*
│       │   ├── test_auto_load.py         # AUTO-*
│       │   └── test_sources.py           # SOURCE-*, FAIL-QUERY-*
│       ├── llm/
│       │   ├── conftest.py               # Mock Gemini client, mock worker pool
│       │   ├── test_system_prompt.py     # PROMPT-*
│       │   ├── test_tool_calls.py        # TOOL-*
│       │   ├── test_streaming.py         # STREAM-*
│       │   ├── test_error_correction.py  # ERR-CORRECT-*
│       │   ├── test_token_counting.py    # TOKEN-*
│       │   └── test_context.py           # CONTEXT-*, EDGE-*
│       ├── rate_limiting/
│       │   ├── conftest.py               # Token usage seeding fixture
│       │   ├── test_window.py            # WINDOW-*
│       │   ├── test_under_limit.py       # UNDER-*
│       │   ├── test_warning.py           # WARN-*
│       │   ├── test_exceeded.py          # EXCEED-*
│       │   ├── test_allowed.py           # ALLOWED-*
│       │   └── test_reset.py             # RESET-*, CLOCK-*
│       ├── rest_api/
│       │   ├── conftest.py               # Authenticated test client fixture
│       │   ├── test_auth_endpoints.py    # AUTH-EP-*
│       │   ├── test_conversation_endpoints.py  # CONV-EP-*
│       │   ├── test_chat_endpoints.py    # CHAT-EP-*
│       │   ├── test_dataset_endpoints.py # DS-EP-*
│       │   ├── test_usage_endpoints.py   # USAGE-EP-*
│       │   └── test_cross_cutting.py     # CROSS-*
│       ├── websocket/
│       │   ├── conftest.py               # WebSocket test client helper
│       │   ├── test_connection.py        # WS-CONN-*
│       │   ├── test_heartbeat.py         # WS-HB-*
│       │   ├── test_reconnection.py      # WS-RECON-*
│       │   ├── test_messages.py          # WS-MSG-*
│       │   ├── test_errors.py            # WS-ERR-*, WS-UNK-*
│       │   └── test_cleanup.py           # WS-CLEAN-*
│       └── worker/
│           ├── conftest.py               # Worker pool fixture, sample parquet fixtures
│           ├── test_pool.py              # POOL-*
│           ├── test_fetch.py             # FETCH-*
│           ├── test_schema.py            # SCHEMA-*
│           ├── test_sql.py               # SQL-*
│           ├── test_timeout.py           # TIMEOUT-*
│           ├── test_memory.py            # MEM-*
│           ├── test_errors.py            # ERR-*
│           ├── test_crash.py             # CRASH-*
│           └── test_queue.py             # QUEUE-*
└── frontend/
    └── tests/                             # Vitest (bun run test) + Playwright (bun run test:e2e)
        ├── setup.ts                       # Vitest global setup (MSW server, cleanup)
        ├── helpers/
        │   ├── render.tsx                 # Custom render with providers (QueryClient, stores, router)
        │   ├── mocks/
        │   │   ├── handlers.ts           # MSW REST endpoint handlers
        │   │   ├── websocket.ts          # MSW WebSocket handler
        │   │   └── data.ts               # Factory functions for test data
        │   └── stores.ts                 # Store preset helpers (pre-seeded states)
        ├── components/
        │   ├── chat-area/
        │   │   ├── ChatArea.test.tsx      # CA-*
        │   │   ├── OnboardingGuide.test.tsx # OB-*
        │   │   ├── MessageList.test.tsx   # ML-*
        │   │   ├── ChatInput.test.tsx     # CI-*
        │   │   ├── SQLPanel.test.tsx      # SP-*
        │   │   ├── DataGrid.test.tsx      # DG-*
        │   │   └── LoadingStates.test.tsx # LS-*
        │   ├── left-panel/
        │   │   ├── LeftPanel.test.tsx     # LP-*
        │   │   ├── ChatHistory.test.tsx   # CH-*
        │   │   ├── Settings.test.tsx      # ST-*
        │   │   ├── UsageStats.test.tsx    # US-*
        │   │   └── Account.test.tsx       # AC-*
        │   └── right-panel/
        │       ├── RightPanel.test.tsx    # RP-*
        │       ├── DatasetInput.test.tsx  # DI-*
        │       ├── DatasetCard.test.tsx   # DC-*
        │       └── SchemaModal.test.tsx   # SM-*
        ├── layout/
        │   ├── Layout.test.tsx            # FE-L-*
        │   ├── Routing.test.tsx           # FE-R-*
        │   └── Responsive.test.tsx        # FE-RL-*
        ├── state/
        │   ├── chatStore.test.ts          # FE-S-* (chat store)
        │   ├── datasetStore.test.ts       # FE-S-* (dataset store)
        │   ├── uiStore.test.ts            # FE-S-* (UI store)
        │   └── websocket.test.ts          # FE-W-*
        ├── theme/
        │   └── Theme.test.tsx             # FE-T-*, TH-*
        └── e2e/
            ├── fixtures/
            │   ├── auth.ts                # Login helper, session seeding
            │   ├── data.ts                # Sample parquet file server
            │   └── api-mocks.ts           # Gemini API mock for E2E
            ├── auth.spec.ts               # CUF-1, CUF-2, CUF-6
            ├── dataset-loading.spec.ts    # CUF-3
            ├── chat-flow.spec.ts          # CUF-4, CUF-5
            ├── rate-limiting.spec.ts      # CUF-7
            ├── conversation-management.spec.ts # P1-2, P1-9
            ├── error-recovery.spec.ts     # P1-3, P1-4, P1-6
            └── cross-cutting.spec.ts      # CC-1 through CC-6
```

## Test Data Strategy

### Backend Fixtures (pytest)

**Database fixture** (`conftest.py` at `implementation/backend/tests/`):
- Creates a fresh in-memory SQLite database per test function via `@pytest.fixture`
- Runs `init_db()` to create schema
- Enables WAL mode and foreign keys
- Tears down after each test (connection closed)

**Authenticated user fixture**:
- Inserts a test user into `users` table with known UUID
- Inserts a valid session into `sessions` table
- Returns a `TestClient` with the session cookie pre-set

**Mock factories** (factory functions, not ORM factories):
- `make_user(**overrides) -> dict` — returns a user dict with sensible defaults
- `make_conversation(user_id, **overrides) -> dict`
- `make_message(conversation_id, **overrides) -> dict`
- `make_dataset(conversation_id, **overrides) -> dict`
- `make_token_usage(user_id, **overrides) -> dict`
- `make_referral_key(**overrides) -> dict`

Each factory generates a UUID for `id` and ISO 8601 timestamps. Overrides allow tests to set specific values.

### Frontend Test Data (MSW + factories)

**MSW handlers** (`implementation/frontend/tests/helpers/mocks/handlers.ts`):
- Default REST handlers that return successful responses for all endpoints
- Individual tests override specific handlers to test error paths

**Data factories** (`implementation/frontend/tests/helpers/mocks/data.ts`):
- `createUser(overrides?)` — returns `UserResponse` shape
- `createConversation(overrides?)` — returns `ConversationSummary` shape
- `createMessage(overrides?)` — returns `MessageResponse` shape
- `createDataset(overrides?)` — returns `DatasetResponse` shape
- `createUsageStats(overrides?)` — returns `UsageResponse` shape

### E2E Test Data

**Sample parquet files**: Small (10-100 rows) parquet test fixtures committed to `implementation/frontend/tests/e2e/fixtures/`. Served by a local static file server during tests.

**Gemini API mock**: E2E tests mock the Gemini API at the network level using Playwright's `page.route()` to intercept outbound requests from the backend. Returns canned streaming responses with predictable tool calls.

**Database seeding**: E2E `auth.ts` fixture seeds the database directly (via API calls or direct SQLite manipulation in the test setup) to create users, sessions, and referral keys.

## Mocking Strategy

### What Gets Mocked

| Component | Mock In | Real In |
|-----------|---------|---------|
| SQLite database | never | unit, integration, E2E (in-memory for unit/integration) |
| Google OAuth (Authlib) | unit, integration, E2E | never (no real Google calls) |
| Gemini API | unit, integration | select E2E (canned responses) |
| Worker pool | unit (LLM, dataset service tests) | integration, E2E |
| HTTP calls to parquet URLs | unit, integration | E2E (local file server) |
| WebSocket | unit (frontend) | integration, E2E |
| Browser APIs (localStorage, clipboard) | unit (frontend, via jsdom) | E2E (real browser) |

### Mock Boundaries

- **Backend unit tests**: Mock at service boundaries. Test one service at a time, mock its dependencies (other services, worker pool, external APIs).
- **Backend integration tests**: Real database, real service-to-service calls. Mock only external systems (Gemini, remote URLs).
- **Frontend unit tests**: MSW intercepts network calls. Real Zustand stores, real React component rendering. Mock WebSocket via MSW.
- **E2E tests**: Real frontend, real backend, real database. Mock only Gemini API and use local parquet file server.

## Test Naming Convention

### Backend (pytest)

```python
# File: test_{domain}.py
# Function: test_{SCENARIO_ID}_{brief_description}

def test_OAUTH_1_initiate_google_flow(client, mock_oauth):
    ...

def test_SESSION_4_expired_session_returns_401(db, expired_session):
    ...
```

Each test function name starts with the test spec scenario ID for traceability.

### Frontend (Vitest)

```typescript
// File: {Component}.test.tsx
// describe block: component name
// it block: {SCENARIO_ID} - {brief description}

describe("ChatInput", () => {
  it("CI-SEND-1 - sends message on Enter key", () => { ... });
  it("CI-SEND-2 - does not send empty message", () => { ... });
});
```

### E2E (Playwright)

```typescript
// File: {flow}.spec.ts
// test.describe: flow name
// test: {CUF/P1/P2 ID} - {brief description}

test.describe("Dataset Loading", () => {
  test("CUF-3 - load dataset by URL", async ({ page }) => { ... });
});
```

## Coverage Targets

| Layer | Target | Measurement |
|-------|--------|-------------|
| Backend unit | 90% line coverage | pytest-cov with `--cov-fail-under=90` |
| Backend integration | Critical paths covered (all P0 scenarios) | Manual review |
| Frontend unit | 85% line coverage | vitest --coverage with v8 provider |
| E2E | All 7 CUF scenarios + all CC scenarios | Scenario count |

Coverage is measured per module, not as a single aggregate number. This prevents high coverage in one area from masking gaps in another.

## Test Execution

### Local Development

```bash
# Backend unit + integration (from implementation/backend/)
uv run pytest tests/ -v --cov=app --cov-report=term-missing

# Frontend unit (from implementation/frontend/)
bun run test

# E2E (from implementation/frontend/ — webServer config starts backend automatically)
bun run test:e2e
```

### Parallel Execution

- **pytest**: Uses `pytest-xdist` for parallel test execution across CPU cores. Each worker gets its own in-memory database.
- **Vitest**: Runs test files in parallel by default (each file gets isolated worker thread).
- **Playwright**: Runs spec files in parallel with `fullyParallel: true` in config. Each test gets a fresh browser context.

### Test Isolation

- Backend tests: Each test gets a fresh in-memory SQLite database via fixture. No shared state between tests.
- Frontend tests: Each test gets fresh Zustand stores (stores reset in `beforeEach`), fresh MSW handlers, and a fresh `QueryClient`.
- E2E tests: Each test gets a fresh browser context. Database reseeded per test via fixture.

## Subsystem Test Plans

- [Backend Test Plan](./backend/test_plan.md)
- [Frontend Test Plan](./frontend/test_plan.md)

### Backend Subsystem Test Plans
- [Auth Test Plan](./backend/auth/test_plan.md)
- [Database Test Plan](./backend/database/test_plan.md)
- [Dataset Handling Test Plan](./backend/dataset_handling/test_plan.md)
- [LLM Test Plan](./backend/llm/test_plan.md)
- [Rate Limiting Test Plan](./backend/rate_limiting/test_plan.md)
- [REST API Test Plan](./backend/rest_api/test_plan.md)
- [WebSocket Test Plan](./backend/websocket/test_plan.md)
- [Worker Test Plan](./backend/worker/test_plan.md)

### Frontend Subsystem Test Plans
- [Chat Area Test Plan](./frontend/chat_area/test_plan.md)
- [Left Panel Test Plan](./frontend/left_panel/test_plan.md)
- [Right Panel Test Plan](./frontend/right_panel/test_plan.md)

## Scope

### In Scope
- Test framework and tooling choices
- Directory structure and naming conventions
- Mocking strategy and boundaries
- Test data management approach
- Coverage targets
- Test execution and parallelization

### Out of Scope
- CI/CD pipeline configuration
- Performance and load testing
- Browser compatibility testing
- Deployment verification tests

### Assumptions
- All tests run against a local development environment
- In-memory SQLite is sufficient for backend test isolation
- MSW provides adequate network-level mocking for frontend tests
- Playwright tests can intercept backend-to-Gemini API calls via route interception
