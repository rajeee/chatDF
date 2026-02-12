"""Tests for Pydantic request/response models and domain exception classes.

Tests: spec/backend/rest_api/spec.md (request/response contracts)
Verifies: spec/backend/rest_api/plan.md#pydantic-requestresponse-models
"""

from __future__ import annotations

from datetime import datetime

import pytest
from pydantic import ValidationError


# ---------------------------------------------------------------------------
# Exception tests
# ---------------------------------------------------------------------------


class TestNotFoundError:
    """Tests for NotFoundError domain exception."""

    def test_stores_message(self):
        from app.exceptions import NotFoundError

        err = NotFoundError("Conversation not found")
        assert str(err) == "Conversation not found"
        assert err.message == "Conversation not found"

    def test_is_exception_subclass(self):
        from app.exceptions import NotFoundError

        assert issubclass(NotFoundError, Exception)


class TestRateLimitError:
    """Tests for RateLimitError domain exception."""

    def test_stores_message_and_resets_in_seconds(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("Rate limit exceeded", resets_in_seconds=120)
        assert str(err) == "Rate limit exceeded"
        assert err.message == "Rate limit exceeded"
        assert err.resets_in_seconds == 120

    def test_is_exception_subclass(self):
        from app.exceptions import RateLimitError

        assert issubclass(RateLimitError, Exception)


class TestConflictError:
    """Tests for ConflictError domain exception."""

    def test_stores_message(self):
        from app.exceptions import ConflictError

        err = ConflictError("Generation already in progress")
        assert str(err) == "Generation already in progress"
        assert err.message == "Generation already in progress"

    def test_is_exception_subclass(self):
        from app.exceptions import ConflictError

        assert issubclass(ConflictError, Exception)


# ---------------------------------------------------------------------------
# Request model tests
# ---------------------------------------------------------------------------


class TestGoogleLoginRequest:
    """Tests for GoogleLoginRequest model."""

    def test_referral_key_optional(self):
        from app.models import GoogleLoginRequest

        req = GoogleLoginRequest()
        assert req.referral_key is None

    def test_referral_key_provided(self):
        from app.models import GoogleLoginRequest

        req = GoogleLoginRequest(referral_key="abc-123")
        assert req.referral_key == "abc-123"


class TestSendMessageRequest:
    """Tests for SendMessageRequest model."""

    def test_valid_content(self):
        from app.models import SendMessageRequest

        req = SendMessageRequest(content="Hello")
        assert req.content == "Hello"

    def test_rejects_empty_content(self):
        from app.models import SendMessageRequest

        with pytest.raises(ValidationError) as exc_info:
            SendMessageRequest(content="")
        errors = exc_info.value.errors()
        assert any(e["type"] == "string_too_short" for e in errors)

    def test_rejects_content_over_max_length(self):
        from app.models import SendMessageRequest

        with pytest.raises(ValidationError) as exc_info:
            SendMessageRequest(content="x" * 10001)
        errors = exc_info.value.errors()
        assert any(e["type"] == "string_too_long" for e in errors)

    def test_accepts_content_at_max_length(self):
        from app.models import SendMessageRequest

        req = SendMessageRequest(content="x" * 10000)
        assert len(req.content) == 10000

    def test_rejects_missing_content(self):
        from app.models import SendMessageRequest

        with pytest.raises(ValidationError):
            SendMessageRequest()  # type: ignore[call-arg]


class TestAddDatasetRequest:
    """Tests for AddDatasetRequest model."""

    def test_valid_url(self):
        from app.models import AddDatasetRequest

        req = AddDatasetRequest(url="https://example.com/data.parquet")
        assert str(req.url) == "https://example.com/data.parquet"

    def test_rejects_missing_url(self):
        from app.models import AddDatasetRequest

        with pytest.raises(ValidationError):
            AddDatasetRequest()  # type: ignore[call-arg]


class TestRenameConversationRequest:
    """Tests for RenameConversationRequest model."""

    def test_valid_title(self):
        from app.models import RenameConversationRequest

        req = RenameConversationRequest(title="My Chat")
        assert req.title == "My Chat"

    def test_rejects_empty_title(self):
        from app.models import RenameConversationRequest

        with pytest.raises(ValidationError) as exc_info:
            RenameConversationRequest(title="")
        errors = exc_info.value.errors()
        assert any(e["type"] == "string_too_short" for e in errors)

    def test_rejects_title_over_max_length(self):
        from app.models import RenameConversationRequest

        with pytest.raises(ValidationError) as exc_info:
            RenameConversationRequest(title="x" * 101)
        errors = exc_info.value.errors()
        assert any(e["type"] == "string_too_long" for e in errors)

    def test_accepts_title_at_max_length(self):
        from app.models import RenameConversationRequest

        req = RenameConversationRequest(title="x" * 100)
        assert len(req.title) == 100


class TestRenameDatasetRequest:
    """Tests for RenameDatasetRequest model — validates SQL table name pattern."""

    def test_valid_table_name(self):
        from app.models import RenameDatasetRequest

        req = RenameDatasetRequest(tableName="my_table_1")
        assert req.tableName == "my_table_1"

    def test_valid_table_name_starts_with_underscore(self):
        from app.models import RenameDatasetRequest

        req = RenameDatasetRequest(tableName="_private")
        assert req.tableName == "_private"

    def test_valid_table_name_single_letter(self):
        from app.models import RenameDatasetRequest

        req = RenameDatasetRequest(tableName="x")
        assert req.tableName == "x"

    def test_rejects_table_name_starting_with_number(self):
        from app.models import RenameDatasetRequest

        with pytest.raises(ValidationError) as exc_info:
            RenameDatasetRequest(tableName="1table")
        errors = exc_info.value.errors()
        assert any(e["type"] == "string_pattern_mismatch" for e in errors)

    def test_rejects_table_name_with_spaces(self):
        from app.models import RenameDatasetRequest

        with pytest.raises(ValidationError):
            RenameDatasetRequest(tableName="my table")

    def test_rejects_table_name_with_special_chars(self):
        from app.models import RenameDatasetRequest

        with pytest.raises(ValidationError):
            RenameDatasetRequest(tableName="my-table")

    def test_rejects_empty_table_name(self):
        from app.models import RenameDatasetRequest

        with pytest.raises(ValidationError):
            RenameDatasetRequest(tableName="")

    def test_rejects_table_name_over_max_length(self):
        from app.models import RenameDatasetRequest

        with pytest.raises(ValidationError):
            RenameDatasetRequest(tableName="a" * 51)

    def test_accepts_table_name_at_max_length(self):
        from app.models import RenameDatasetRequest

        req = RenameDatasetRequest(tableName="a" * 50)
        assert len(req.tableName) == 50


# ---------------------------------------------------------------------------
# Response model tests
# ---------------------------------------------------------------------------


class TestUserResponse:
    """Tests for UserResponse model."""

    def test_all_fields(self):
        from app.models import UserResponse

        resp = UserResponse(
            user_id="u1",
            email="a@b.com",
            name="Alice",
            avatar_url="https://example.com/avatar.png",
        )
        assert resp.user_id == "u1"
        assert resp.email == "a@b.com"
        assert resp.name == "Alice"
        assert resp.avatar_url == "https://example.com/avatar.png"

    def test_avatar_url_optional(self):
        from app.models import UserResponse

        resp = UserResponse(user_id="u1", email="a@b.com", name="Alice")
        assert resp.avatar_url is None

    def test_serialization(self):
        from app.models import UserResponse

        resp = UserResponse(user_id="u1", email="a@b.com", name="Alice")
        data = resp.model_dump()
        assert data == {
            "user_id": "u1",
            "email": "a@b.com",
            "name": "Alice",
            "avatar_url": None,
        }


class TestConversationSummary:
    """Tests for ConversationSummary model."""

    def test_all_fields(self):
        from app.models import ConversationSummary

        now = datetime(2026, 1, 1, 12, 0, 0)
        summary = ConversationSummary(
            id="c1",
            title="Chat 1",
            created_at=now,
            updated_at=now,
            dataset_count=2,
        )
        assert summary.id == "c1"
        assert summary.title == "Chat 1"
        assert summary.dataset_count == 2


class TestConversationResponse:
    """Tests for ConversationResponse model (creation response)."""

    def test_all_fields(self):
        from app.models import ConversationResponse

        now = datetime(2026, 1, 1, 12, 0, 0)
        resp = ConversationResponse(id="c1", title="New Chat", created_at=now)
        assert resp.id == "c1"
        assert resp.title == "New Chat"
        assert resp.created_at == now


class TestConversationListResponse:
    """Tests for ConversationListResponse model."""

    def test_empty_list(self):
        from app.models import ConversationListResponse

        resp = ConversationListResponse(conversations=[])
        assert resp.conversations == []

    def test_with_conversations(self):
        from app.models import ConversationListResponse, ConversationSummary

        now = datetime(2026, 1, 1, 12, 0, 0)
        summary = ConversationSummary(
            id="c1", title="Chat", created_at=now, updated_at=now, dataset_count=0
        )
        resp = ConversationListResponse(conversations=[summary])
        assert len(resp.conversations) == 1
        assert resp.conversations[0].id == "c1"


class TestConversationDetailResponse:
    """Tests for ConversationDetailResponse model."""

    def test_all_fields(self):
        from app.models import ConversationDetailResponse

        now = datetime(2026, 1, 1, 12, 0, 0)
        resp = ConversationDetailResponse(
            id="c1",
            title="Chat 1",
            created_at=now,
            updated_at=now,
            messages=[],
            datasets=[],
        )
        assert resp.id == "c1"
        assert resp.messages == []
        assert resp.datasets == []


class TestMessageResponse:
    """Tests for MessageResponse model."""

    def test_all_fields(self):
        from app.models import MessageResponse

        now = datetime(2026, 1, 1, 12, 0, 0)
        resp = MessageResponse(
            id="m1",
            role="user",
            content="Hello",
            sql_query="SELECT 1",
            created_at=now,
        )
        assert resp.id == "m1"
        assert resp.role == "user"
        assert resp.content == "Hello"
        assert resp.sql_query == "SELECT 1"

    def test_sql_query_optional(self):
        from app.models import MessageResponse

        now = datetime(2026, 1, 1, 12, 0, 0)
        resp = MessageResponse(
            id="m1", role="assistant", content="Hi", created_at=now
        )
        assert resp.sql_query is None


class TestDatasetResponse:
    """Tests for DatasetResponse model."""

    def test_all_fields(self):
        from app.models import DatasetResponse

        resp = DatasetResponse(
            id="d1",
            name="sales",
            url="https://example.com/sales.parquet",
            row_count=1000,
            column_count=5,
        )
        assert resp.id == "d1"
        assert resp.name == "sales"
        assert resp.row_count == 1000
        assert resp.column_count == 5


class TestDatasetDetailResponse:
    """Tests for DatasetDetailResponse model (includes tableName and schema)."""

    def test_all_fields(self):
        from app.models import DatasetDetailResponse

        resp = DatasetDetailResponse(
            id="d1",
            name="sales",
            tableName="sales_data",
            url="https://example.com/sales.parquet",
            row_count=1000,
            column_count=5,
            schema={"columns": [{"name": "id", "type": "INTEGER"}]},
        )
        assert resp.tableName == "sales_data"
        assert resp.schema_ is not None  # aliased field

    def test_schema_optional(self):
        from app.models import DatasetDetailResponse

        resp = DatasetDetailResponse(
            id="d1",
            name="sales",
            tableName="sales_data",
            url="https://example.com/sales.parquet",
            row_count=1000,
            column_count=5,
        )
        assert resp.schema_ is None


class TestUsageResponse:
    """Tests for UsageResponse model."""

    def test_all_fields(self):
        from app.models import UsageResponse

        resp = UsageResponse(
            tokens_used=5000,
            token_limit=100000,
            remaining=95000,
            resets_in_seconds=3600,
            usage_percent=5.0,
        )
        assert resp.tokens_used == 5000
        assert resp.token_limit == 100000
        assert resp.remaining == 95000
        assert resp.resets_in_seconds == 3600
        assert resp.usage_percent == 5.0

    def test_serialization(self):
        from app.models import UsageResponse

        resp = UsageResponse(
            tokens_used=0,
            token_limit=100000,
            remaining=100000,
            resets_in_seconds=86400,
            usage_percent=0.0,
        )
        data = resp.model_dump()
        assert data["tokens_used"] == 0
        assert data["usage_percent"] == 0.0


class TestMessageAckResponse:
    """Tests for MessageAckResponse model."""

    def test_fields_and_status_literal(self):
        from app.models import MessageAckResponse

        resp = MessageAckResponse(message_id="m1", status="processing")
        assert resp.message_id == "m1"
        assert resp.status == "processing"

    def test_serialization(self):
        from app.models import MessageAckResponse

        resp = MessageAckResponse(message_id="m1", status="processing")
        data = resp.model_dump()
        assert data == {"message_id": "m1", "status": "processing"}


class TestDatasetAckResponse:
    """Tests for DatasetAckResponse model."""

    def test_fields_and_status_literal(self):
        from app.models import DatasetAckResponse

        resp = DatasetAckResponse(dataset_id="d1", status="loading")
        assert resp.dataset_id == "d1"
        assert resp.status == "loading"


class TestClearAllResponse:
    """Tests for ClearAllResponse model."""

    def test_fields(self):
        from app.models import ClearAllResponse

        resp = ClearAllResponse(success=True, deleted_count=3)
        assert resp.success is True
        assert resp.deleted_count == 3


class TestSuccessResponse:
    """Tests for SuccessResponse model."""

    def test_success_true(self):
        from app.models import SuccessResponse

        resp = SuccessResponse(success=True)
        assert resp.success is True


