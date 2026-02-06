---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# REST API Test Plan

## Fixtures (`tests/rest_api/conftest.py`)

### `authed_client` — Authenticated HTTP test client

Extends the shared `authed_client` fixture. Pre-seeds a user and valid session. All requests include the session cookie automatically.

### `other_user_client` — Second authenticated user

Creates a separate user + session to test ownership boundaries (403 scenarios).

```python
@pytest.fixture
async def other_user_client(db):
    other_user = make_user(id="other-user")
    await insert_user(db, other_user)
    other_session = make_session(user_id="other-user")
    await insert_session(db, other_session)
    async with AsyncClient(..., cookies={"session_token": other_session["id"]}) as client:
        yield client
```

### `conversation_owned` — Conversation owned by `test_user`

```python
@pytest.fixture
async def conversation_owned(db, test_user):
    conv = make_conversation(user_id=test_user["id"])
    await insert_conversation(db, conv)
    return conv
```

### `conversation_other` — Conversation owned by `other_user`

### `mock_chat_processing` — Mocked chat service for message endpoints

Patches `chat_service.process_message` to return immediately without LLM calls. Used to test REST layer independently from LLM orchestration.

## Test Implementation by Scenario

### Auth Endpoint Tests (`test_auth_endpoints.py`)

Tests: [test.md#AUTH-EP-1 through AUTH-EP-9](./test.md)

| Scenario | Approach |
|----------|----------|
| AUTH-EP-1 | POST `/auth/google` with `{"referral_key": "test-key"}`. Assert 200 with `redirect_url` in response. |
| AUTH-EP-2 | Mock OAuth callback for existing user. Assert redirect, cookie set. |
| AUTH-EP-3 | Mock OAuth callback for new user with valid key. Assert 201-equivalent (redirect to app), user in DB. |
| AUTH-EP-4 | Mock OAuth callback for new user without key. Assert redirect with `?error=`. |
| AUTH-EP-5 | Send callback with wrong state. Assert 403. |
| AUTH-EP-6 | GET `/auth/me` with `authed_client`. Assert 200 with user fields. |
| AUTH-EP-7 | GET `/auth/me` with no cookie. Assert 401. |
| AUTH-EP-8 | POST `/auth/logout` with `authed_client`. Assert 200 with `{success: true}`. |
| AUTH-EP-9 | POST `/auth/logout` with no cookie. Assert 401. |

### Usage Endpoint Tests (`test_usage_endpoints.py`)

Tests: [test.md#USAGE-EP-1, USAGE-EP-2](./test.md)

| Scenario | Approach |
|----------|----------|
| USAGE-EP-1 | Seed token_usage. GET `/usage`. Assert 200 with `tokens_used`, `token_limit`, `remaining`, `resets_in_seconds`, `usage_percent`. |
| USAGE-EP-2 | GET `/usage` without cookie. Assert 401. |

### Conversation Endpoint Tests (`test_conversation_endpoints.py`)

Tests: [test.md#CONV-EP-1 through CONV-EP-8](./test.md)

| Scenario | Approach |
|----------|----------|
| CONV-EP-1 | POST `/conversations`. Assert 201 with `id`, `title`, `created_at`. Query DB to confirm row. |
| CONV-EP-2 | Seed multiple conversations. GET `/conversations`. Assert array sorted by `updated_at` desc. Assert `dataset_count` included. |
| CONV-EP-3 | GET `/conversations/{id}` for owned conversation. Assert 200 with `messages` and `datasets` arrays. |
| CONV-EP-4 | GET `/conversations/{id}` for other user's conversation. Assert 403. |
| CONV-EP-5 | GET `/conversations/{nonexistent_id}`. Assert 404. |
| CONV-EP-6 | DELETE `/conversations/{id}` for owned conversation. Assert 200 with `{success: true}`. Query DB — row gone. |
| CONV-EP-7 | DELETE other user's conversation. Assert 403. |
| CONV-EP-8 | DELETE nonexistent conversation. Assert 404. |
| CONV-EP-9 | PATCH `/conversations/{id}` with `{"title": "New Name"}`. Assert 200 with `id`, `title: "New Name"`, `updated_at`. Query DB to confirm title changed. |
| CONV-EP-10 | PATCH other user's conversation. Assert 403. |
| CONV-EP-11 | Seed 3 conversations for test_user + 1 for other_user. DELETE `/conversations`. Assert 200 with `{success: true, deleted_count: 3}`. Query DB — test_user has 0 conversations, other_user's conversation remains. |

**Ownership tests**: Use `other_user_client` to attempt operations on `conversation_owned`. Assert 403 every time.

### Chat Endpoint Tests (`test_chat_endpoints.py`)

Tests: [test.md#CHAT-EP-1 through CHAT-EP-6](./test.md)

| Scenario | Approach |
|----------|----------|
| CHAT-EP-1 | POST `/conversations/{id}/messages` with `{"content": "analyze this"}`. Assert 200 with `message_id` and `status: "processing"`. Assert user message saved in DB. |
| CHAT-EP-2 | POST message containing a parquet URL. Assert 200. Verify `mock_chat_processing` received the message. |
| CHAT-EP-3 | Seed 5M+ tokens. POST message. Assert 429. |
| CHAT-EP-4 | POST message to other user's conversation. Assert 403. |
| CHAT-EP-5 | POST `/conversations/{id}/stop`. Assert 200 with `{success: true}`. When nothing streaming, still 200 (no-op). |
| CHAT-EP-6 | POST stop for nonexistent conversation. Assert 404. |

### Dataset Endpoint Tests (`test_dataset_endpoints.py`)

Tests: [test.md#DS-EP-1 through DS-EP-6](./test.md)

| Scenario | Approach |
|----------|----------|
| DS-EP-1 | POST `/conversations/{id}/datasets` with `{"url": "https://example.com/data.parquet"}`. Mock worker. Assert 201 with `dataset_id` and `status: "loading"`. |
| DS-EP-2 | POST with invalid URL (e.g., `"ftp://bad"`). Assert 400 with "Invalid URL format". |
| DS-EP-3 | Seed a dataset with a URL, then POST same URL. Assert 400 with "This dataset is already loaded". |
| DS-EP-4 | Seed 5 datasets, POST another. Assert 400 with "Maximum 5 datasets reached". |
| DS-EP-5 | DELETE `/conversations/{id}/datasets/{dataset_id}`. Assert 200 with `{success: true}`. Query DB — row gone. |
| DS-EP-6 | DELETE with nonexistent dataset_id. Assert 404. |
| DS-EP-7 | PATCH `/conversations/{id}/datasets/{dataset_id}` with `{"tableName": "sales_data"}`. Assert 200 with updated dataset including `tableName: "sales_data"`. Query DB to confirm name changed. |
| DS-EP-8 | PATCH dataset in other user's conversation. Assert 403. |
| DS-EP-9 | POST `/conversations/{id}/datasets/{dataset_id}/refresh`. Mock `dataset_service.refresh_schema` to return updated dict. Assert 200 with `id`, `name`, `tableName`, `url`, `row_count`, `column_count`, `schema`. |
| DS-EP-10 | POST refresh for nonexistent dataset_id. Assert 404. |

### Cross-Cutting Tests (`test_cross_cutting.py`)

Tests: [test.md#CROSS-1 through CROSS-3](./test.md)

**CROSS-1** (Error format): Trigger each error code (400, 401, 403, 404, 429, 500). Assert every response body has `{"error": str}` and optionally `{"details": str}`. Parameterized test.

**CROSS-2** (Status codes): Matrix test — each endpoint × each error condition. Assert expected status code. Can be verified as a byproduct of other tests; this test explicitly documents the mapping.

**CROSS-3** (CORS headers):
- Send request with `Origin: http://localhost:5173` (allowed). Assert `Access-Control-Allow-Origin` present.
- Send OPTIONS preflight. Assert 200 with CORS headers.
- Send request with `Origin: http://evil.com` (disallowed). Assert no CORS headers.

## Response Assertion Helpers

```python
def assert_error_response(response, status_code, error_substring=None):
    assert response.status_code == status_code
    body = response.json()
    assert "error" in body
    if error_substring:
        assert error_substring in body["error"]

def assert_success_response(response, status_code=200):
    assert response.status_code == status_code
    return response.json()
```

## Scope

### In Scope
- All REST endpoint test scenarios from rest_api/test.md
- Request/response format validation
- Status code correctness
- Ownership enforcement (403 boundaries)
- CORS header verification

### Out of Scope
- Business logic depth (tested in service-specific test plans)
- WebSocket communication (see websocket/test_plan.md)
- OAuth flow details (see auth/test_plan.md)
