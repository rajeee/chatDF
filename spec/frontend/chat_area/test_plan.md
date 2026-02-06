---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Chat Area Test Plan

## Test Files

| File | Test Spec Scenarios | Component Under Test |
|------|-------------------|---------------------|
| `ChatArea.test.tsx` | CA-* | `ChatArea.tsx` |
| `OnboardingGuide.test.tsx` | OB-* | `OnboardingGuide.tsx` |
| `MessageList.test.tsx` | ML-* | `MessageList.tsx` |
| `ChatInput.test.tsx` | CI-* | `ChatInput.tsx` |
| `SQLPanel.test.tsx` | SP-* | `SQLPanel.tsx` |
| `DataGrid.test.tsx` | DG-* | `DataGrid.tsx` |
| `LoadingStates.test.tsx` | LS-* | `LoadingStates.tsx` |

## ChatArea Tests (`ChatArea.test.tsx`)

Tests: [test.md#CA-STATE-1 through CA-STATE-5](./test.md)

| Scenario | Approach |
|----------|----------|
| CA-STATE-1 (no datasets) | Set `datasetStore.datasets = []`. Render `ChatArea`. Assert `OnboardingGuide` visible. |
| CA-STATE-2 (datasets, no messages) | Set datasets loaded, no messages. Assert onboarding hidden, message list empty, chat input enabled. |
| CA-STATE-3 (active conversation) | Set datasets and messages. Assert `MessageList` renders all messages. |
| CA-STATE-4 (streaming) | Set `chatStore.isStreaming = true`. Assert loading indicator visible. |
| CA-STATE-5 (loading) | Set `chatStore.isLoading = true`. Assert loading state shown. |

## Onboarding Tests (`OnboardingGuide.test.tsx`)

Tests: [test.md#OB-DISPLAY-1 through OB-PROMPT-2](./test.md)

| Scenario | Approach |
|----------|----------|
| OB-DISPLAY-1 | Render with no datasets, no messages. Assert onboarding guide visible with expected tutorial text. |
| OB-DISPLAY-2 | Render with 1 dataset loaded. Assert onboarding hidden. |
| OB-SAMPLE-1 | Click "Try with sample data" button. Assert POST to `/conversations/:id/datasets` called with sample URL. Assert button shows loading spinner. |
| OB-PROMPT-1 | Assert example prompt chips rendered (check for expected text content). |
| OB-PROMPT-2 | Click an example prompt chip. Assert `POST /conversations/:id/messages` called with that prompt text. |

## MessageList Tests (`MessageList.test.tsx`)

Tests: [test.md#ML-LAYOUT-1 through ML-ACTION-2](./test.md)

| Scenario | Approach |
|----------|----------|
| ML-LAYOUT-1 | Render with 5 messages (alternating user/assistant). Assert user messages right-aligned (`text-align: right` or flex `justify-end`), assistant left-aligned. |
| ML-LAYOUT-2 | Render with an assistant message containing markdown (`**bold**`, `\`code\``). Assert rendered as HTML (`<strong>`, `<code>`). |
| ML-STREAM-1 | Set `isStreaming = true` with `streamingContent = "partial"`. Assert streaming indicator visible with partial text. |
| ML-STREAM-2 | Render with 20 messages. Assert container scrolled to bottom. Add new message. Assert auto-scrolled. |
| ML-ACTION-1 | Hover over an assistant message. Assert "Copy" button appears. Click it. Assert `navigator.clipboard.writeText` called with message content. |
| ML-ACTION-2 | Render message with `sql_query`. Assert "Show SQL" button visible. Click it. Assert `uiStore.sqlPanelOpen` set to `true`. |

**Clipboard mock**: Mock `navigator.clipboard.writeText` via `vi.fn()`.

**Auto-scroll**: Use `Element.scrollIntoView` mock or check `scrollTop` relative to `scrollHeight`.

## ChatInput Tests (`ChatInput.test.tsx`)

Tests: [test.md#CI-SEND-1 through CI-ACCESS-2](./test.md)

| Scenario | Approach |
|----------|----------|
| CI-SEND-1 | Type text, press Enter. Assert `onSend` callback called with text. Assert textarea cleared. |
| CI-SEND-2 | With empty textarea, press Enter. Assert `onSend` NOT called. |
| CI-SEND-3 | Press Shift+Enter. Assert newline inserted, `onSend` NOT called. |
| CI-RESIZE-1 | Type 1 line of text. Assert textarea height is 1 line. Type 5 lines. Assert height grows. Type 6+ lines. Assert height capped, overflow scrolls. |
| CI-STOP-1 | Set `isStreaming = true`. Assert stop button visible (not send button). Click stop. Assert `onStop` called. |
| CI-DISABLED-1 | Set `isStreaming = true`. Assert textarea disabled. |
| CI-DISABLED-2 | Set rate limit exceeded state. Assert placeholder text "Daily limit reached". Assert textarea disabled. |
| CI-LIMIT-1 | Type 1800 characters. Assert character counter visible. Type to 2000. Assert counter turns warning color. Type beyond 2000. Assert input blocked (length stays 2000). |
| CI-ACCESS-1 | Assert textarea has focus on page load (or appropriate aria-label). Assert send button has `aria-label="Send message"`. |
| CI-ACCESS-2 | Set streaming. Assert stop button has `aria-label="Stop generating"`. |

**User event simulation**: Use `@testing-library/user-event` for realistic keyboard interaction:
```ts
const user = userEvent.setup();
await user.type(textarea, "hello");
await user.keyboard("{Enter}");
```

## SQLPanel Tests (`SQLPanel.test.tsx`)

Tests: [test.md#SP-OPEN-1 through SP-COPY-1](./test.md)

| Scenario | Approach |
|----------|----------|
| SP-OPEN-1 | Set `uiStore.sqlPanelOpen = true` with a SQL query. Assert panel visible with SQL text. Assert CodeMirror syntax highlighting applied (check for SQL-specific CSS classes). |
| SP-CLOSE-1 | Click close (X) button. Assert `uiStore.sqlPanelOpen` set to false. |
| SP-CLOSE-2 | Press Escape. Assert panel closes. |
| SP-COPY-1 | Click copy button in SQL panel. Assert `navigator.clipboard.writeText` called with SQL text. Assert "Copied!" feedback shown temporarily. |

**CodeMirror testing**: CodeMirror renders in the DOM as a `contenteditable` div. Assert the SQL text is present in the panel content. Syntax highlighting verified by checking for `cm-keyword` or similar CSS classes.

## DataGrid Tests (`DataGrid.test.tsx`)

Tests: [test.md#DG-HEADER-1 through DG-EMPTY-1](./test.md)

| Scenario | Approach |
|----------|----------|
| DG-HEADER-1 | Render with column data. Assert all column headers visible and match names. |
| DG-SORT-1 | Click a column header. Assert rows reordered. Click again. Assert reverse order. Check for sort indicator (arrow icon). |
| DG-RESIZE-1 | Simulate drag on column resize handle. Assert column width changes. (Use `fireEvent.mouseDown` + `mouseMove` + `mouseUp`.) |
| DG-PAGE-1 | Render with 100 rows. Assert first 50 visible (page 1). Assert pagination controls show "1-50 of 100". Click "Next". Assert rows 51-100 visible. |
| DG-STICKY-1 | Scroll the grid container down. Assert header row remains visible (check `position: sticky`). |
| DG-COPY-1 | Click "Copy Table" button. Assert `navigator.clipboard.writeText` called with TSV-formatted data. |
| DG-EMPTY-1 | Render with 0 rows. Assert "No results" message. |

**TanStack Table**: The grid uses TanStack Table internally. Tests interact with rendered DOM (column headers, rows, pagination buttons) rather than the table instance.

## LoadingStates Tests (`LoadingStates.test.tsx`)

Tests: [test.md#LS-PHASE-1 through LS-INTERRUPT-1](./test.md)

| Scenario | Approach |
|----------|----------|
| LS-PHASE-1 | Render with `phase="thinking"`. Assert "Thinking" text with animated dots visible. |
| LS-PHASE-2 | Render with `phase="executing"`. Assert "Running query" with spinner visible. |
| LS-PHASE-3 | Render with `phase="formatting"`. Assert "Preparing response" with spinner visible. |
| LS-TIMEOUT-1 | Render with `phase="executing"` and `phaseStartTime` 31 seconds ago. Assert "Taking longer than expected" warning shown. |
| LS-TIMEOUT-2 | Set `phaseStartTime` 61 seconds ago. Assert error state displayed. |
| LS-INTERRUPT-1 | Render loading state, then set `isStreaming = false`. Assert loading indicator removed. |

**Time simulation**: Use `vi.useFakeTimers()` to control elapsed time. Set `phaseStartTime` to a known past timestamp.

## Scope

### In Scope
- All chat area test scenarios from chat_area/test.md
- Component rendering and conditional state display
- User interaction (keyboard, click, drag)
- Store integration (Zustand state drives rendering)
- Clipboard and accessibility assertions

### Out of Scope
- Backend API behavior (MSW provides canned responses)
- WebSocket message handling (tested in state/websocket.test.ts)
- E2E flows (see top-level test_plan.md)
