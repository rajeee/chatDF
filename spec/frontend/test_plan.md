---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Frontend Test Plan

## Framework Configuration

### Vitest Setup

`frontend/vite.config.ts` test configuration:
```ts
test: {
  globals: true,
  environment: "jsdom",
  setupFiles: ["tests/setup.ts"],
  css: true,
  coverage: {
    provider: "v8",
    reporter: ["text", "lcov"],
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["src/main.tsx", "src/**/*.d.ts"],
  },
}
```

### Dependencies

```
@testing-library/react >= 16.0
@testing-library/jest-dom >= 6.0
@testing-library/user-event >= 14.0
msw >= 2.0
jsdom >= 24.0
vitest >= 2.0
```

### Global Setup (`tests/setup.ts`)

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";
import { server } from "./helpers/mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
```

MSW server starts before all tests, resets handlers between tests, and shuts down after all tests. `onUnhandledRequest: "error"` ensures no unintended API calls slip through.

## Custom Render (`tests/helpers/render.tsx`)

Wraps components with all required providers:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  { route = "/", ...options } = {}
) {
  const queryClient = createTestQueryClient();
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  });
}
```

Each test gets a fresh `QueryClient` with retries disabled for deterministic behavior.

## MSW Mock Handlers (`tests/helpers/mocks/handlers.ts`)

Default handlers return successful responses for all endpoints:

```ts
import { http, HttpResponse } from "msw";
import { createUser, createConversationList, createUsageStats } from "./data";

export const handlers = [
  http.get("/auth/me", () => HttpResponse.json(createUser())),
  http.get("/conversations", () => HttpResponse.json({ conversations: createConversationList(3) })),
  http.get("/conversations/:id", ({ params }) => HttpResponse.json(createConversationDetail(params.id))),
  http.post("/conversations", () => HttpResponse.json(createConversation(), { status: 201 })),
  http.delete("/conversations/:id", () => HttpResponse.json({ success: true })),
  http.post("/conversations/:id/messages", () => HttpResponse.json({ message_id: "msg-1", status: "processing" })),
  http.post("/conversations/:id/stop", () => HttpResponse.json({ success: true })),
  http.post("/conversations/:id/datasets", () => HttpResponse.json({ dataset_id: "ds-1", status: "loading" }, { status: 201 })),
  http.delete("/conversations/:id/datasets/:datasetId", () => HttpResponse.json({ success: true })),
  http.get("/usage", () => HttpResponse.json(createUsageStats())),
  http.post("/auth/google", () => HttpResponse.json({ redirect_url: "https://accounts.google.com/..." })),
  http.post("/auth/logout", () => HttpResponse.json({ success: true })),
];
```

Individual tests override specific handlers via `server.use(...)` to test error paths.

## WebSocket Mock (`tests/helpers/mocks/websocket.ts`)

MSW v2 supports WebSocket mocking:

```ts
import { ws } from "msw";

export const chatWs = ws.link("ws://*/ws*");

// Usage in tests:
// chatWs.addEventListener("connection", ({ client }) => {
//   client.send(JSON.stringify({ type: "chat_token", token: "Hello", message_id: "msg-1" }));
// });
```

This allows tests to simulate WebSocket messages (chat_token, dataset_loaded, rate_limit_warning, etc.) without a real server.

## Test Data Factories (`tests/helpers/mocks/data.ts`)

```ts
export function createUser(overrides?: Partial<UserResponse>): UserResponse {
  return {
    user_id: "user-1",
    email: "test@example.com",
    name: "Test User",
    avatar_url: null,
    ...overrides,
  };
}

export function createConversation(overrides?: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: `conv-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Conversation",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dataset_count: 0,
    ...overrides,
  };
}

export function createMessage(overrides?: Partial<MessageResponse>): MessageResponse { ... }
export function createDataset(overrides?: Partial<DatasetResponse>): DatasetResponse { ... }
export function createUsageStats(overrides?: Partial<UsageResponse>): UsageResponse { ... }
```

## Store Presets (`tests/helpers/stores.ts`)

Helper functions to set Zustand stores to specific states before rendering:

```ts
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";

