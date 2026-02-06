---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# REST API Plan

## Router Files and Endpoint Mapping
Implements: [spec.md#Endpoints](./spec.md#endpoints)

### `routers/auth.py`
- `POST /auth/google` -> `google_login()` (see auth/plan.md)
- `GET /auth/google/callback` -> `google_callback()` (see auth/plan.md)
- `GET /auth/me` -> `get_me(user = Depends(get_current_user))`
- `POST /auth/logout` -> `logout(request, user = Depends(get_current_user))`

### `routers/conversations.py`
- `POST /conversations` -> `create_conversation(user, db)`
- `GET /conversations` -> `list_conversations(user, db)`
- `GET /conversations/{conversation_id}` -> `get_conversation_detail(conversation = Depends(get_conversation), db)`
- `PATCH /conversations/{conversation_id}` -> `rename_conversation(body: RenameConversationRequest, conversation = Depends(get_conversation), db)`
- `DELETE /conversations/{conversation_id}` -> `delete_conversation(conversation = Depends(get_conversation), db)`
- `DELETE /conversations` -> `clear_all_conversations(user, db)`
- `POST /conversations/{conversation_id}/messages` -> `send_message(body: SendMessageRequest, conversation = Depends(get_conversation), db)`
- `POST /conversations/{conversation_id}/stop` -> `stop_generation(conversation = Depends(get_conversation), db)`

### `routers/datasets.py`
- `POST /conversations/{conversation_id}/datasets` -> `add_dataset(body: AddDatasetRequest, conversation = Depends(get_conversation), db)`
- `PATCH /conversations/{conversation_id}/datasets/{dataset_id}` -> `rename_dataset(body: RenameDatasetRequest, conversation = Depends(get_conversation), dataset_id: str, db)`
- `POST /conversations/{conversation_id}/datasets/{dataset_id}/refresh` -> `refresh_dataset_schema(conversation = Depends(get_conversation), dataset_id: str, db)`
- `DELETE /conversations/{conversation_id}/datasets/{dataset_id}` -> `remove_dataset(conversation = Depends(get_conversation), dataset_id: str, db)`

### `routers/usage.py`
- `GET /usage` -> `get_usage(user = Depends(get_current_user), db)`

## Pydantic Request/Response Models
Implements: [spec.md#Endpoints](./spec.md#endpoints)

Defined in `models.py`:

**Request models:**
- `GoogleLoginRequest`: `referral_key: str | None = None`
- `SendMessageRequest`: `content: str` (min_length=1, max_length=10000)
- `AddDatasetRequest`: `url: str` (validated as HttpUrl)
- `RenameConversationRequest`: `title: str` (min_length=1, max_length=100)
- `RenameDatasetRequest`: `tableName: str` (min_length=1, max_length=50, pattern=`^[a-zA-Z_][a-zA-Z0-9_]*$`)

**Response models:**
- `UserResponse`: `user_id: str, email: str, name: str, avatar_url: str | None`
- `ConversationResponse`: `id: str, title: str, created_at: datetime`
- `ConversationListResponse`: `conversations: list[ConversationSummary]`
- `ConversationSummary`: `id: str, title: str, created_at: datetime, updated_at: datetime, dataset_count: int`
- `ConversationDetailResponse`: `id: str, title: str, created_at: datetime, updated_at: datetime, messages: list[MessageResponse], datasets: list[DatasetResponse]`
- `MessageResponse`: `id: str, role: str, content: str, sql_query: str | None, created_at: datetime`
- `DatasetResponse`: `id: str, name: str, url: str, row_count: int, column_count: int`
- `UsageResponse`: `tokens_used: int, token_limit: int, remaining: int, resets_in_seconds: int, usage_percent: float`
- `MessageAckResponse`: `message_id: str, status: str` (literal "processing")
- `DatasetAckResponse`: `dataset_id: str, status: str` (literal "loading")
- `ClearAllResponse`: `success: bool, deleted_count: int`
- `DatasetDetailResponse`: `id: str, name: str, tableName: str, url: str, row_count: int, column_count: int, schema: dict | None`
- `SuccessResponse`: `success: bool` (literal True)
- `ErrorResponse`: `error: str, details: str | None = None`

## Error Response Standardization
Implements: [spec.md#Error-Response-Format](./spec.md#common-patterns)

All error responses use `ErrorResponse` model. Custom exception handlers registered in `main.py`:

- `NotFoundError` -> 404 `ErrorResponse`
- `ForbiddenError` -> 403 `ErrorResponse`
- `RateLimitError` -> 429 `ErrorResponse`
- `ValidationError` (Pydantic) -> 400 `ErrorResponse`
- `Exception` (catch-all) -> 500 `ErrorResponse`

Domain exceptions defined in `services/exceptions.py`:
- `class NotFoundError(Exception)`: `message: str`
- `class ForbiddenError(Exception)`: `message: str`
- `class RateLimitError(Exception)`: `message: str, resets_in_seconds: int`

## CORS Middleware Configuration
Implements: [spec.md#CORS](./spec.md#cors)

Applied in `main.py` via `CORSMiddleware`:
- `allow_origins`: `settings.cors_origins.split(",")`
- `allow_methods`: `["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`
- `allow_headers`: `["Content-Type", "Cookie"]`
- `allow_credentials`: `True`

## Conversation Ownership Validation Pattern
Implements: [spec.md#Endpoints](./spec.md#endpoints) (403 errors)

The `get_conversation` dependency (in `dependencies.py`) handles ownership:
1. Extracts `conversation_id` from path params
2. Queries `conversations` table by ID
3. If not found: raise `NotFoundError`
4. If `conversation.user_id != current_user.id`: raise `ForbiddenError`
5. Returns `Conversation` model

This dependency is injected into every endpoint that operates on a specific conversation, removing ownership checks from router logic.

## Scope

### In Scope
- Router structure and endpoint signatures
- Pydantic models for all request/response shapes
- Error handling pattern and exception hierarchy
- CORS configuration
- Ownership validation dependency

### Out of Scope
- Auth flow implementation details (see auth/plan.md)
- WebSocket endpoint (see websocket/plan.md)
- Business logic in services (see llm/plan.md, worker/plan.md, etc.)
- Database queries (see database/plan.md)
