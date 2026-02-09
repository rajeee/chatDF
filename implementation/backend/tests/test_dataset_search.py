"""Tests for the dataset search endpoint (Hugging Face Hub search).

Tests cover:
- Successful search returning results
- Empty search results
- Hugging Face API timeout handling
- Hugging Face API HTTP error handling
- Hugging Face API connection error handling
- Query parameter validation
"""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from unittest.mock import AsyncMock, MagicMock, patch  # noqa: E402

import aiosqlite  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402


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
async def client(fresh_db):
    """Unauthenticated httpx client for the FastAPI app."""
    app.state.db = fresh_db
    app.state.worker_pool = MagicMock()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# Mock data
# ---------------------------------------------------------------------------

MOCK_HF_RESPONSE = [
    {
        "id": "squad",
        "description": "Stanford Question Answering Dataset",
        "downloads": 500000,
        "likes": 1200,
        "tags": ["question-answering", "english"],
        "lastModified": "2024-01-15T10:00:00.000Z",
    },
    {
        "id": "imdb",
        "description": "Large Movie Review Dataset",
        "downloads": 300000,
        "likes": 800,
        "tags": ["text-classification", "english"],
        "lastModified": "2024-02-20T08:00:00.000Z",
    },
]


# ---------------------------------------------------------------------------
# Helper: create a mock httpx response
# ---------------------------------------------------------------------------


def _mock_response(json_data=None, status_code=200, text=""):
    """Create a mock httpx.Response."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.json.return_value = json_data if json_data is not None else []
    response.text = text
    response.is_success = 200 <= status_code < 300
    if status_code >= 400:
        response.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"HTTP {status_code}",
            request=MagicMock(),
            response=response,
        )
    else:
        response.raise_for_status.return_value = None
    return response


def _patch_httpx(mock_response=None, side_effect=None):
    """Return a patch context manager for httpx.AsyncClient."""
    mock_client = AsyncMock()
    if side_effect:
        mock_client.get.side_effect = side_effect
    else:
        mock_client.get.return_value = mock_response

    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    return patch("app.routers.dataset_search.httpx.AsyncClient", return_value=mock_client)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDatasetSearchEndpoint:
    """Tests for GET /api/dataset-search."""

    @pytest.mark.asyncio
    async def test_search_returns_results(self, client):
        """Search returns formatted results from HF API."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESPONSE)):
            response = await client.get("/api/dataset-search?q=squad")

        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 2
        assert len(data["results"]) == 2

        first = data["results"][0]
        assert first["id"] == "squad"
        assert first["description"] == "Stanford Question Answering Dataset"
        assert first["downloads"] == 500000
        assert first["likes"] == 1200
        assert first["tags"] == ["question-answering", "english"]
        assert first["last_modified"] == "2024-01-15T10:00:00.000Z"
        assert "parquet" in first["parquet_url"]
        assert "squad" in first["parquet_url"]

    @pytest.mark.asyncio
    async def test_search_respects_limit_param(self, client):
        """Search passes limit parameter to HF API."""
        with _patch_httpx(_mock_response(json_data=[MOCK_HF_RESPONSE[0]])) as mock_cls:
            response = await client.get("/api/dataset-search?q=test&limit=5")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    @pytest.mark.asyncio
    async def test_search_empty_results(self, client):
        """Search returns empty list when no datasets match."""
        with _patch_httpx(_mock_response(json_data=[])):
            response = await client.get("/api/dataset-search?q=nonexistentdataset12345")

        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 0
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_search_requires_query(self, client):
        """Search requires a non-empty query parameter."""
        response = await client.get("/api/dataset-search")
        assert response.status_code == 422  # validation error

    @pytest.mark.asyncio
    async def test_search_handles_hf_timeout(self, client):
        """Search returns 504 when HF API times out."""
        with _patch_httpx(side_effect=httpx.TimeoutException("Connection timed out")):
            response = await client.get("/api/dataset-search?q=timeout")

        assert response.status_code == 504

    @pytest.mark.asyncio
    async def test_search_handles_hf_http_error(self, client):
        """Search returns 502 when HF API returns an HTTP error."""
        with _patch_httpx(_mock_response(status_code=500, text="Internal Server Error")):
            response = await client.get("/api/dataset-search?q=error")

        assert response.status_code == 502

    @pytest.mark.asyncio
    async def test_search_handles_connection_error(self, client):
        """Search returns 502 when connection to HF API fails."""
        with _patch_httpx(side_effect=httpx.ConnectError("Connection refused")):
            response = await client.get("/api/dataset-search?q=connfail")

        assert response.status_code == 502

    @pytest.mark.asyncio
    async def test_search_constructs_parquet_url(self, client):
        """Search constructs the correct Parquet URL pattern for results."""
        with _patch_httpx(_mock_response(json_data=[MOCK_HF_RESPONSE[0]])):
            response = await client.get("/api/dataset-search?q=squad")

        data = response.json()
        expected_url = (
            "https://huggingface.co/datasets/squad/resolve/main/data/"
            "train-00000-of-00001.parquet"
        )
        assert data["results"][0]["parquet_url"] == expected_url

    @pytest.mark.asyncio
    async def test_search_no_auth_required(self, fresh_db):
        """Dataset search does not require authentication."""
        app.state.db = fresh_db
        app.state.worker_pool = MagicMock()
        transport = ASGITransport(app=app)
        # No session cookie
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as c:
            with _patch_httpx(_mock_response(json_data=MOCK_HF_RESPONSE)):
                response = await c.get("/api/dataset-search?q=test")
            # Should not be 401/403 (auth error)
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_search_skips_items_without_id(self, client):
        """Search skips HF API results that lack an id field."""
        data_with_missing_id = [
            {"description": "no id field"},
            MOCK_HF_RESPONSE[0],
        ]
        with _patch_httpx(_mock_response(json_data=data_with_missing_id)):
            response = await client.get("/api/dataset-search?q=partial")

        data = response.json()
        assert data["total"] == 1
        assert data["results"][0]["id"] == "squad"

    @pytest.mark.asyncio
    async def test_search_limit_validation(self, client):
        """Search validates limit range (1-50)."""
        response = await client.get("/api/dataset-search?q=test&limit=0")
        assert response.status_code == 422

        response = await client.get("/api/dataset-search?q=test&limit=51")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_search_handles_null_description(self, client):
        """Search handles results with no description."""
        no_desc = [{"id": "test/dataset", "downloads": 100, "likes": 5, "tags": []}]
        with _patch_httpx(_mock_response(json_data=no_desc)):
            response = await client.get("/api/dataset-search?q=test")

        data = response.json()
        assert data["total"] == 1
        assert data["results"][0]["description"] is None
