---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# REST API Test Specification

Tests: [rest_api/spec.md](./spec.md)

## Scope

### In Scope
- Every REST endpoint: request format, response format, status codes
- Authentication enforcement per endpoint
- Error response consistency
- CORS header presence

### Out of Scope
- OAuth flow logic details (see auth/test.md)
- WebSocket message delivery (see websocket/test.md)
- LLM processing behavior (see llm/test.md)

---

## Test Scenarios

### AUTH-EP-1: POST /auth/google
Tests: [spec.md#post-authgoogle](./spec.md#post-authgoogle)

- Scenario: Client sends POST /auth/google with optional referral_key in body
- Expected: 200 response with `{redirect_url}` pointing to Google consent screen
- Edge cases:
  - Request includes referral_key: key stored in state for callback
  - Request without referral_key: redirect_url still returned (key checked at callback)
  - Server OAuth config missing: 500 with error format

### AUTH-EP-2: GET /auth/google/callback - Existing User
Tests: [spec.md#get-authgooglecallback](./spec.md#get-authgooglecallback)

- Scenario: Google redirects with valid code and state for a user whose google_id already exists
- Expected: Session created, httpOnly cookie set, redirect to app
- Edge cases:
  - Invalid authorization code: 400

### AUTH-EP-3: GET /auth/google/callback - New User with Key
Tests: [spec.md#get-authgooglecallback](./spec.md#get-authgooglecallback)

- Scenario: Google redirects for a new user, valid referral key was passed in state
- Expected: User + session created, key marked used, httpOnly cookie set, redirect to app

### AUTH-EP-4: GET /auth/google/callback - New User without Key
Tests: [spec.md#get-authgooglecallback](./spec.md#get-authgooglecallback)

- Scenario: Google redirects for a new user, no referral key in state
- Expected: Redirect to app with error parameter, no user or session created

### AUTH-EP-5: GET /auth/google/callback - State Mismatch
Tests: [spec.md#get-authgooglecallback](./spec.md#get-authgooglecallback)

- Scenario: State parameter does not match expected value
- Expected: 403 response

### AUTH-EP-6: GET /auth/me - Authenticated
Tests: [spec.md#get-authme](./spec.md#get-authme)

- Scenario: Authenticated user calls GET /auth/me
- Expected: 200 with `{user_id, email, name, avatar_url}`

### AUTH-EP-7: GET /auth/me - Unauthenticated
Tests: [spec.md#get-authme](./spec.md#get-authme)

- Scenario: No session cookie provided
- Expected: 401

### AUTH-EP-8: POST /auth/logout - Authenticated
Tests: [spec.md#post-authlogout](./spec.md#post-authlogout)

- Scenario: Authenticated user calls POST /auth/logout
- Expected: 200 with `{success: true}`, session cookie cleared

### AUTH-EP-9: POST /auth/logout - Unauthenticated
Tests: [spec.md#post-authlogout](./spec.md#post-authlogout)

- Scenario: No session cookie provided
- Expected: 401

---

### USAGE-EP-1: GET /usage - Authenticated
Tests: [spec.md#get-usage](./spec.md#get-usage)

- Scenario: Authenticated user calls GET /usage
- Expected: 200 with `{tokens_used, token_limit, remaining, resets_in_seconds, usage_percent}`

### USAGE-EP-2: GET /usage - Unauthenticated
Tests: [spec.md#get-usage](./spec.md#get-usage)

- Scenario: No session cookie
- Expected: 401

---

### CONV-EP-1: POST /conversations - Create
Tests: [spec.md#post-conversations](./spec.md#post-conversations)

- Scenario: Authenticated user sends POST /conversations with empty body
- Expected: 201 with `{id, title, created_at}`, new record in conversations table

### CONV-EP-2: GET /conversations - List
Tests: [spec.md#get-conversations](./spec.md#get-conversations)

- Scenario: Authenticated user with multiple conversations
- Expected: 200 with conversations array sorted by updated_at descending, each item includes `{id, title, created_at, updated_at, dataset_count}`
- Edge cases:
  - User has no conversations: returns empty array
  - Does not return other users' conversations

### CONV-EP-3: GET /conversations/:id - Details
Tests: [spec.md#get-conversationsid](./spec.md#get-conversationsid)

- Scenario: Authenticated user requests own conversation
- Expected: 200 with `{id, title, created_at, updated_at, messages: [...], datasets: [...]}`
- Edge cases:
  - Conversation has no messages: messages array is empty
  - Conversation has no datasets: datasets array is empty

### CONV-EP-4: GET /conversations/:id - Not Owner
Tests: [spec.md#get-conversationsid](./spec.md#get-conversationsid)

- Scenario: Authenticated user requests a conversation owned by a different user
- Expected: 403

### CONV-EP-5: GET /conversations/:id - Not Found
Tests: [spec.md#get-conversationsid](./spec.md#get-conversationsid)

- Scenario: Conversation ID does not exist
- Expected: 404

### CONV-EP-6: DELETE /conversations/:id - Success
Tests: [spec.md#delete-conversationsid](./spec.md#delete-conversationsid)

- Scenario: Authenticated user deletes own conversation
- Expected: 200 with `{success: true}`, conversation + messages + datasets removed from database

### CONV-EP-7: DELETE /conversations/:id - Not Owner
Tests: [spec.md#delete-conversationsid](./spec.md#delete-conversationsid)

- Scenario: Authenticated user attempts to delete another user's conversation
- Expected: 403

### CONV-EP-8: DELETE /conversations/:id - Not Found
Tests: [spec.md#delete-conversationsid](./spec.md#delete-conversationsid)

- Scenario: Conversation ID does not exist
- Expected: 404

### CONV-EP-9: PATCH /conversations/:id - Rename
Tests: [spec.md#patch-conversationsid](./spec.md#patch-conversationsid)

- Scenario: Authenticated owner sends `{ title: "New Name" }` to own conversation
- Expected: 200 with `{ id, title: "New Name", updated_at }`
- Edge cases:
  - Empty title: 400
  - Title over 100 chars: 400
  - Not owner: 403
  - Not found: 404

### CONV-EP-10: PATCH /conversations/:id - Not Owner
Tests: [spec.md#patch-conversationsid](./spec.md#patch-conversationsid)

- Scenario: Authenticated user renames another user's conversation
- Expected: 403

### CONV-EP-11: DELETE /conversations - Clear All
Tests: [spec.md#delete-conversations](./spec.md#delete-conversations)

- Scenario: Authenticated user deletes all their conversations
- Expected: 200 with `{ success: true, deleted_count }` matching the user's conversation count
- Edge cases:
  - User has no conversations: 200 with `{ success: true, deleted_count: 0 }`
  - Does not affect other users' conversations

---

### CHAT-EP-1: POST /conversations/:id/messages - Send Message
Tests: [spec.md#post-conversationsidmessages](./spec.md#post-conversationsidmessages)

- Scenario: Authenticated owner sends `{content: "analyze this data"}` to own conversation
- Expected: 200 with `{message_id, status: "processing"}`, user message saved in messages table, LLM processing triggered asynchronously

### CHAT-EP-2: POST /conversations/:id/messages - Parquet URL Auto-Detection
Tests: [spec.md#post-conversationsidmessages](./spec.md#post-conversationsidmessages)

- Scenario: Message content contains a parquet file URL
- Expected: 200 with `{message_id, status: "processing"}`, URL detected and dataset loading triggered alongside LLM processing

### CHAT-EP-3: POST /conversations/:id/messages - Rate Limited
Tests: [spec.md#post-conversationsidmessages](./spec.md#post-conversationsidmessages)

- Scenario: User has exceeded token budget
- Expected: 429 with error format

### CHAT-EP-4: POST /conversations/:id/messages - Not Owner
Tests: [spec.md#post-conversationsidmessages](./spec.md#post-conversationsidmessages)

- Scenario: Authenticated user sends message to another user's conversation
- Expected: 403

### CHAT-EP-5: POST /conversations/:id/stop - Stop Generation
Tests: [spec.md#post-conversationsidstop](./spec.md#post-conversationsidstop)

- Scenario: Authenticated owner stops in-progress generation
- Expected: 200 with `{success: true}`, partial response preserved in messages table
- Edge cases:
  - Nothing currently generating: returns 200 (no-op)

### CHAT-EP-6: POST /conversations/:id/stop - Not Found
Tests: [spec.md#post-conversationsidstop](./spec.md#post-conversationsidstop)

- Scenario: Conversation ID does not exist
- Expected: 404

---

### DS-EP-1: POST /conversations/:id/datasets - Add Dataset
Tests: [spec.md#post-conversationsiddatasets](./spec.md#post-conversationsiddatasets)

- Scenario: Authenticated owner sends `{url: "https://example.com/data.parquet"}`
- Expected: 201 with `{dataset_id, status: "loading"}`, validation pipeline triggered asynchronously

### DS-EP-2: POST /conversations/:id/datasets - Invalid URL
Tests: [spec.md#post-conversationsiddatasets](./spec.md#post-conversationsiddatasets)

- Scenario: URL format is invalid (e.g., not http/https, malformed)
- Expected: 400 with error "Invalid URL format"

### DS-EP-3: POST /conversations/:id/datasets - Duplicate URL
Tests: [spec.md#post-conversationsiddatasets](./spec.md#post-conversationsiddatasets)

- Scenario: URL is already loaded in this conversation
- Expected: 400 with error "This dataset is already loaded"

### DS-EP-4: POST /conversations/:id/datasets - At Limit
Tests: [spec.md#post-conversationsiddatasets](./spec.md#post-conversationsiddatasets)

- Scenario: Conversation already has 5 datasets
- Expected: 400 with error "Maximum 5 datasets reached"

### DS-EP-5: DELETE /conversations/:id/datasets/:dataset_id - Remove
Tests: [spec.md#delete-conversationsiddatasetsdataset_id](./spec.md#delete-conversationsiddatasetsdataset_id)

- Scenario: Authenticated owner removes a dataset
- Expected: 200 with `{success: true}`, dataset record removed

### DS-EP-6: DELETE /conversations/:id/datasets/:dataset_id - Not Found
Tests: [spec.md#delete-conversationsiddatasetsdataset_id](./spec.md#delete-conversationsiddatasetsdataset_id)

- Scenario: Dataset ID does not exist
- Expected: 404

### DS-EP-7: PATCH /conversations/:id/datasets/:dataset_id - Rename
Tests: [spec.md#patch-conversationsiddatasetsdataset_id](./spec.md#patch-conversationsiddatasetsdataset_id)

- Scenario: Authenticated owner sends `{ tableName: "sales_data" }` to rename a dataset
- Expected: 200 with `{ id, name, tableName: "sales_data", url, row_count, column_count }`
- Edge cases:
  - Invalid name (special chars, empty): 400
  - Not owner: 403
  - Dataset not found: 404

### DS-EP-8: PATCH /conversations/:id/datasets/:dataset_id - Not Owner
Tests: [spec.md#patch-conversationsiddatasetsdataset_id](./spec.md#patch-conversationsiddatasetsdataset_id)

- Scenario: Authenticated user renames dataset in another user's conversation
- Expected: 403

### DS-EP-9: POST /conversations/:id/datasets/:dataset_id/refresh - Success
Tests: [spec.md#post-conversationsiddatasetsdataset_idrefresh](./spec.md#post-conversationsiddatasetsdataset_idrefresh)

- Scenario: Authenticated owner triggers schema refresh for an existing dataset
- Expected: 200 with updated `{ id, name, tableName, url, row_count, column_count, schema }`
- Edge cases:
  - Dataset not found: 404
  - Not owner: 403
  - Upstream URL unreachable: 502

### DS-EP-10: POST /conversations/:id/datasets/:dataset_id/refresh - Not Found
Tests: [spec.md#post-conversationsiddatasetsdataset_idrefresh](./spec.md#post-conversationsiddatasetsdataset_idrefresh)

- Scenario: Dataset ID does not exist
- Expected: 404

---

### CROSS-1: Consistent Error Format
Tests: [spec.md#error-response-format](./spec.md#error-response-format)

- Scenario: Any endpoint returns an error (400, 401, 403, 404, 429, 500)
- Expected: Response body is JSON `{error: string, details?: string}`

### CROSS-2: HTTP Status Codes
Tests: [spec.md#http-status-codes](./spec.md#http-status-codes)

- Scenario: Various success and error conditions across all endpoints
- Expected: Correct status codes used: 200 (success), 201 (created), 400 (bad input), 401 (no session), 403 (not owner), 404 (not found), 429 (rate limited), 500 (server error)

### CROSS-3: CORS Headers on Responses
Tests: [spec.md#cors](./spec.md#cors)

- Scenario: Request from an allowed origin hits any endpoint
- Expected: Response includes Access-Control-Allow-Origin, Access-Control-Allow-Credentials headers
- Edge cases:
  - OPTIONS preflight: returns 200 with full CORS headers
  - Disallowed origin: no CORS headers in response
