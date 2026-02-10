"""Dataset search endpoint tests.

Tests for the dataset_search router:
- GET /api/dataset-search?q={query}&limit={limit}  -- HF keyword search
- GET /api/dataset-discover?q={query}&limit={limit} -- NL discovery search
- Validation of query parameters (missing, empty, too long, out-of-range limit)
- Error propagation from upstream Hugging Face API (timeout, HTTP errors, connection errors)
- Response shape and field types

These endpoints are public (no authentication required).
"""

from __future__ import annotations

import math
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.routers.dataset_search import (
    PARQUET_URL_PATTERNS,
    _compute_relevance,
    extract_keywords,
    match_categories,
)
from tests.rest_api.conftest import assert_success_response


# ---------------------------------------------------------------------------
# Helpers -- mock HF API responses
# ---------------------------------------------------------------------------

def _make_hf_dataset(
    dataset_id: str = "org/dataset",
    description: str | None = "A test dataset",
    downloads: int = 1000,
    likes: int = 50,
    tags: list[str] | None = None,
    last_modified: str | None = "2025-06-01T12:00:00Z",
) -> dict:
    """Build a dict resembling a single item from the HF datasets API."""
    return {
        "id": dataset_id,
        "description": description,
        "downloads": downloads,
        "likes": likes,
        "tags": tags or ["task_categories:text-classification"],
        "lastModified": last_modified,
    }


def _make_hf_response_data(count: int = 3) -> list[dict]:
    """Generate a list of mock HF dataset items."""
    return [
        _make_hf_dataset(
            dataset_id=f"org/dataset-{i}",
            description=f"Description for dataset {i}",
            downloads=1000 * (count - i),
            likes=50 * (count - i),
        )
        for i in range(count)
    ]


