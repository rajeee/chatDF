"""Tests for the generate-sql endpoint.

Covers:
- POST /conversations/{id}/generate-sql -> generates SQL from natural language
- Returns 400 when no datasets are loaded
- Parses structured LLM response correctly
- Strips markdown code fences from generated SQL
- Requires authentication
"""

from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_session, make_user  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _insert_user(db: aiosqlite.Connection, user: dict) -> None:
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            user["google_id"],
            user["email"],
            user["name"],
            user["avatar_url"],
            user["created_at"],
            user["last_login_at"],
        ),
    )
    await db.commit()


async def _insert_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            session["id"],
            session["user_id"],
            session["created_at"],
            session["expires_at"],
        ),
    )
    await db.commit()


async def _insert_conversation(db: aiosqlite.Connection, conv_id: str, user_id: str) -> None:
    now = "2025-01-01T00:00:00"
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, user_id, "Test Conv", now, now),
    )
    await db.commit()


async def _insert_dataset(
    db: aiosqlite.Connection,
    dataset_id: str,
    conv_id: str,
    name: str = "sales",
    schema_json: str = "[]",
    column_descriptions: str = "{}",
    status: str = "ready",
) -> None:
    now = "2025-01-01T00:00:00"
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, loaded_at, column_descriptions) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (dataset_id, conv_id, "https://example.com/data.csv", name, 100, 3,
         schema_json, status, now, column_descriptions),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database with the full ChatDF schema."""
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA_SQL)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def test_user(fresh_db):
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_session(fresh_db, test_user):
    session = make_session(user_id=test_user["id"])
    await _insert_session(fresh_db, session)
    return session


@pytest_asyncio.fixture
async def authed_client(fresh_db, test_session):
    """Authenticated httpx client with session cookie."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as c:
        yield c


# =========================================================================
# Tests
# =========================================================================


