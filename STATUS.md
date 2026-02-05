# Project Status

> Last updated: 2026-02-05

## Current Phase: Planning (Phase 2) 🔄

All specs approved (Gate G1 complete). Technical plans generated, awaiting human review for Gate G2.

---

## Phase Progress

| Area | Spec | Plan | Test Spec | Test Plan | Tests | Implement |
|------|:----:|:----:|:---------:|:---------:|:-----:|:---------:|
| **Main/Overall** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Frontend** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Frontend/Left Panel** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Frontend/Chat Area** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Frontend/Right Panel** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Frontend/Theme** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/Auth** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/REST API** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/WebSocket** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/Worker** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/LLM** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/Rate Limiting** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/Dataset Handling** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| **Backend/Database** | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |

**Legend**: ✅ Approved | 🔄 In Review | ⬜ Not Started | ❌ Blocked

---

## Technology Stack (from spec/plan.md)

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS |
| State (client) | Zustand |
| State (server) | TanStack Query |
| Data Grid | TanStack Table |
| SQL Highlight | CodeMirror 6 |
| Backend | FastAPI (Python 3.12+), Uvicorn |
| Database | SQLite via aiosqlite |
| Data Engine | Polars |
| LLM | Google Gemini 2.5 Flash (google-genai SDK) |
| Auth | Authlib (Google OAuth 2.0) |
| Workers | Python multiprocessing (4 workers) |
| Testing | Vitest (frontend), pytest (backend), Playwright (E2E) |

---

## Plan Files (28 total, all in review)

### Top-Level
- spec/plan.md — Overall stack, project structure, architecture decisions

### Frontend (19 plans)
- spec/frontend/plan.md — Component hierarchy, state management, routing, layout
- spec/frontend/left_panel/plan.md — Collapsible panel, collapse animation
- spec/frontend/left_panel/chat_history/plan.md — TanStack Query, list, rename, delete
- spec/frontend/left_panel/settings/plan.md — Theme toggle, clear history, about/help
- spec/frontend/left_panel/usage_stats/plan.md — Progress bar, TanStack Query + WebSocket hybrid
- spec/frontend/left_panel/account/plan.md — User info, sign-out, sign-in page
- spec/frontend/chat_area/plan.md — Layout composition, conditional rendering
- spec/frontend/chat_area/onboarding/plan.md — Empty state, sample dataset, example prompts
- spec/frontend/chat_area/message_list/plan.md — Rendering, auto-scroll, streaming, react-markdown
- spec/frontend/chat_area/chat_input/plan.md — Textarea, keyboard shortcuts, send/stop
- spec/frontend/chat_area/sql_panel/plan.md — CodeMirror 6, slide animation, copy
- spec/frontend/chat_area/data_grid/plan.md — TanStack Table, sort, resize, pagination
- spec/frontend/chat_area/loading_states/plan.md — Three phases, timeout detection
- spec/frontend/right_panel/plan.md — Always-visible, dataset list
- spec/frontend/right_panel/dataset_input/plan.md — URL field, validation, POST
- spec/frontend/right_panel/dataset_card/plan.md — Three states, WebSocket updates
- spec/frontend/right_panel/schema_modal/plan.md — Editable name, column list, refresh
- spec/frontend/theme/plan.md — CSS variables, Tailwind dark mode, useTheme hook

### Backend (8 plans)
- spec/backend/plan.md — FastAPI structure, routers, services, middleware
- spec/backend/auth/plan.md — Authlib OAuth, session management, referral keys
- spec/backend/rest_api/plan.md — Router files, Pydantic models, error format
- spec/backend/websocket/plan.md — ConnectionManager, message factories, heartbeat
- spec/backend/worker/plan.md — multiprocessing.Pool, worker functions, resource limits
- spec/backend/llm/plan.md — Gemini SDK, tool calling, streaming, token counting
- spec/backend/rate_limiting/plan.md — Rolling 24h window, check/record functions
- spec/backend/dataset_handling/plan.md — Validation pipeline, auto-naming, CRUD
- spec/backend/database/plan.md — aiosqlite, schema init, connection lifecycle

---

## Next Actions

1. **Human reviews plans** — Review all 28 plan files for Gate G2 approval
2. **Approve plans** — Mark plans as approved (Gate G2)
3. **Generate test specs** — AI + Human define what to test (Phase 3)

---

## Gate History

| Gate | Date | Decision | Notes |
|------|------|----------|-------|
| G1 (Spec approval) | 2026-02-05 | ✅ Approved | All specs (high-level + 24 component) approved |
| G2 (Plan approval) | - | 🔄 In Review | 28 plan files generated, awaiting human review |
| G3 (Test Spec → Test Plan) | - | ⏳ Pending | - |
| G4 (Test Plan → Tests) | - | ⏳ Pending | - |
| G5 (Plan → Beads) | - | ⏳ Pending | - |