def _mock_httpx_response(data: list[dict], status_code: int = 200) -> MagicMock:
    """Create a MagicMock mimicking httpx.Response with sync .json() and .raise_for_status()."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = data
    resp.raise_for_status.return_value = None
    return resp


def _patch_httpx_client(mock_response: MagicMock):
    """Context manager: patch httpx.AsyncClient so .get() returns mock_response.

    Returns the patch context manager.  The mock instance is accessible as the
    yielded value (the AsyncClient mock instance) for call inspection.
    """
    return _patch_httpx_client_with_get(AsyncMock(return_value=mock_response))


def _patch_httpx_client_with_get(get_mock: AsyncMock):
    """Context manager: patch httpx.AsyncClient with a custom .get mock."""
    patcher = patch("app.routers.dataset_search.httpx.AsyncClient")

    class _CtxMgr:
        def __enter__(self_):
            mock_cls = patcher.start()
            instance = AsyncMock()
            instance.get = get_mock
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = instance
            self_.instance = instance
            return instance

        def __exit__(self_, *args):
            patcher.stop()

    return _CtxMgr()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_httpx_success():
    """Patch httpx.AsyncClient.get to return a successful HF API response."""
    data = _make_hf_response_data(3)
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp) as instance:
        yield instance


@pytest.fixture
def mock_httpx_empty():
    """Patch httpx.AsyncClient.get to return an empty HF API response."""
    resp = _mock_httpx_response([])
    with _patch_httpx_client(resp) as instance:
        yield instance


@pytest.fixture
def mock_httpx_timeout():
    """Patch httpx.AsyncClient.get to raise a TimeoutException."""
    get_mock = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    with _patch_httpx_client_with_get(get_mock) as instance:
        yield instance


@pytest.fixture
def mock_httpx_http_error():
    """Patch httpx.AsyncClient.get to return a response whose raise_for_status raises."""
    resp = MagicMock()
    resp.status_code = 200  # get() itself succeeds
    resp.json.return_value = []
    resp.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Server Error",
        request=httpx.Request("GET", "https://huggingface.co/api/datasets"),
        response=httpx.Response(500, text="Internal Server Error"),
    )
    with _patch_httpx_client(resp) as instance:
        yield instance


@pytest.fixture
def mock_httpx_connection_error():
    """Patch httpx.AsyncClient.get to raise a connection error."""
    get_mock = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
    with _patch_httpx_client_with_get(get_mock) as instance:
        yield instance


@pytest.fixture
def client_no_auth():
    """httpx.AsyncClient pointing at the FastAPI app without auth cookies."""
    from app.main import app
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# =====================================================================
# Unit tests for helper functions
# =====================================================================


class TestExtractKeywords:
    """Tests for the extract_keywords utility function."""

    def test_removes_stop_words(self):
        result = extract_keywords("find me some climate data")
        assert "find" not in result
        assert "me" not in result
        assert "some" not in result
        assert "data" not in result
        assert "climate" in result

    def test_preserves_meaningful_words(self):
        result = extract_keywords("weather temperature global")
        assert result == ["weather", "temperature", "global"]

    def test_removes_punctuation(self):
        result = extract_keywords("climate, weather! temperature?")
        assert "climate" in result
        assert "weather" in result
        assert "temperature" in result

    def test_deduplicates_tokens(self):
        result = extract_keywords("climate climate climate")
        assert result.count("climate") == 1

    def test_lowercases_tokens(self):
        result = extract_keywords("CLIMATE Weather TEMPERATURE")
        assert "climate" in result
        assert "weather" in result
        assert "temperature" in result

    def test_filters_single_char_tokens(self):
        result = extract_keywords("a b c climate")
        # All single-char tokens removed (also 'a' is a stop word)
        assert result == ["climate"]

    def test_empty_after_stop_word_removal(self):
        result = extract_keywords("find me some data")
        assert result == []

    def test_preserves_order(self):
        result = extract_keywords("stock market financial reports quarterly")
        assert result == ["stock", "market", "financial", "reports", "quarterly"]


class TestMatchCategories:
    """Tests for the match_categories utility function."""

    def test_matches_climate_category(self):
        tags = match_categories("climate change data")
        assert "climate" in tags
        assert "weather" in tags
        assert "temperature" in tags

    def test_matches_finance_category(self):
        tags = match_categories("stock market analysis")
        assert "finance" in tags
        assert "stock" in tags

    def test_matches_by_tag_keyword(self):
        tags = match_categories("electricity usage data")
        # "electricity" is a keyword for the "energy" category
        assert "energy" in tags
        assert "electricity" in tags

    def test_no_match_returns_empty(self):
        tags = match_categories("random unrelated query xyz")
        assert tags == []

    def test_multiple_category_matches(self):
        tags = match_categories("climate and finance data")
        assert "climate" in tags
        assert "finance" in tags

    def test_deduplicates_tags(self):
        tags = match_categories("climate weather temperature")
        # All belong to same category, tags should be unique
        assert len(tags) == len(set(tags))


class TestComputeRelevance:
    """Tests for the _compute_relevance scoring function."""

    def test_perfect_keyword_match(self):
        item = {"id": "org/climate-data", "description": "climate data", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, ["climate"])
        # keyword_score = 1.0 * 50 = 50, popularity = log10(1)*5 + log10(1)*2 = 0
        assert score == 50.0

    def test_no_keywords_gives_zero_keyword_score(self):
        item = {"id": "org/test", "description": "test", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, [])
        # keyword_score = 0, popularity = 0
        assert score == 0.0

    def test_popularity_boosts_score(self):
        item = {"id": "org/test", "description": "test", "tags": [], "downloads": 10000, "likes": 100}
        score = _compute_relevance(item, [])
        # Only popularity component
        expected = round(math.log10(10001) * 5 + math.log10(101) * 2, 2)
        assert score == expected

    def test_partial_keyword_match(self):
        item = {"id": "org/climate-data", "description": "climate data", "tags": [], "downloads": 0, "likes": 0}
        score = _compute_relevance(item, ["climate", "missing_keyword"])
        # 1 of 2 keywords matched -> keyword_score = 0.5 * 50 = 25
        assert score == 25.0

    def test_combined_score(self):
        item = {"id": "org/climate", "description": "climate data", "tags": ["weather"], "downloads": 100, "likes": 10}
        score = _compute_relevance(item, ["climate"])
        keyword_score = 50.0  # 1/1 * 50
        pop_score = round(math.log10(101) * 5 + math.log10(11) * 2, 2)
        expected = round(keyword_score + pop_score, 2)
        assert score == expected


# =====================================================================
# Integration tests -- GET /api/dataset-search
# =====================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_success(authed_client, mock_httpx_success):
    """GET /api/dataset-search?q=test returns results from HF API."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test"})
    body = assert_success_response(response, status_code=200)

    assert "results" in body
    assert "total" in body
    assert body["total"] == 3
    assert len(body["results"]) == 3

    # Verify result structure
    first = body["results"][0]
    assert first["id"] == "org/dataset-0"
    assert first["description"] == "Description for dataset 0"
    assert first["downloads"] == 3000
    assert first["likes"] == 150
    assert isinstance(first["tags"], list)
    assert first["last_modified"] == "2025-06-01T12:00:00Z"
    assert first["parquet_url"] == PARQUET_URL_PATTERNS[0].format(id="org/dataset-0")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_empty_results(authed_client, mock_httpx_empty):
    """GET /api/dataset-search returns empty results when HF API returns none."""
    response = await authed_client.get("/api/dataset-search", params={"q": "nonexistent_xyz"})
    body = assert_success_response(response, status_code=200)

    assert body["total"] == 0
    assert body["results"] == []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_custom_limit(authed_client, mock_httpx_success):
    """GET /api/dataset-search respects the limit parameter passed to HF API."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test", "limit": 5})
    assert response.status_code == 200

    # Verify limit was forwarded to HF API call
    call_kwargs = mock_httpx_success.get.call_args
    params = call_kwargs.kwargs.get("params") or (call_kwargs[1]["params"] if len(call_kwargs) > 1 else {})
    assert params.get("limit") == 5


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_missing_query(authed_client):
    """GET /api/dataset-search without q param returns 422 (validation error)."""
    response = await authed_client.get("/api/dataset-search")
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_empty_query(authed_client):
    """GET /api/dataset-search?q= (empty) returns 422 due to min_length=1."""
    response = await authed_client.get("/api/dataset-search", params={"q": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_limit_below_minimum(authed_client):
    """GET /api/dataset-search with limit=0 returns 422 (ge=1 constraint)."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test", "limit": 0})
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_limit_above_maximum(authed_client):
    """GET /api/dataset-search with limit=100 returns 422 (le=50 constraint)."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test", "limit": 100})
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_timeout(authed_client, mock_httpx_timeout):
    """GET /api/dataset-search returns 504 when HF API times out."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test"})
    assert response.status_code == 504
    body = response.json()
    error_msg = (body.get("detail") or body.get("error") or "").lower()
    assert "timed out" in error_msg


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_http_error(authed_client, mock_httpx_http_error):
    """GET /api/dataset-search returns 502 when HF API returns HTTP error."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test"})
    assert response.status_code == 502
    body = response.json()
    error_msg = body.get("detail") or body.get("error") or ""
    assert "500" in error_msg


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_connection_error(authed_client, mock_httpx_connection_error):
    """GET /api/dataset-search returns 502 when cannot connect to HF API."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test"})
    assert response.status_code == 502
    body = response.json()
    error_msg = (body.get("detail") or body.get("error") or "").lower()
    assert "failed to connect" in error_msg


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_skips_items_without_id(authed_client):
    """Items with missing/empty id are skipped in the response."""
    data = [
        _make_hf_dataset(dataset_id="org/valid"),
        {"description": "no id field", "downloads": 0, "likes": 0, "tags": []},
        _make_hf_dataset(dataset_id=""),
    ]
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get("/api/dataset-search", params={"q": "test"})

    body = assert_success_response(response, status_code=200)
    assert body["total"] == 1
    assert body["results"][0]["id"] == "org/valid"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_description_fallback_to_card_data(authed_client):
    """When description is None, falls back to cardData.description."""
    data = [{
        "id": "org/fallback",
        "description": None,
        "cardData": {"description": "From card data"},
        "downloads": 10,
        "likes": 1,
        "tags": [],
        "lastModified": "2025-01-01T00:00:00Z",
    }]
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get("/api/dataset-search", params={"q": "test"})

    body = assert_success_response(response, status_code=200)
    assert body["results"][0]["description"] == "From card data"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_parquet_url_format(authed_client, mock_httpx_success):
    """Parquet URL is constructed using the first pattern template."""
    response = await authed_client.get("/api/dataset-search", params={"q": "test"})
    body = assert_success_response(response, status_code=200)

    for result in body["results"]:
        expected_url = PARQUET_URL_PATTERNS[0].format(id=result["id"])
        assert result["parquet_url"] == expected_url


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_no_auth_required(client_no_auth, mock_httpx_success):
    """dataset-search endpoints are public -- no session cookie needed."""
    async with client_no_auth as client:
        response = await client.get("/api/dataset-search", params={"q": "test"})
    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_datasets_query_too_long(authed_client):
    """GET /api/dataset-search with q exceeding max_length=200 returns 422."""
    long_query = "x" * 201
    response = await authed_client.get("/api/dataset-search", params={"q": long_query})
    assert response.status_code == 422