class TestGenerateSql:
    """POST /conversations/{id}/generate-sql -> generate SQL from NL question."""

    @pytest.mark.asyncio
    async def test_returns_400_when_no_datasets(self, authed_client, fresh_db, test_user):
        """Returns 400 when no datasets are loaded in the conversation."""
        conv_id = "conv-no-datasets"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        response = await authed_client.post(
            f"/conversations/{conv_id}/generate-sql",
            json={"question": "Show me all sales"},
        )
        assert response.status_code == 400
        body = response.json()
        assert "No datasets" in body.get("detail", body.get("error", ""))

    @pytest.mark.asyncio
    async def test_generates_sql_successfully(self, authed_client, fresh_db, test_user):
        """Successfully generates SQL from a natural language question."""
        conv_id = "conv-with-data"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        schema = json.dumps([
            {"name": "id", "type": "INTEGER"},
            {"name": "product", "type": "TEXT"},
            {"name": "amount", "type": "FLOAT"},
        ])
        col_descs = json.dumps({"id": "Primary key", "product": "Product name", "amount": "Sale amount"})
        await _insert_dataset(
            fresh_db, "ds-1", conv_id,
            name="sales",
            schema_json=schema,
            column_descriptions=col_descs,
        )

        # Mock the Gemini LLM response
        mock_response = MagicMock()
        mock_response.text = "SQL: SELECT product, SUM(amount) FROM sales GROUP BY product LIMIT 1000\nEXPLANATION: This query calculates total sales per product."

        mock_generate = AsyncMock(return_value=mock_response)

        with patch("app.services.llm_service.client") as mock_client:
            mock_client.aio.models.generate_content = mock_generate

            response = await authed_client.post(
                f"/conversations/{conv_id}/generate-sql",
                json={"question": "What are total sales per product?"},
            )

        assert response.status_code == 200
        body = response.json()
        assert "sql" in body
        assert "explanation" in body
        assert "SELECT" in body["sql"]
        assert body["explanation"] != ""

    @pytest.mark.asyncio
    async def test_strips_markdown_fences(self, authed_client, fresh_db, test_user):
        """Strips markdown code fences from generated SQL."""
        conv_id = "conv-fences"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        schema = json.dumps([{"name": "id", "type": "INTEGER"}])
        await _insert_dataset(fresh_db, "ds-2", conv_id, schema_json=schema)

        # LLM returns SQL wrapped in markdown fences
        mock_response = MagicMock()
        mock_response.text = "SQL: ```sql\nSELECT * FROM sales LIMIT 1000\n```\nEXPLANATION: Selects all rows."

        mock_generate = AsyncMock(return_value=mock_response)

        with patch("app.services.llm_service.client") as mock_client:
            mock_client.aio.models.generate_content = mock_generate

            response = await authed_client.post(
                f"/conversations/{conv_id}/generate-sql",
                json={"question": "Show all data"},
            )

        assert response.status_code == 200
        body = response.json()
        # Should not contain markdown fences
        assert "```" not in body["sql"]
        assert "SELECT * FROM sales LIMIT 1000" in body["sql"]

    @pytest.mark.asyncio
    async def test_handles_unstructured_llm_response(self, authed_client, fresh_db, test_user):
        """Handles LLM response without the expected SQL:/EXPLANATION: format."""
        conv_id = "conv-unstructured"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        schema = json.dumps([{"name": "id", "type": "INTEGER"}])
        await _insert_dataset(fresh_db, "ds-3", conv_id, schema_json=schema)

        # LLM returns just raw SQL without structured format
        mock_response = MagicMock()
        mock_response.text = "SELECT * FROM sales LIMIT 10"

        mock_generate = AsyncMock(return_value=mock_response)

        with patch("app.services.llm_service.client") as mock_client:
            mock_client.aio.models.generate_content = mock_generate

            response = await authed_client.post(
                f"/conversations/{conv_id}/generate-sql",
                json={"question": "Show me data"},
            )

        assert response.status_code == 200
        body = response.json()
        assert "SELECT" in body["sql"]

    @pytest.mark.asyncio
    async def test_returns_502_on_llm_error(self, authed_client, fresh_db, test_user):
        """Returns 502 when the LLM call fails."""
        conv_id = "conv-llm-error"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        schema = json.dumps([{"name": "id", "type": "INTEGER"}])
        await _insert_dataset(fresh_db, "ds-4", conv_id, schema_json=schema)

        mock_generate = AsyncMock(side_effect=Exception("LLM service unavailable"))

        with patch("app.services.llm_service.client") as mock_client:
            mock_client.aio.models.generate_content = mock_generate

            response = await authed_client.post(
                f"/conversations/{conv_id}/generate-sql",
                json={"question": "Show data"},
            )

        assert response.status_code == 502

    @pytest.mark.asyncio
    async def test_validation_empty_question(self, authed_client, fresh_db, test_user):
        """Returns 422 for empty question."""
        conv_id = "conv-validation"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        response = await authed_client.post(
            f"/conversations/{conv_id}/generate-sql",
            json={"question": ""},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_ignores_non_ready_datasets(self, authed_client, fresh_db, test_user):
        """Only uses datasets with status='ready', ignores loading/error."""
        conv_id = "conv-status"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        # Insert a 'loading' dataset — should be ignored
        await _insert_dataset(
            fresh_db, "ds-loading", conv_id,
            name="loading_table",
            status="loading",
        )

        response = await authed_client.post(
            f"/conversations/{conv_id}/generate-sql",
            json={"question": "Show data"},
        )
        # Should get 400 since no ready datasets
        assert response.status_code == 400


class TestGenerateSqlAuth:
    """Unauthenticated requests to generate-sql return 401."""

    @pytest.mark.asyncio
    async def test_requires_auth(self, fresh_db, test_user):
        """POST /conversations/{id}/generate-sql without auth returns 401."""
        conv_id = "conv-auth-test"
        await _insert_conversation(fresh_db, conv_id, test_user["id"])

        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/conversations/{conv_id}/generate-sql",
                json={"question": "Show data"},
            )
            assert response.status_code == 401
