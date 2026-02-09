"""Pydantic request/response models for the ChatDF REST API.

Implements: spec/backend/rest_api/plan.md#pydantic-requestresponse-models
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class GoogleLoginRequest(BaseModel):
    """Body for ``POST /auth/google``."""

    referral_key: str | None = None


class SendMessageRequest(BaseModel):
    """Body for ``POST /conversations/{id}/messages``."""

    content: str = Field(..., min_length=1, max_length=10000)


class AddDatasetRequest(BaseModel):
    """Body for ``POST /conversations/{id}/datasets``."""

    url: str
    name: str | None = None


class RenameConversationRequest(BaseModel):
    """Body for ``PATCH /conversations/{id}``."""

    title: str = Field(..., min_length=1, max_length=100)


class PinConversationRequest(BaseModel):
    """Body for ``PATCH /conversations/{id}/pin``."""

    is_pinned: bool


class ForkConversationRequest(BaseModel):
    """Body for ``POST /conversations/{id}/fork``."""

    message_id: str


class RenameDatasetRequest(BaseModel):
    """Body for ``PATCH /conversations/{id}/datasets/{dataset_id}``."""

    tableName: str = Field(
        ...,
        min_length=1,
        max_length=50,
        pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$",
    )


class ProfileColumnRequest(BaseModel):
    """Body for ``POST /conversations/{id}/datasets/{dataset_id}/profile-column``."""

    column_name: str = Field(..., min_length=1)
    column_type: str = Field(..., min_length=1)


class RunQueryRequest(BaseModel):
    """Body for ``POST /conversations/{id}/query``."""

    sql: str = Field(..., min_length=1, max_length=50000)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1, le=1000)


class RunQueryResponse(BaseModel):
    """Response for ``POST /conversations/{id}/query``."""

    columns: list[str]
    rows: list[list[Any]]
    total_rows: int
    execution_time_ms: float
    page: int = 1
    page_size: int = 100
    total_pages: int = 1
    cached: bool = False
    limit_applied: bool = False


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    """Response for ``GET /auth/me``."""

    user_id: str
    email: str
    name: str
    avatar_url: str | None = None


class ConversationResponse(BaseModel):
    """Response for ``POST /conversations`` (creation)."""

    id: str
    title: str
    created_at: datetime


class ConversationSummary(BaseModel):
    """Single item in a conversation list."""

    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    dataset_count: int
    message_count: int = 0
    last_message_preview: str | None = None
    is_pinned: bool = False


class ConversationListResponse(BaseModel):
    """Response for ``GET /conversations``."""

    conversations: list[ConversationSummary]


class MessageResponse(BaseModel):
    """A single message within a conversation."""

    id: str
    role: str
    content: str
    sql_query: str | None = None
    reasoning: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    tool_call_trace: str | None = None
    created_at: datetime


class DatasetResponse(BaseModel):
    """A dataset summary within a conversation."""

    id: str
    name: str
    url: str
    row_count: int
    column_count: int
    status: str = "ready"
    schema_json: str = "{}"
    file_size_bytes: int | None = None
    column_descriptions: str = "{}"


class ConversationDetailResponse(BaseModel):
    """Response for ``GET /conversations/{id}``."""

    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse]
    datasets: list[DatasetResponse]


class DatasetDetailResponse(BaseModel):
    """Response for dataset rename / refresh (includes tableName and schema)."""

    id: str
    name: str
    tableName: str
    url: str
    row_count: int
    column_count: int
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")

    model_config = {"populate_by_name": True}


class DatasetPreviewResponse(BaseModel):
    """Response for ``POST /conversations/{id}/datasets/{dataset_id}/preview``."""

    columns: list[str]
    rows: list[list[Any]]
    total_rows: int
    sample_method: str = "head"


class UsageResponse(BaseModel):
    """Response for ``GET /usage``."""

    tokens_used: int
    token_limit: int
    remaining: int
    resets_in_seconds: int
    usage_percent: float


class MessageAckResponse(BaseModel):
    """Response for ``POST /conversations/{id}/messages`` (immediate ack)."""

    message_id: str
    status: Literal["processing"]


class DatasetAckResponse(BaseModel):
    """Response for ``POST /conversations/{id}/datasets`` (immediate ack)."""

    dataset_id: str
    status: Literal["loading"]


class ClearAllResponse(BaseModel):
    """Response for ``DELETE /conversations``."""

    success: bool
    deleted_count: int


class SuccessResponse(BaseModel):
    """Generic success response."""

    success: bool


class SaveQueryRequest(BaseModel):
    """Body for ``POST /saved-queries``."""

    name: str = Field(..., min_length=1, max_length=100)
    query: str = Field(..., min_length=1, max_length=10000)
    result_json: str | None = None
    execution_time_ms: float | None = None
    folder: str = Field(default="", max_length=50)


class SavedQueryResponse(BaseModel):
    """A saved query."""

    id: str
    name: str
    query: str
    created_at: datetime
    result_json: str | None = None
    execution_time_ms: float | None = None
    folder: str = ""


class UpdateFolderRequest(BaseModel):
    """Body for ``PATCH /saved-queries/{id}/folder``."""

    folder: str = Field(default="", max_length=50)


class SavedQueryListResponse(BaseModel):
    """Response for ``GET /saved-queries``."""

    queries: list[SavedQueryResponse]


class ShareConversationResponse(BaseModel):
    """Response for ``POST /conversations/{id}/share``."""

    share_token: str
    share_url: str


class PublicConversationResponse(BaseModel):
    """Response for ``GET /shared/{share_token}``."""

    title: str
    messages: list[MessageResponse]
    datasets: list[DatasetResponse]
    shared_at: str


class SearchResult(BaseModel):
    """A single search result for global conversation search."""

    conversation_id: str
    conversation_title: str
    message_id: str
    message_role: str
    snippet: str
    created_at: datetime


class SearchResponse(BaseModel):
    """Response for ``GET /conversations/search``."""

    results: list[SearchResult]
    total: int


class ExplainSqlRequest(BaseModel):
    """Body for ``POST /conversations/{id}/explain-sql``."""

    query: str = Field(..., min_length=1, max_length=50000)
    schema_json: str = "{}"


class ExplainSqlResponse(BaseModel):
    """Response for ``POST /conversations/{id}/explain-sql``."""

    explanation: str


class GenerateSqlRequest(BaseModel):
    """Body for ``POST /conversations/{id}/generate-sql``."""

    question: str = Field(..., min_length=1, max_length=5000)


class GenerateSqlResponse(BaseModel):
    """Response for ``POST /conversations/{id}/generate-sql``."""

    sql: str
    explanation: str


class ExportXlsxRequest(BaseModel):
    """Request body for XLSX export."""

    columns: list[str]
    rows: list[list[Any]]
    filename: str = "query-results"  # optional filename without extension


class ExportCsvRequest(BaseModel):
    """Request body for CSV export."""

    columns: list[str]
    rows: list[list[Any]]
    filename: str = "query-results"  # optional filename without extension


class ErrorResponse(BaseModel):
    """Standardized error response format."""

    error: str
    details: str | None = None


# ---------------------------------------------------------------------------
# Settings models (Dev Mode)
# ---------------------------------------------------------------------------


class UpdateSettingsRequest(BaseModel):
    """Body for ``PUT /settings``."""

    dev_mode: bool | None = None
    selected_model: str | None = None


class SettingsResponse(BaseModel):
    """Response for ``GET /settings`` and ``PUT /settings``."""

    dev_mode: bool
    selected_model: str


# ---------------------------------------------------------------------------
# Prompt Preview models (Dev Mode)
# ---------------------------------------------------------------------------


class PromptPreviewRequest(BaseModel):
    """Body for ``POST /conversations/{id}/prompt-preview``."""

    content: str = Field(..., min_length=1, max_length=10000)


class PromptPreviewResponse(BaseModel):
    """Response for ``POST /conversations/{id}/prompt-preview``."""

    system_prompt: str
    messages: list[dict]
    tools: list[str]
    new_message: str
    estimated_tokens: int


class CorrelationResponse(BaseModel):
    """Response for ``GET /conversations/{id}/datasets/{dataset_id}/correlations``."""

    columns: list[str]
    matrix: list[list[float | None]]
