---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# ChatDF - Technical Plan

## Technology Stack

### Frontend
| Choice | Rationale |
|--------|-----------|
| **React 18** + TypeScript | Component model fits the three-panel layout; TypeScript catches interface mismatches early |
| **Vite** | Fast dev server with HMR; native ESM; simple config |
| **Zustand** | Lightweight state management — simpler than Redux for a single-user app with no complex state machines |
| **TanStack Query** | Server state (conversations, usage) — handles caching, refetching, loading/error states |
| **TanStack Table** | Headless table library for the data grid — supports sorting, resizing, pagination |
| **Tailwind CSS** | Utility-first styling with built-in dark mode support via `class` strategy; CSS variables for theme tokens |
| **React Router v7** | Minimal routing: sign-in page vs. app shell |
| **CodeMirror 6** | SQL syntax highlighting in the SQL panel (lightweight, extensible) |
| **native WebSocket** | Browser WebSocket API with a thin wrapper — no need for Socket.IO given server-push-only pattern |

### Backend
| Choice | Rationale |
|--------|-----------|
| **FastAPI** (Python 3.12+) | Async by default; WebSocket support built-in; Pydantic for request validation |
| **Uvicorn** | ASGI server for FastAPI |
| **aiosqlite** | Async SQLite access from FastAPI async handlers |
| **Polars** | Specified in spec — lazy evaluation, SQL engine, parquet support |
| **google-genai** | Official Google Generative AI SDK for Gemini |
| **multiprocessing** | Worker pool — stdlib, no external dependency |
| **Authlib** | Google OAuth 2.0 library — handles token exchange, CSRF state |
| **Pydantic** | Request/response validation and serialization |
| **python-dotenv** | Environment variable loading |

### Dev & Build
| Choice | Rationale |
|--------|-----------|
| **pnpm** | Frontend package manager |
| **uv** | Python package manager (fast, lockfile support) |
| **pytest** | Backend testing |
| **Vitest** | Frontend unit/integration testing |
| **Playwright** | E2E testing |
| **ESLint + Prettier** | Frontend code quality |
| **Ruff** | Python linting and formatting |

## Project Structure

```
chatdf/
├── frontend/                        # React app
│   ├── src/
│   │   ├── main.tsx                 # Entry point
│   │   ├── App.tsx                  # Router + layout shell
│   │   ├── components/
│   │   │   ├── left-panel/
│   │   │   │   ├── LeftPanel.tsx
│   │   │   │   ├── ChatHistory.tsx
│   │   │   │   ├── Settings.tsx
│   │   │   │   ├── UsageStats.tsx
│   │   │   │   └── Account.tsx
│   │   │   ├── chat-area/
│   │   │   │   ├── ChatArea.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── SQLPanel.tsx
│   │   │   │   ├── DataGrid.tsx
│   │   │   │   ├── OnboardingGuide.tsx
│   │   │   │   └── LoadingStates.tsx
│   │   │   ├── right-panel/
│   │   │   │   ├── RightPanel.tsx
│   │   │   │   ├── DatasetInput.tsx
│   │   │   │   ├── DatasetCard.tsx
│   │   │   │   └── SchemaModal.tsx
│   │   │   └── auth/
│   │   │       └── SignIn.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts      # WebSocket connection manager
│   │   │   ├── useAuth.ts           # Auth state and actions
│   │   │   ├── useConversation.ts   # Active conversation state
│   │   │   └── useTheme.ts          # Theme mode management
│   │   ├── stores/
│   │   │   ├── chatStore.ts         # Active chat state (messages, streaming)
│   │   │   ├── datasetStore.ts      # Active conversation datasets
│   │   │   └── uiStore.ts           # UI state (panel collapsed, SQL panel open)
│   │   ├── api/
│   │   │   └── client.ts            # TanStack Query + fetch wrapper
│   │   ├── lib/
│   │   │   ├── websocket.ts         # WebSocket class with reconnection
│   │   │   └── constants.ts         # Shared constants
│   │   └── styles/
│   │       ├── globals.css           # Tailwind base + theme CSS variables
│   │       └── tailwind.config.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, CORS, lifespan
│   │   ├── config.py                # Environment config (Pydantic Settings)
│   │   ├── database.py              # SQLite connection + schema init
│   │   ├── models.py                # Pydantic models for API
│   │   ├── dependencies.py          # FastAPI dependencies (get_user, get_db)
│   │   ├── routers/
│   │   │   ├── auth.py              # /auth/* endpoints
│   │   │   ├── conversations.py     # /conversations/* endpoints
│   │   │   ├── datasets.py          # /conversations/:id/datasets/* endpoints
│   │   │   ├── usage.py             # /usage endpoint
│   │   │   └── websocket.py         # WebSocket endpoint
│   │   ├── services/
│   │   │   ├── auth_service.py      # OAuth logic, session management
│   │   │   ├── chat_service.py      # Message processing, LLM orchestration
│   │   │   ├── dataset_service.py   # URL validation, schema caching
│   │   │   ├── llm_service.py       # Gemini API interaction, tool calling
│   │   │   ├── rate_limit_service.py # Token usage tracking, limit checks
│   │   │   └── worker_pool.py       # Worker process management
│   │   └── workers/
│   │       └── data_worker.py       # Worker process entry point
│   ├── pyproject.toml
│   └── .env.example
│
├── tests/
│   ├── frontend/                    # Mirrors frontend/src structure
│   ├── backend/                     # Mirrors backend/app structure
│   └── e2e/                         # Playwright E2E tests
│
└── spec/                            # Specifications and plans (this directory)
```