export function resetAllStores() {
  useChatStore.setState(useChatStore.getInitialState());
  useDatasetStore.setState(useDatasetStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
}

export function setChatStreaming(messages, streamingTokens = "") {
  useChatStore.setState({
    messages,
    isStreaming: true,
    streamingContent: streamingTokens,
  });
}

export function setDatasetsLoaded(datasets) {
  useDatasetStore.setState({ datasets });
}
```

Stores are reset in `beforeEach` via the setup file to ensure test isolation.

## Test Organization by Scenario

### Layout Tests (`tests/layout/`)

Tests: [test.md#FE-L-1 through FE-L-3](./test.md)

- **FE-L-1** (Three-panel layout): Render `AppShell`. Assert left panel, chat area, and right panel all present in DOM. Use `getByTestId` or `getByRole`.
- **FE-L-2** (Panel collapse): Click collapse button on left panel. Assert left panel has `width: 0` or `display: none`. Click expand. Assert visible again.
- **FE-L-3** (Panel ordering): Assert DOM order: left panel before chat area before right panel.

### Routing Tests (`tests/layout/Routing.test.tsx`)

Tests: [test.md#FE-R-1 through FE-R-3](./test.md)

- **FE-R-1**: Render at `/`. Override `/auth/me` to return 401. Assert redirect to `/sign-in`.
- **FE-R-2**: Render at `/` with valid auth. Assert `AppShell` rendered.
- **FE-R-3**: Render at `/sign-in` with valid session. Assert redirect to `/`.

### State Management Tests (`tests/state/`)

Tests: [test.md#FE-S-1 through FE-S-4](./test.md)

- **FE-S-1**: Switch conversations (update `activeConversationId`). Assert all Zustand stores reset to initial state.
- **FE-S-2**: Verify TanStack Query caches conversation data. Fetch same conversation twice. Assert second fetch uses cache (no additional network request).
- **FE-S-3**: Simulate WebSocket `chat_token` event. Assert `chatStore.messages` or `streamingContent` updated.
- **FE-S-4**: Simulate WebSocket `dataset_loaded` event. Assert `datasetStore.datasets` updated.

### WebSocket Tests (`tests/state/websocket.test.ts`)

Tests: [test.md#FE-W-1 through FE-W-3](./test.md)

- **FE-W-1**: Initialize WebSocket. Assert connection opened.
- **FE-W-2**: Simulate disconnect. Assert reconnection attempt with exponential backoff. (Mock `setTimeout` or use fake timers.)
- **FE-W-3**: Send unknown message type from server. Assert no error thrown, message silently ignored.

### Theme Tests (`tests/theme/Theme.test.tsx`)

Tests: [test.md#FE-T-1 through FE-T-4](./test.md)

- **FE-T-1**: Set theme to "dark". Assert `document.documentElement.classList.contains("dark")`.
- **FE-T-2**: Set theme to "light". Assert no "dark" class.
- **FE-T-3**: Set theme to "system". Mock `matchMedia` to prefer dark. Assert "dark" class applied.
- **FE-T-4**: Switch theme. Assert `localStorage.getItem("theme")` updated.

### Responsive Tests (`tests/layout/Responsive.test.tsx`)

Tests: [test.md#FE-RL-1 through FE-RL-3](./test.md)

- **FE-RL-1**: Set viewport to 1200px (desktop). Assert left panel expanded by default.
- **FE-RL-2**: Set viewport to 900px (tablet). Assert left panel collapsed by default.
- **FE-RL-3**: At tablet width, click expand. Assert panel opens as overlay with backdrop.

Viewport simulation via `window.innerWidth` mock + resize event dispatch.

## Subsystem Test Plans

- [Chat Area Test Plan](./chat_area/test_plan.md)
- [Left Panel Test Plan](./left_panel/test_plan.md)
- [Right Panel Test Plan](./right_panel/test_plan.md)

## Scope

### In Scope
- Vitest configuration and setup
- Custom render utility with providers
- MSW handler setup (REST + WebSocket)
- Test data factories and store presets
- Top-level layout, routing, state, and theme tests

### Out of Scope
- E2E tests (see top-level test_plan.md)
- Backend API testing (see backend/test_plan.md)
- Component-specific tests (see subsystem test plans)
