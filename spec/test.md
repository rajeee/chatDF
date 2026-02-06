---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# ChatDF - Test Specification

## Test Priority Levels

- **P0 (Critical)**: Must pass for any release. Failures block deployment. Covers core user flows that define the product -- if these fail, the app is unusable.
- **P1 (Important)**: Should pass for release. Failures require triage -- release may proceed with a documented workaround. Covers secondary flows, error recovery, and features that significantly impact UX.
- **P2 (Nice to have)**: Quality-of-life features. Failures do not block release. Covers polish, convenience features, accessibility, and edge-case UX.

---

## Critical User Flows (P0)

### CUF-1: First-Time Sign-Up with Referral Key
Tests: [spec.md#user-types](./spec.md), [backend/auth/spec.md#sign-up-flow](./backend/auth/spec.md)

- **Scenario**: New user visits the app, clicks "Sign in with Google", completes OAuth, enters a valid referral key.
- **Expected**: User account created, referral key marked as used, session cookie set (httpOnly, secure), user lands on main app shell with onboarding guide visible.
- **Edge cases**:
  - No referral key provided: error "Referral key required", user remains on sign-in page.
  - Invalid or already-used referral key: error "Invalid referral key", user not created.
  - Google OAuth cancelled or fails: user returned to sign-in page with no session created.

### CUF-2: Returning User Sign-In
Tests: [spec.md#user-types](./spec.md), [backend/auth/spec.md#google-oauth-flow](./backend/auth/spec.md)

- **Scenario**: Existing user visits the app, clicks "Sign in with Google", completes OAuth.
- **Expected**: No referral key prompt. Session created, cookie set, user lands on main app shell with previous conversations listed in left panel.
- **Edge cases**:
  - Expired session from previous visit: user must re-authenticate, new session created seamlessly.
  - User signs in from different device: new session created; previous session on other device remains valid (per [backend/auth/spec.md#session-management](./backend/auth/spec.md)).

### CUF-3: Load a Dataset by URL
Tests: [spec.md#data-handling](./spec.md), [backend/dataset_handling/spec.md#url-validation-pipeline](./backend/dataset_handling/spec.md), [frontend/right_panel/spec.md](./frontend/right_panel/spec.md)

- **Scenario**: Authenticated user pastes a public parquet URL into the dataset input field in the right panel and clicks "Add".
- **Expected**: Dataset card appears in "loading" state, transitions to "loaded" showing `tableName [rows x cols]` (e.g., `table1 [10,000 x 8]`). Schema cached in database.
- **Edge cases**:
  - Invalid URL format: immediate validation error, no server request made.
  - URL not accessible (404, timeout after 10s): dataset card shows error state with retry option.
  - File is not parquet (bad magic number): error "Not a valid parquet file".
  - Sixth dataset added: rejected with "Maximum 5 datasets reached".
  - Duplicate URL in same conversation: rejected with "This dataset is already loaded".

### CUF-4: Ask a Question and Receive an Answer (Full Round Trip)
Tests: [spec.md#core-user-flow](./spec.md), [backend/llm/spec.md#tool-calling](./backend/llm/spec.md), [backend/worker/spec.md#sql-query-execution](./backend/worker/spec.md)

- **Scenario**: User has at least one dataset loaded. User types a natural language question and presses Enter.
- **Expected**:
  1. User message appears immediately in chat.
  2. Progress indicators display in sequence: "Generating SQL...", "Executing query...", "Formatting response...".
  3. Assistant response streams in token-by-token.
  4. Response includes a "Show SQL" button if SQL was executed.
  5. If result is tabular: interactive data grid with sortable/resizable columns and pagination.
  6. `chat_complete` event received with token count.
- **Edge cases**:
  - Question asked with no datasets loaded: LLM responds suggesting user add a dataset.
  - SQL execution error: LLM retries up to 3 times (per [backend/llm/spec.md#error-self-correction](./backend/llm/spec.md)), then explains the error to user.
  - Query returns >1,000 rows: results truncated to 1,000 rows (not an error), paginated display.
  - Query timeout (>60s): worker killed, error returned to user.

### CUF-5: Streaming Response Display
Tests: [backend/websocket/spec.md#server-to-client-messages](./backend/websocket/spec.md), [backend/llm/spec.md#streaming](./backend/llm/spec.md), [frontend/chat_area/loading_states/spec.md](./frontend/chat_area/loading_states/spec.md)

- **Scenario**: User sends a message that triggers a multi-sentence LLM response.
- **Expected**: Tokens appear incrementally in the chat area as `chat_token` WebSocket messages arrive. Progress phases update in order (generating, executing, formatting). `chat_complete` signals the end of the response with token count.
- **Edge cases**:
  - Tool call mid-stream: stream pauses while SQL executes, then resumes with results.
  - Multiple tool calls in one turn (up to 5): each pause/resume handled smoothly.
  - Stream error: `chat_error` sent, partial response preserved, WebSocket connection maintained.

### CUF-6: Session Persistence Across Page Refresh
Tests: [spec.md#session-model](./spec.md), [backend/auth/spec.md#session-management](./backend/auth/spec.md)

- **Scenario**: User is mid-conversation with datasets loaded, then refreshes the browser.
- **Expected**: User remains authenticated (session cookie valid). Previous conversations visible in history. Active conversation messages and loaded datasets restored via REST `GET /conversations/:id`. WebSocket reconnects automatically (no server-side state replay).
- **Edge cases**:
  - Session expired (>7 days without activity): user redirected to sign-in page.
  - Refresh during active streaming: streaming stops, partial response preserved, user can send a new message.

### CUF-7: Rate Limit Enforcement
Tests: [backend/rate_limiting/spec.md#enforcement](./backend/rate_limiting/spec.md), [backend/rate_limiting/spec.md#exceeded-state](./backend/rate_limiting/spec.md)

- **Scenario**: User approaches and exceeds the 5M token daily limit.
- **Expected**:
  - At 80% usage: `rate_limit_warning` received with `usage_percent` and `remaining_tokens`. Usage stats in left panel update.
  - At 100% usage: next chat request returns 429. `rate_limit_exceeded` sent via WebSocket with `resets_in_seconds`. Chat input placeholder changes to "Daily limit reached", input disabled.
  - Dataset operations (add/remove) and conversation management still work when rate-limited.
- **Edge cases**:
  - Request starts under limit but completion pushes over: request completes (no mid-stream cutoff), next request blocked.
  - Rolling window: tokens from >24 hours ago fall off, user regains capacity without any action.

---

## Cross-Cutting Concerns

### CC-1: Authentication Guard (P0)
Tests: [backend/auth/spec.md#unauthenticated-access](./backend/auth/spec.md)

- All REST endpoints (except OAuth initiation/callback) return 401 for unauthenticated requests.
- WebSocket connection rejected with 401 if session token is missing or invalid.
- Frontend redirects to sign-in page on any 401 response.

### CC-2: Session Security (P0)
Tests: [backend/auth/spec.md#security-considerations](./backend/auth/spec.md)

- Session tokens are httpOnly secure cookies (not accessible via JavaScript).
- OAuth state parameter validated to prevent CSRF on the OAuth flow.
- Origin header validated on WebSocket upgrade.
- No user-provided API keys exposed in any response.

### CC-3: Data Isolation (P0)
Tests: [backend/database/spec.md](./backend/database/spec.md)

- User A cannot access User B's conversations, messages, or datasets.
- All queries scoped by `user_id` at the service layer.
- Conversation datasets not shared across conversations.

### CC-4: Error Message Quality (P1)
Tests: [spec.md#error-handling](./spec.md), [backend/websocket/spec.md#error-handling](./backend/websocket/spec.md)

- All user-facing errors are human-readable (no raw stack traces by default).
- Technical details available via expandable section for debugging.
- Error categories: validation, network, SQL, timeout, memory, rate limit, auth.
- Server errors during chat send `chat_error` via WebSocket without dropping the connection.

### CC-5: Worker Resilience (P1)
Tests: [backend/worker/spec.md#resource-limits](./backend/worker/spec.md)

- Worker crash does not take down the main application.
- Crashed worker automatically restarted.
- Query timeout (60s) kills and restarts the worker process.
- Memory limit exceeded kills and restarts the worker process.

### CC-6: Logging (P1)
Tests: [backend/spec.md#logging](./backend/spec.md)

- All REST requests logged with method, path, and user identifier.
- Query execution timing logged.
- Token usage per request logged.
- Errors logged with stack traces.

---

## Integration Points

### IP-1: Frontend to Backend REST (P0)
Tests: [backend/rest_api/spec.md](./backend/rest_api/spec.md), [backend/spec.md#rest-endpoints](./backend/spec.md)

- All REST endpoints accept and return JSON.
- Session cookie sent automatically with every request.
- Error responses follow consistent format with status codes (400, 401, 404, 422, 429, 500).
- Request bodies validated by Pydantic; malformed requests return 422 with error details.

### IP-2: Frontend to Backend WebSocket (P0)
Tests: [backend/websocket/spec.md](./backend/websocket/spec.md)

- Single WebSocket connection per session.
- Connection authenticated via session token in query parameter.
- All server-push events conform to the documented message types and fields.
- Unknown message types silently ignored by frontend.
- Heartbeat ping/pong every 30 seconds keeps connection alive.

### IP-3: Backend to Gemini LLM (P0)
Tests: [backend/llm/spec.md](./backend/llm/spec.md)

- System prompt dynamically includes all loaded dataset schemas.
- Streaming API used for token-by-token delivery.
- Tool calls (`execute_sql`, `load_dataset`) intercepted and executed by backend.
- Token counts extracted from Gemini response metadata and recorded.
- Max 5 tool calls and 3 SQL retries per turn enforced.

### IP-4: Backend to Worker Pool (P1)
Tests: [backend/worker/spec.md](./backend/worker/spec.md)

- Workers receive structured requests and return structured responses.
- Worker errors returned as structured error objects (not raw exceptions).
- Workers are stateless -- crash recovery requires no state restoration.
- Pool of 4 workers distributes load via work-stealing (`multiprocessing.Pool` default).

### IP-5: Backend to SQLite (P1)
Tests: [backend/database/spec.md](./backend/database/spec.md)

- Schema created on first startup.
- All database access via service layer (no raw SQL in routers).
- Async access via aiosqlite.
- UUIDs used for all primary keys.

---

## Secondary Flows (P1)

### P1-1: Multiple Datasets in One Conversation
Tests: [backend/dataset_handling/spec.md#auto-naming](./backend/dataset_handling/spec.md), [backend/llm/spec.md#system-prompt](./backend/llm/spec.md)

- **Scenario**: User loads 3 datasets, then asks a question requiring a join across two of them.
- **Expected**: All dataset schemas in LLM system prompt. LLM generates cross-table SQL. Query executes and returns joined results. Auto-naming assigns `table1`, `table2`, `table3`.
- **Edge cases**:
  - User renames a table via schema modal: subsequent queries use the new name.
  - Dataset removed mid-conversation: next LLM turn excludes removed dataset's schema.

### P1-2: Conversation History Navigation
Tests: [frontend/left_panel/chat_history/spec.md](./frontend/left_panel/chat_history/spec.md), [backend/spec.md#rest-endpoints](./backend/spec.md)

- **Scenario**: User has multiple conversations. User clicks a previous conversation in the left panel.
- **Expected**: Chat area loads selected conversation's messages. Right panel shows that conversation's datasets. Active conversation highlighted in history.
- **Edge cases**:
  - Delete a conversation from history: removed from list; if it was active, user sees empty/onboarding state.
  - Conversation with 50 messages (max): all 50 displayed in UI.

### P1-3: Error Recovery -- SQL Errors
Tests: [backend/llm/spec.md#error-self-correction](./backend/llm/spec.md)

- **Scenario**: User asks a question that causes the LLM to generate invalid SQL.
- **Expected**: Error sent back to LLM as tool response. LLM retries with corrected SQL (up to 3 attempts). If all retries fail, user sees friendly error with expandable technical details.
- **Edge cases**:
  - Error on first attempt, success on retry: user sees correct answer (retries invisible to user).
  - All 3 retries fail: user-friendly error displayed with "Show SQL" for debugging.

### P1-4: Error Recovery -- Network Errors
Tests: [backend/websocket/spec.md#reconnection](./backend/websocket/spec.md), [backend/dataset_handling/spec.md#failure-during-query](./backend/dataset_handling/spec.md)

- **Scenario**: Network drops during an active session; or dataset URL becomes unreachable during a query.
- **Expected**: WebSocket: client auto-reconnects with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s). On reconnect, client re-fetches conversation state via REST (no server-side state replay). Dataset URL failure: LLM informs user the dataset is no longer accessible; dataset card shows error state.
- **Edge cases**:
  - 5 consecutive reconnection failures: "Connection lost" message with manual retry button.
  - Session expired during disconnect: reconnect attempt returns 401, user redirected to sign-in.

### P1-5: Theme Switching
Tests: [frontend/theme/spec.md](./frontend/theme/spec.md)

- **Scenario**: User toggles between light, dark, and system modes via settings.
- **Expected**: Theme applies immediately without page reload. Preference saved to localStorage. On next visit, saved preference applied.
- **Edge cases**:
  - No saved preference: defaults to system mode (follows OS `prefers-color-scheme`).
  - System preference changes while app is open in system mode: theme updates in real time.
  - User explicitly selects light/dark: OS changes ignored.

### P1-6: WebSocket Reconnection
Tests: [backend/websocket/spec.md#reconnection](./backend/websocket/spec.md)

- **Scenario**: WebSocket connection drops while user is idle or during a response.
- **Expected**: Exponential backoff applied. On successful reconnect, client re-fetches conversation state via REST. No duplicate messages in UI.
- **Edge cases**:
  - Reconnect during active streaming: stream lost, partial response preserved, user can resend.
  - 5 consecutive failures: "Connection lost" UI with manual retry button.

### P1-7: Stop Generation Mid-Stream
Tests: [frontend/chat_area/chat_input/spec.md#stop-button](./frontend/chat_area/chat_input/spec.md), [backend/llm/spec.md#streaming](./backend/llm/spec.md)

- **Scenario**: While assistant is streaming, user clicks the stop button.
- **Expected**: Streaming cancelled via `POST /conversations/:id/stop`. Partial response preserved in chat. Send button returns to normal state. User can type and send a new message.
- **Edge cases**:
  - Stop during tool execution phase: execution cancelled, partial state preserved.
  - Stop then immediately send new message: new message processed independently.

### P1-8: Dataset Removal
Tests: [backend/dataset_handling/spec.md#dataset-removal](./backend/dataset_handling/spec.md), [frontend/right_panel/dataset_card/spec.md](./frontend/right_panel/dataset_card/spec.md)

- **Scenario**: User clicks the remove (X) button on a dataset card.
- **Expected**: Dataset removed from right panel. LLM system prompt no longer includes that dataset's schema. Dataset slot freed for a new addition.
- **Edge cases**:
  - Remove the only loaded dataset: chat still works, LLM tells user to add a dataset.
  - Remove dataset then query referencing it: LLM explains the table is not available.

### P1-9: Conversation Lifecycle (Create, Delete)
Tests: [backend/spec.md#rest-endpoints](./backend/spec.md)

- **Scenario**: User creates new conversations and deletes old ones.
- **Expected**: New conversation starts with empty chat and onboarding guide. Deleted conversation removed from history list. Deleting the active conversation navigates to empty state.

### P1-10: Auto-Load Dataset from Chat Message
Tests: [backend/dataset_handling/spec.md#auto-loading-from-chat-messages](./backend/dataset_handling/spec.md), [backend/llm/spec.md#tool-calling](./backend/llm/spec.md)

- **Scenario**: User types a message containing a parquet URL.
- **Expected**: LLM detects the URL, calls `load_dataset` tool. Dataset appears in right panel. LLM proceeds to answer using the newly loaded data.
- **Edge cases**:
  - Auto-load fails (invalid URL, not parquet): LLM informs user and suggests adding manually.
  - URL already loaded: duplicate detection applies, LLM proceeds with existing dataset.

### P1-11: Conversation Message Limit
Tests: [backend/llm/spec.md#conversation-context](./backend/llm/spec.md)

- **Scenario**: Conversation reaches 50 messages.
- **Expected**: Oldest messages pruned from LLM context (system prompt stays fresh). All messages remain visible in UI. New messages continue to work.
- **Edge cases**:
  - Pruned messages referenced in follow-up: LLM may lack context, responds based on available history.

---

## Quality-of-Life Features (P2)

### P2-1: Responsive Layout
Tests: [frontend/spec.md#responsive-behavior](./frontend/spec.md)

- **Scenario**: User accesses the app at various viewport widths.
- **Expected**: Desktop (1200px+): three-panel layout, left panel expanded. Tablet (~768-1199px): left panel collapsed by default, expandable. Mobile (<768px): horizontal scroll acceptable, no dedicated mobile layout.

### P2-2: Keyboard Shortcuts
Tests: [frontend/chat_area/chat_input/spec.md#sending-messages](./frontend/chat_area/chat_input/spec.md)

- **Scenario**: User interacts with chat input using keyboard.
- **Expected**: Enter sends message. Shift+Enter inserts newline. Tab focuses textarea. Empty input: Enter does nothing, send button disabled.

### P2-3: Copy Actions
Tests: [frontend/chat_area/message_list/spec.md](./frontend/chat_area/message_list/spec.md), [frontend/chat_area/sql_panel/spec.md](./frontend/chat_area/sql_panel/spec.md), [frontend/chat_area/data_grid/spec.md](./frontend/chat_area/data_grid/spec.md)

- **Scenario**: User copies content from various parts of the UI.
- **Expected**: Copy button on assistant messages copies text to clipboard. Copy button in SQL panel copies the query. Table data can be selected and copied. Visual feedback ("Copied!") shown after copy action.

### P2-4: Accessibility Basics
Tests: [frontend/chat_area/chat_input/spec.md#accessibility](./frontend/chat_area/chat_input/spec.md), [frontend/theme/spec.md#contrast-requirements](./frontend/theme/spec.md)

- **Scenario**: User navigates the app with keyboard and screen reader.
- **Expected**: All interactive elements reachable via Tab. Send button has aria-label "Send message". Stop button has aria-label "Stop generating". Text meets WCAG AA contrast (4.5:1) in both themes. Focus indicators visible in both themes.

### P2-5: Character Limit on Chat Input
Tests: [frontend/chat_area/chat_input/spec.md#character-limit](./frontend/chat_area/chat_input/spec.md)

- **Scenario**: User types a very long message approaching the 2,000-character limit.
- **Expected**: Counter appears at 1,800+ characters. Counter turns warning color at 2,000. Typing blocked beyond limit. Pasted text truncated at 2,000.

### P2-6: Data Grid Interactions
Tests: [frontend/chat_area/data_grid/spec.md](./frontend/chat_area/data_grid/spec.md)

- **Scenario**: User interacts with a table result in the chat.
- **Expected**: Columns sortable by click. Columns resizable by drag. Sticky headers on scroll. Pagination controls for large result sets.

### P2-7: Onboarding Guide
Tests: [frontend/chat_area/onboarding/spec.md](./frontend/chat_area/onboarding/spec.md)

- **Scenario**: New user lands on the app with no datasets and no conversations.
- **Expected**: Onboarding guide visible with tutorial text, clickable example prompts, and "Try with sample data" button that loads a sample dataset URL. Clicking an example prompt sends it as a message.

---

## Scope

### In Scope
- All user-facing behaviors described in spec documents
- Cross-system integration scenarios (frontend, backend, LLM, worker pool)
- Error handling and recovery scenarios
- Security, authentication, and data isolation requirements

### Out of Scope
- Performance benchmarks and load testing (V1)
- Deployment and infrastructure testing
- CI/CD pipeline validation
- Browser compatibility matrix (desktop Chrome/Firefox/Safari only for V1)
- Monitoring and alerting verification

### Assumptions
- Tests run against a local development environment
- Test database is a fresh SQLite instance per test suite
- Google OAuth can be mocked for automated testing
- Gemini API calls mocked in unit/integration tests, live in select E2E tests
- Parquet URLs point to test fixtures (small files) in automated tests

### Open Questions
- None
