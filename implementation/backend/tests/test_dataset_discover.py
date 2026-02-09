"""Tests for the dataset discovery endpoint (NL dataset search).

Tests cover:
- Keyword extraction from natural language queries
- Category matching logic
- Relevance scoring
- Successful discovery returning ranked results
- Empty results handling
- HF API error handling
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
from app.routers.dataset_search import (  # noqa: E402
    CATEGORY_TAGS,
    extract_keywords,
    match_categories,
    _compute_relevance,
)
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

MOCK_HF_RESULTS = [
    {
        "id": "climate-data/global-temperature",
        "description": "Global temperature records from 1880 to present",
        "downloads": 250000,
        "likes": 500,
        "tags": ["climate", "temperature", "environment"],
        "lastModified": "2024-03-01T10:00:00.000Z",
    },
    {
        "id": "weather-station/daily-readings",
        "description": "Daily weather station readings worldwide",
        "downloads": 100000,
        "likes": 200,
        "tags": ["weather", "meteorology"],
        "lastModified": "2024-02-15T08:00:00.000Z",
    },
    {
        "id": "finance-hub/stock-prices",
        "description": "Historical stock price data for major exchanges",
        "downloads": 500000,
        "likes": 1000,
        "tags": ["finance", "stock", "economics"],
        "lastModified": "2024-04-01T12:00:00.000Z",
    },
]


# ---------------------------------------------------------------------------
# Helper: mock httpx
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

    return patch(
        "app.routers.dataset_search.httpx.AsyncClient",
        return_value=mock_client,
    )


# ---------------------------------------------------------------------------
# Unit tests: keyword extraction
# ---------------------------------------------------------------------------


class TestExtractKeywords:
    """Tests for the extract_keywords function."""

    def test_removes_stop_words(self):
        """Stop words like 'show', 'me', 'the' are removed."""
        keywords = extract_keywords("show me the climate data")
        assert "show" not in keywords
        assert "me" not in keywords
        assert "the" not in keywords
        assert "climate" in keywords

    def test_extracts_meaningful_terms(self):
        """Meaningful nouns and adjectives are preserved."""
        keywords = extract_keywords("financial stock market prices")
        assert "financial" in keywords
        assert "stock" in keywords
        assert "market" in keywords
        assert "prices" in keywords

    def test_removes_duplicates(self):
        """Duplicate tokens are removed."""
        keywords = extract_keywords("weather weather temperature")
        assert keywords.count("weather") == 1
        assert keywords.count("temperature") == 1

    def test_lowercases_input(self):
        """All tokens are lowercased."""
        keywords = extract_keywords("Climate Temperature WEATHER")
        assert all(kw == kw.lower() for kw in keywords)

    def test_removes_punctuation(self):
        """Punctuation is stripped from the query."""
        keywords = extract_keywords("climate, weather! temperature?")
        assert "climate" in keywords
        assert "weather" in keywords
        assert "temperature" in keywords

    def test_empty_query(self):
        """Empty query returns empty list."""
        assert extract_keywords("") == []

    def test_only_stop_words(self):
        """Query with only stop words returns empty list."""
        assert extract_keywords("show me the data") == []

    def test_single_char_tokens_removed(self):
        """Single character tokens are filtered out."""
        keywords = extract_keywords("I want a big dataset")
        assert "i" not in keywords
        assert "a" not in keywords
        assert "big" in keywords

    def test_preserves_order(self):
        """Keywords are returned in the order they first appear."""
        keywords = extract_keywords("stock market financial analysis")
        assert keywords == ["stock", "market", "financial", "analysis"]


# ---------------------------------------------------------------------------
# Unit tests: category matching
# ---------------------------------------------------------------------------


class TestMatchCategories:
    """Tests for the match_categories function."""

    def test_matches_climate(self):
        """'climate' in query matches climate category tags."""
        tags = match_categories("I need climate data")
        assert "climate" in tags
        assert "weather" in tags
        assert "temperature" in tags

    def test_matches_finance(self):
        """'finance' in query matches finance category tags."""
        tags = match_categories("Looking for finance datasets")
        assert "finance" in tags
        assert "stock" in tags

    def test_matches_health(self):
        """'medical' keyword triggers health category."""
        tags = match_categories("medical records data")
        assert "health" in tags
        assert "medical" in tags

    def test_no_match(self):
        """Query with no category keywords returns empty list."""
        tags = match_categories("random unrelated text")
        assert tags == []

    def test_multiple_categories(self):
        """Query matching multiple categories returns tags from all."""
        tags = match_categories("climate and finance data")
        assert "climate" in tags
        assert "finance" in tags

    def test_case_insensitive(self):
        """Matching is case insensitive."""
        tags = match_categories("CLIMATE DATA")
        assert "climate" in tags

    def test_deduplicates_tags(self):
        """Returned tags are unique."""
        tags = match_categories("climate weather temperature environment")
        assert len(tags) == len(set(tags))


# ---------------------------------------------------------------------------
# Unit tests: relevance scoring
# ---------------------------------------------------------------------------


class TestComputeRelevance:
    """Tests for the _compute_relevance function."""

    def test_keyword_match_increases_score(self):
        """Items matching more keywords have higher scores."""
        item = {"id": "test", "description": "climate temperature data", "tags": [], "downloads": 0, "likes": 0}
        score_two = _compute_relevance(item, ["climate", "temperature"])
        score_one = _compute_relevance(item, ["climate", "nonexistent"])
        assert score_two > score_one

    def test_downloads_increase_score(self):
        """Items with more downloads score higher."""
        item_high = {"id": "test", "description": "", "tags": [], "downloads": 1000000, "likes": 0}
        item_low = {"id": "test", "description": "", "tags": [], "downloads": 10, "likes": 0}
        assert _compute_relevance(item_high, []) > _compute_relevance(item_low, [])

    def test_likes_increase_score(self):
        """Items with more likes score higher."""
        item_high = {"id": "test", "description": "", "tags": [], "downloads": 0, "likes": 10000}
        item_low = {"id": "test", "description": "", "tags": [], "downloads": 0, "likes": 1}
        assert _compute_relevance(item_high, []) > _compute_relevance(item_low, [])

    def test_no_keywords_returns_positive_score(self):
        """Even with no keywords, popular items get a positive score."""
        item = {"id": "test", "description": "", "tags": [], "downloads": 1000, "likes": 100}
        score = _compute_relevance(item, [])
        assert score > 0

    def test_empty_item(self):
        """Score for an empty item with no keywords is 0."""
        item = {"id": "", "description": "", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, [])
        assert score == 0.0


# ---------------------------------------------------------------------------
# Integration tests: GET /api/dataset-discover
# ---------------------------------------------------------------------------


class TestDatasetDiscoverEndpoint:
    """Tests for GET /api/dataset-discover."""

    @pytest.mark.asyncio
    async def test_discover_returns_results(self, client):
        """Discovery returns results ranked by relevance."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=climate temperature data"
            )

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "total" in data
        assert "keywords" in data
        assert "matched_categories" in data
        assert data["total"] > 0

    @pytest.mark.asyncio
    async def test_discover_includes_relevance_score(self, client):
        """Each result includes a relevance_score field."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=stock market prices"
            )

        data = response.json()
        for result in data["results"]:
            assert "relevance_score" in result
            assert isinstance(result["relevance_score"], (int, float))

    @pytest.mark.asyncio
    async def test_discover_extracts_keywords(self, client):
        """Response includes extracted keywords."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=show me climate temperature datasets"
            )

        data = response.json()
        assert "climate" in data["keywords"]
        assert "temperature" in data["keywords"]
        # Stop words should not appear
        assert "show" not in data["keywords"]
        assert "me" not in data["keywords"]

    @pytest.mark.asyncio
    async def test_discover_matches_categories(self, client):
        """Response includes matched category tags when query mentions categories."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=climate data worldwide"
            )

        data = response.json()
        # 'climate' should trigger the climate category
        assert "climate" in data["matched_categories"]

    @pytest.mark.asyncio
    async def test_discover_empty_results(self, client):
        """Discovery returns empty list when no datasets match."""
        with _patch_httpx(_mock_response(json_data=[])):
            response = await client.get(
                "/api/dataset-discover?q=completely nonexistent topic xyz"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_discover_requires_query(self, client):
        """Discovery requires a non-empty query parameter."""
        response = await client.get("/api/dataset-discover")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_discover_respects_limit(self, client):
        """Discovery respects the limit parameter."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=data&limit=2"
            )

        data = response.json()
        assert len(data["results"]) <= 2

    @pytest.mark.asyncio
    async def test_discover_constructs_parquet_url(self, client):
        """Results include correctly constructed Parquet URLs."""
        with _patch_httpx(_mock_response(json_data=[MOCK_HF_RESULTS[0]])):
            response = await client.get(
                "/api/dataset-discover?q=climate"
            )

        data = response.json()
        if data["results"]:
            result = data["results"][0]
            assert "parquet" in result["parquet_url"]
            assert result["id"] in result["parquet_url"]

    @pytest.mark.asyncio
    async def test_discover_handles_hf_failure(self, client):
        """Discovery returns empty results when HF API fails (graceful degradation)."""
        with _patch_httpx(side_effect=httpx.TimeoutException("timed out")):
            response = await client.get(
                "/api/dataset-discover?q=climate data"
            )

        # The discover endpoint catches HF errors gracefully
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_discover_results_sorted_by_relevance(self, client):
        """Results are sorted by relevance score descending."""
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=climate temperature"
            )

        data = response.json()
        scores = [r["relevance_score"] for r in data["results"]]
        assert scores == sorted(scores, reverse=True)

    @pytest.mark.asyncio
    async def test_discover_deduplicates_results(self, client):
        """Discovery deduplicates results from multiple search queries."""
        # Both keyword and category searches may return the same dataset
        with _patch_httpx(_mock_response(json_data=MOCK_HF_RESULTS)):
            response = await client.get(
                "/api/dataset-discover?q=climate weather temperature"
            )

        data = response.json()
        ids = [r["id"] for r in data["results"]]
        assert len(ids) == len(set(ids))

    @pytest.mark.asyncio
    async def test_discover_limit_validation(self, client):
        """Discovery validates limit range (1-50)."""
        response = await client.get("/api/dataset-discover?q=test&limit=0")
        assert response.status_code == 422

        response = await client.get("/api/dataset-discover?q=test&limit=51")
        assert response.status_code == 422
