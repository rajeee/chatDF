---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# REST API Specification

## Scope

### In Scope
- REST endpoint definitions
- Request/response formats
- Authentication requirements per endpoint
- Error response format
- CORS configuration

### Out of Scope
- WebSocket protocol (see websocket/spec.md)
- OAuth flow details (see auth/spec.md)
- Business logic implementation

### Assumptions
- All endpoints return JSON
- Session cookie required for all endpoints except auth
- No guest/anonymous access

## Endpoints

### Authentication

#### `POST /auth/google`
- **Purpose**: Initiate Google OAuth flow
- **Auth**: None required
- **Request**: `{ referral_key?: string }` — optional, required for new users
- **Response**: `{ redirect_url: string }` — URL to redirect user to Google consent screen
- **Notes**: referral_key stored in session state for use after callback
- **Errors**: 500 if OAuth configuration is missing

#### `GET /auth/google/callback`
- **Purpose**: Handle Google OAuth callback
- **Auth**: None (Google redirects here)
- **Query params**: `code` (authorization code), `state` (CSRF token)
- **Behavior**:
  - Existing user: create session, redirect to app
  - New user with valid referral key: create user + session, redirect to app
  - New user without/invalid key: redirect to app with error param
- **Errors**: 400 invalid code, 403 state mismatch

#### `GET /auth/me`
- **Purpose**: Get current user info
- **Auth**: Session cookie required
- **Response**: `{ user_id, email, name, avatar_url }`
- **Errors**: 401 invalid/expired session

#### `POST /auth/logout`
- **Purpose**: Invalidate current session
- **Auth**: Session cookie required
- **Response**: `{ success: true }` + clears session cookie
- **Errors**: 401 if not authenticated

### Usage

#### `GET /usage`
- **Purpose**: Get current token usage stats
- **Auth**: Session cookie required
- **Response**: `{ tokens_used: number, token_limit: number, remaining: number, resets_in_seconds: number, usage_percent: number }`
- **Errors**: 401 if not authenticated

### Conversations

#### `POST /conversations`
- **Purpose**: Create a new conversation
- **Auth**: Session cookie required
- **Request**: Empty body
- **Response**: `{ id, title, created_at }`

#### `GET /conversations`
- **Purpose**: List conversations for the current user
- **Auth**: Session cookie required
- **Response**: `{ conversations: [{ id, title, created_at, updated_at, dataset_count }] }`
- **Notes**: Sorted by `updated_at` descending

#### `GET /conversations/:id`
- **Purpose**: Get conversation details with messages and datasets
- **Auth**: Session cookie required, must own conversation
- **Response**: `{ id, title, created_at, updated_at, messages: [{ id, role, content, sql_query?, created_at }], datasets: [{ id, name, url, row_count, column_count }] }`
- **Errors**: 404 not found, 403 not owner

#### `DELETE /conversations/:id`
- **Purpose**: Delete a conversation and all associated data
- **Auth**: Session cookie required, must own conversation
- **Response**: `{ success: true }`
- **Notes**: Cascading delete — removes messages and dataset records
- **Errors**: 404 not found, 403 not owner

### Chat

#### `POST /conversations/:id/messages`
- **Purpose**: Send a chat message and trigger LLM response
- **Auth**: Session cookie required, must own conversation
- **Request**: `{ content: string }`
- **Response**: `{ message_id: string, status: "processing" }`
- **Notes**: Response is immediate acknowledgment. Actual LLM response streams via WebSocket. If message contains parquet URLs, they are auto-detected and loaded as datasets.
- **Errors**: 404 conversation not found, 403 not owner, 429 rate limited

#### `POST /conversations/:id/stop`
- **Purpose**: Stop in-progress LLM generation
- **Auth**: Session cookie required, must own conversation
- **Response**: `{ success: true }`
- **Notes**: Partial response preserved. No-op if nothing is generating.
- **Errors**: 404 conversation not found

### Datasets

#### `POST /conversations/:id/datasets`
- **Purpose**: Add a dataset by URL
- **Auth**: Session cookie required, must own conversation
- **Request**: `{ url: string }`
- **Response**: `{ dataset_id: string, status: "loading" }`
- **Notes**: Loading progress sent via WebSocket events
- **Errors**: 400 invalid URL, 400 duplicate URL, 400 at limit (5), 404 conversation not found

#### `DELETE /conversations/:id/datasets/:dataset_id`
- **Purpose**: Remove a dataset from conversation
- **Auth**: Session cookie required, must own conversation
- **Response**: `{ success: true }`
- **Errors**: 404 not found

## Common Patterns

### Error Response Format
All errors follow a consistent format:
```json
{
  "error": "Human-readable error message",
  "details": "Optional technical details for debugging"
}
```

### HTTP Status Codes
- 200: Success
- 201: Created (new conversation, new dataset)
- 400: Bad request (invalid input)
- 401: Unauthorized (no valid session)
- 403: Forbidden (valid session but not authorized for this resource)
- 404: Not found
- 429: Rate limited
- 500: Internal server error

### CORS
- Configurable allowed origins via `CORS_ORIGINS` environment variable
- Allowed methods: GET, POST, DELETE, OPTIONS
- Allowed headers: Content-Type, Cookie
- Credentials: allowed (for cookies)

### Authentication
- All endpoints except `/auth/google` and `/auth/google/callback` require a valid session cookie
- Invalid/expired sessions return 401
- Frontend redirects to sign-in page on 401