# =====================================================================
# Integration tests -- GET /api/dataset-discover
# =====================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_success(authed_client):
    """GET /api/dataset-discover returns results with relevance scores and keywords."""
    data = _make_hf_response_data(3)
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "weather patterns analysis"}
        )

    body = assert_success_response(response, status_code=200)
    assert "results" in body
    assert "total" in body
    assert "keywords" in body
    assert "matched_categories" in body
    assert isinstance(body["results"], list)
    assert isinstance(body["keywords"], list)
    assert isinstance(body["matched_categories"], list)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_result_structure(authed_client):
    """Each discover result includes relevance_score on top of base fields."""
    data = [_make_hf_dataset(dataset_id="org/weather-data", description="Global weather patterns")]
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "weather prediction"}
        )

    body = assert_success_response(response, status_code=200)
    assert body["total"] >= 1
    result = body["results"][0]

    # All standard fields
    assert "id" in result
    assert "description" in result
    assert "downloads" in result
    assert "likes" in result
    assert "tags" in result
    assert "last_modified" in result
    assert "parquet_url" in result
    # Discovery-specific field
    assert "relevance_score" in result
    assert isinstance(result["relevance_score"], (int, float))


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_extracts_keywords(authed_client):
    """The response keywords field contains extracted meaningful words from query."""
    resp = _mock_httpx_response([])
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover",
            params={"q": "find me climate temperature records"},
        )

    body = assert_success_response(response, status_code=200)
    # "find", "me" are stop words; "climate", "temperature", "records" should remain
    assert "climate" in body["keywords"]
    assert "temperature" in body["keywords"]
    assert "records" in body["keywords"]
    assert "find" not in body["keywords"]
    assert "me" not in body["keywords"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_matches_categories(authed_client):
    """When query matches a known category, matched_categories includes its tags."""
    resp = _mock_httpx_response([])
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover",
            params={"q": "climate change global warming"},
        )

    body = assert_success_response(response, status_code=200)
    assert "climate" in body["matched_categories"]
    assert "weather" in body["matched_categories"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_missing_query(authed_client):
    """GET /api/dataset-discover without q param returns 422."""
    response = await authed_client.get("/api/dataset-discover")
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_empty_query(authed_client):
    """GET /api/dataset-discover?q= (empty) returns 422 due to min_length=1."""
    response = await authed_client.get("/api/dataset-discover", params={"q": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_limit_below_minimum(authed_client):
    """GET /api/dataset-discover with limit=0 returns 422."""
    response = await authed_client.get(
        "/api/dataset-discover", params={"q": "test", "limit": 0}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_limit_above_maximum(authed_client):
    """GET /api/dataset-discover with limit=100 returns 422."""
    response = await authed_client.get(
        "/api/dataset-discover", params={"q": "test", "limit": 100}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_results_sorted_by_relevance(authed_client):
    """Discover results are sorted by relevance_score descending."""
    data = [
        _make_hf_dataset(dataset_id="org/low", description="unrelated", downloads=1, likes=0),
        _make_hf_dataset(dataset_id="org/high", description="climate weather temperature", downloads=10000, likes=500),
        _make_hf_dataset(dataset_id="org/mid", description="climate", downloads=100, likes=10),
    ]
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "climate weather"}
        )

    body = assert_success_response(response, status_code=200)
    scores = [r["relevance_score"] for r in body["results"]]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_deduplicates_results(authed_client):
    """When multiple searches return the same dataset, it appears only once."""
    dup_item = _make_hf_dataset(dataset_id="org/climate-dup", description="climate data")
    resp = _mock_httpx_response([dup_item])
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover",
            params={"q": "climate weather data"},
        )

    body = assert_success_response(response, status_code=200)
    ids = [r["id"] for r in body["results"]]
    # Even though multiple searches ran, the item should appear only once
    assert ids.count("org/climate-dup") == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_handles_hf_failure_gracefully(authed_client):
    """When HF API fails during discover, the endpoint still returns (empty results)."""
    get_mock = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    with _patch_httpx_client_with_get(get_mock):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "climate data"}
        )

    # discover uses _search_hf which catches exceptions and returns []
    body = assert_success_response(response, status_code=200)
    assert body["total"] == 0
    assert body["results"] == []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_no_auth_required(client_no_auth):
    """dataset-discover endpoint is public -- no session cookie needed."""
    resp = _mock_httpx_response([])
    with _patch_httpx_client(resp):
        async with client_no_auth as client:
            response = await client.get(
                "/api/dataset-discover", params={"q": "test query"}
            )

    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_custom_limit(authed_client):
    """GET /api/dataset-discover respects the limit parameter for result count."""
    data = _make_hf_response_data(5)
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "test data analysis", "limit": 2}
        )

    body = assert_success_response(response, status_code=200)
    assert body["total"] <= 2
    assert len(body["results"]) <= 2


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_only_stop_words_query(authed_client):
    """When query is only stop words, keywords empty but search still runs on raw query."""
    data = _make_hf_response_data(1)
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "find me some data"}
        )

    body = assert_success_response(response, status_code=200)
    # All tokens are stop words, so keywords should be empty
    assert body["keywords"] == []
    # But search still ran using the raw query as fallback
    assert isinstance(body["results"], list)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_query_too_long(authed_client):
    """GET /api/dataset-discover with q exceeding max_length=500 returns 422."""
    long_query = "x" * 501
    response = await authed_client.get("/api/dataset-discover", params={"q": long_query})
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_parquet_url_format(authed_client):
    """Discover results also construct parquet URLs using the standard pattern."""
    data = [_make_hf_dataset(dataset_id="user/my-dataset")]
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "my special dataset"}
        )

    body = assert_success_response(response, status_code=200)
    for result in body["results"]:
        expected_url = PARQUET_URL_PATTERNS[0].format(id=result["id"])
        assert result["parquet_url"] == expected_url


@pytest.mark.asyncio
@pytest.mark.integration
async def test_discover_datasets_description_fallback_to_card_data(authed_client):
    """Discover also falls back to cardData.description when description is None."""
    data = [{
        "id": "org/fallback-discover",
        "description": None,
        "cardData": {"description": "Card data description"},
        "downloads": 10,
        "likes": 1,
        "tags": [],
        "lastModified": "2025-01-01T00:00:00Z",
    }]
    resp = _mock_httpx_response(data)
    with _patch_httpx_client(resp):
        response = await authed_client.get(
            "/api/dataset-discover", params={"q": "fallback test"}
        )

    body = assert_success_response(response, status_code=200)
    assert body["results"][0]["description"] == "Card data description"