## Architecture Decisions

### State Management Split
Implements: [spec.md#session-model](./spec.md)

- **Server state** (TanStack Query): Conversations list, user info, usage stats — data that exists on the server and needs caching/refetching.
- **Client state** (Zustand): Active chat messages (including streaming tokens), loaded datasets for current conversation, UI state (panel visibility, SQL panel). Zustand stores are reset when switching conversations.

### WebSocket Architecture
Implements: [backend/websocket/spec.md](./backend/websocket/spec.md)

- Single WebSocket connection per session, managed by `useWebSocket` hook.
- Connection opened after authentication, closed on logout.
- Events dispatched to Zustand stores (e.g., `chat_token` → `chatStore`, `dataset_loaded` → `datasetStore`).
- Reconnection with exponential backoff handled in `websocket.ts` class.

### Worker Communication
Implements: [backend/worker/spec.md](./backend/worker/spec.md)

- `multiprocessing.Pool` with 4 processes started in FastAPI lifespan.
- `apply_async` for non-blocking calls from async handlers.
- Each task gets a unique ID; results matched back to the requesting handler.
- Worker functions are pure: receive data in, return data out. No shared state.

### LLM Orchestration
Implements: [backend/llm/spec.md](./backend/llm/spec.md)

- `chat_service.py` orchestrates the full message flow:
  1. Rate limit check → 2. Build system prompt with dataset schemas → 3. Call Gemini streaming API → 4. Handle tool calls (pause stream, execute via worker, resume) → 5. Record token usage → 6. Send completion event.
- Tool calls executed synchronously within the stream handler (worker pool handles parallelism).
- Max 5 tool calls and 3 SQL retries per turn enforced in the orchestrator.

### Database Access Pattern
Implements: [backend/database/spec.md](./backend/database/spec.md)

- Single `aiosqlite` connection pool (SQLite is single-writer anyway).
- Schema created on first startup via `database.py` init function.
- All database access goes through service layer functions — no raw SQL in routers.
- UUIDs generated via `uuid.uuid4()`, stored as TEXT.

### Authentication Flow
Implements: [backend/auth/spec.md](./backend/auth/spec.md)

- Authlib handles the OAuth dance (redirect URL, token exchange).
- Session token set as httpOnly secure cookie.
- `get_user` FastAPI dependency extracts user from session cookie on every request.
- WebSocket authenticates via session token in query parameter (cookies not reliably sent on WS upgrade).

### Frontend Routing
Implements: [frontend/spec.md](./frontend/spec.md)

Two routes only:
- `/sign-in` — Public. Google OAuth sign-in page with optional referral key field.
- `/` — Protected. Main app shell (three-panel layout). All conversation state managed within this single view via Zustand + URL params for active conversation ID.

### Build & Deployment
- Frontend built as static assets via Vite → served by FastAPI `StaticFiles` mount.
- Single deployment unit: FastAPI serves both API and frontend.
- Dev mode: Vite dev server proxies API requests to FastAPI backend.

## Scope

### In Scope
- All technical decisions for V1 implementation
- File/folder structure for both frontend and backend
- Library selections with rationale
- Architecture patterns and data flow

### Out of Scope
- Deployment infrastructure (Docker, cloud provider)
- CI/CD pipeline configuration
- Monitoring/alerting setup
- Database migrations (V1 uses schema-on-startup)

### Assumptions
- Development on macOS/Linux
- Python 3.12+ available
- Node.js 20+ available
- SQLite 3.35+ (for RETURNING clause support)

### Open Questions
- None — all spec questions resolved in Phase 1
