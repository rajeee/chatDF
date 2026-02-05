---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Frontend Plan

## Component Hierarchy

Implements: [spec.md#layout](./spec.md#layout)

```
App.tsx
├── <BrowserRouter>
│   ├── Route /sign-in → <SignIn />
│   └── Route / → <ProtectedRoute>
│       └── <AppShell />
│           ├── <Header />              # hamburger toggle, app title
│           └── <main> (CSS Grid)
│               ├── <LeftPanel />
│               ├── <ChatArea />
│               └── <RightPanel />
```

`ProtectedRoute` reads auth state from `useAuth` hook; redirects to `/sign-in` if unauthenticated.

## Routing

Implements: [spec.md#layout](./spec.md#layout), [plan.md#frontend-routing](../plan.md#frontend-routing)

- React Router v7 with two route entries in `App.tsx`.
- `/sign-in` renders `SignIn` component (public).
- `/` renders `AppShell` wrapped in `ProtectedRoute` (requires valid session).
- Active conversation tracked via Zustand (`chatStore.activeConversationId`), not URL params.

## State Management Architecture

Implements: [spec.md (all stateful sections)](./spec.md)

### Zustand Stores (client state)

| Store | File | State | Why Zustand |
|-------|------|-------|-------------|
| `chatStore` | `stores/chatStore.ts` | `activeConversationId`, `messages[]`, `streamingTokens`, `isStreaming` | Rapidly mutated during streaming; local to current view |
| `datasetStore` | `stores/datasetStore.ts` | `datasets[]` for active conversation, loading states per dataset | Mutated by WebSocket events; scoped to active conversation |
| `uiStore` | `stores/uiStore.ts` | `leftPanelOpen`, `sqlPanelOpen`, `activeSqlContent` | Purely local UI toggles |

Stores reset relevant slices when `activeConversationId` changes.

### TanStack Query (server state)

| Query Key | Endpoint | Stale Time | Usage |
|-----------|----------|------------|-------|
| `["conversations"]` | `GET /conversations` | 30s | ChatHistory list |
| `["user"]` | `GET /auth/me` | 5min | Account display, ProtectedRoute |
| `["usage"]` | `GET /usage` | 60s | UsageStats (also updated via WS) |

Mutations: `createConversation`, `deleteConversation`, `renameConversation`, `clearAllConversations`, `addDataset`, `removeDataset`, `sendMessage`. Each mutation invalidates relevant query keys.

## WebSocket Integration

Implements: [../plan.md#websocket-architecture](../plan.md#websocket-architecture)

- `lib/websocket.ts`: class `ChatDFSocket` wrapping native `WebSocket`. Handles connect, reconnect (exponential backoff: 1s, 2s, 4s, max 30s), and message parsing.
- `hooks/useWebSocket.ts`: connects on mount when authenticated, disconnects on unmount/logout. Routes incoming events to Zustand stores:
  - `chat_token` / `chat_complete` / `chat_error` → `chatStore`
  - `dataset_loaded` / `dataset_error` → `datasetStore`
  - `usage_update` / `rate_limit_warning` → `uiStore` (and invalidates `["usage"]` query)
- Auth: session token sent as query param on WS upgrade (`ws://host/ws?token=...`).

## Layout Implementation

Implements: [spec.md#layout](./spec.md#layout), [spec.md#responsive-behavior](./spec.md#responsive-behavior)

CSS Grid on `<main>` inside `AppShell`:

```
grid-template-columns: var(--left-w) 1fr var(--right-w);
```

- `--left-w`: `260px` when open, `0px` when collapsed. Transition on `grid-template-columns` (~200ms).
- `--right-w`: `300px` fixed.
- Left panel uses `overflow: hidden` during collapse to avoid content reflow.

### Responsive Behavior

- Tailwind breakpoint `lg` (1024px) controls default panel state.
- `uiStore.leftPanelOpen` initialized from `localStorage` if present, else `window.innerWidth >= 1024`.
- Below 1024px when expanded: left panel rendered as fixed overlay with backdrop, z-index above main content.

## Theme Implementation

Implements: [spec.md#theme](./spec.md#theme)

- Tailwind `darkMode: "class"` strategy.
- `hooks/useTheme.ts` manages three-way state: `light | dark | system`.
- On mount, reads `localStorage("theme")`. If `system` or absent, reads `prefers-color-scheme` via `matchMedia` listener.
- Applies `dark` class to `<html>` element.
- CSS variables in `styles/globals.css` for semantic tokens (background, surface, text, accent, border) mapped per theme.

## Shared API Client

- `api/client.ts`: thin `fetch` wrapper that includes credentials (`credentials: "include"` for httpOnly cookie). All TanStack Query `queryFn` and `mutationFn` use this wrapper.
- Base URL from `import.meta.env.VITE_API_URL` (dev proxy in `vite.config.ts`).

## Scope

### In Scope
- Component tree and composition strategy
- State management split and store shapes
- Routing, layout grid, responsive approach
- WebSocket event routing
- Theme toggle mechanism

### Out of Scope
- Individual component internals (see child plan files)
- Backend API contract details
- Test strategy

### Assumptions
- Vite dev server proxies `/api/*` and `/ws` to backend at `localhost:8000`
- All API responses follow a consistent JSON envelope (`{ data, error }`)
