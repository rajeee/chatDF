"""Tests for the catalog_search router.

Covers:
- Helper functions: _sanitize_fts_query, _parse_theme
- GET /api/catalog-search: FTS5 search, format filtering, pagination, error handling
- GET /api/catalog-count: total counts, format filtering, error handling
"""

from __future__ import annotations

import json

import pytest

from app.routers.catalog_search import _parse_theme, _sanitize_fts_query


# ---------------------------------------------------------------------------
# Unit tests: _sanitize_fts_query
# ---------------------------------------------------------------------------


class TestSanitizeFtsQuery:
    def test_plain_words(self):
        assert _sanitize_fts_query("climate data") == "climate data"

    def test_strips_special_characters(self):
        assert _sanitize_fts_query("climate (data) hello") == "climate data hello"

    def test_strips_fts5_operators(self):
        """Quotes, asterisks, colons etc. are stripped."""
        assert _sanitize_fts_query('"exact phrase"') == "exact phrase"
        assert _sanitize_fts_query("prefix*") == "prefix"

    def test_strips_fts5_keywords(self):
        """FTS5 reserved words (AND, OR, NOT, NEAR) are removed."""
        assert _sanitize_fts_query("climate OR temperature") == "climate temperature"
        assert _sanitize_fts_query("NOT pollution") == "pollution"
        assert _sanitize_fts_query("air NEAR quality") == "air quality"
        assert _sanitize_fts_query("data AND climate") == "data climate"

    def test_filters_short_tokens(self):
        """Single-character tokens are removed."""
        result = _sanitize_fts_query("a big b dataset")
        assert result == "big dataset"

    def test_empty_after_sanitization(self):
        """Falls back to raw.strip() when all tokens are removed."""
        result = _sanitize_fts_query("- .")
        assert result == "- ."

    def test_whitespace_only(self):
        result = _sanitize_fts_query("   ")
        assert result == ""

    def test_unicode_preserved(self):
        result = _sanitize_fts_query("données météo")
        assert result == "données météo"


# ---------------------------------------------------------------------------
# Unit tests: _parse_theme
# ---------------------------------------------------------------------------


class TestParseTheme:
    def test_none(self):
        assert _parse_theme(None) == []

    def test_empty_string(self):
        assert _parse_theme("") == []

    def test_whitespace_only(self):
        assert _parse_theme("   ") == []

    def test_json_array(self):
        result = _parse_theme('["Environment", "Climate"]')
        assert result == ["Environment", "Climate"]

    def test_json_array_with_non_strings(self):
        result = _parse_theme('[1, "two", null]')
        assert result == ["1", "two", "None"]

    def test_plain_string(self):
        result = _parse_theme("Environment")
        assert result == ["Environment"]

    def test_invalid_json(self):
        result = _parse_theme("{broken")
        assert result == ["{broken"]

    def test_json_object_not_array(self):
        """JSON objects are not treated as arrays."""
        result = _parse_theme('{"key": "value"}')
        assert result == ['{"key": "value"}']


# ---------------------------------------------------------------------------
# Integration tests: API endpoints with in-memory FTS5 catalog DB
# ---------------------------------------------------------------------------

import aiosqlite
from httpx import ASGITransport, AsyncClient

CATALOG_SCHEMA = """\
CREATE TABLE datasets (
    id                TEXT PRIMARY KEY,
    title             TEXT,
    notes             TEXT,
    publisher_extra   TEXT,
    theme             TEXT,
    landing_page      TEXT,
    metadata_modified TEXT
);

CREATE VIRTUAL TABLE datasets_fts USING fts5(
    title, notes, publisher_extra, theme,
    content='datasets',
    content_rowid='rowid'
);

CREATE TABLE resources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id  TEXT NOT NULL REFERENCES datasets(id),
    url         TEXT,
    format      TEXT,
    name        TEXT,
    position    INTEGER DEFAULT 0
);
"""

SEED_DATA = """\
INSERT INTO datasets VALUES
    ('ds-1', 'Climate Temperature Records', 'Global temperature data 1880-2024', 'NOAA', '["Environment", "Climate"]', 'https://data.gov/ds-1', '2024-01-15'),
    ('ds-2', 'Census Population Data', 'US population by state', 'Census Bureau', '["Demographics"]', 'https://data.gov/ds-2', '2023-06-01'),
    ('ds-3', 'Air Quality Measurements', 'PM2.5 and ozone readings', 'EPA', '["Environment"]', 'https://data.gov/ds-3', '2024-03-10'),
    ('ds-4', 'Budget Allocations', 'Federal budget data by agency', 'Treasury', NULL, NULL, '2023-12-01'),
    ('ds-5', 'Weather Stations', 'Weather station locations and metadata', 'NOAA', '["Environment", "Climate"]', 'https://data.gov/ds-5', '2024-02-20');

INSERT INTO datasets_fts(rowid, title, notes, publisher_extra, theme)
    SELECT rowid, title, notes, publisher_extra, theme FROM datasets;

INSERT INTO resources (dataset_id, url, format, name, position) VALUES
    ('ds-1', 'https://example.com/climate.csv', 'CSV', 'Climate CSV', 0),
    ('ds-1', 'https://example.com/climate.json', 'JSON', 'Climate JSON', 1),
    ('ds-2', 'https://example.com/census.xlsx', 'XLSX', 'Census Excel', 0),
    ('ds-2', 'https://example.com/census.csv', 'CSV', 'Census CSV', 1),
    ('ds-3', 'https://example.com/air.parquet', 'Parquet', 'Air Parquet', 0),
    ('ds-3', 'https://example.com/air.csv', 'CSV', 'Air Quality CSV', 1),
    ('ds-4', 'https://example.com/budget.json', 'JSON', 'Budget JSON', 0),
    ('ds-5', '', 'CSV', 'Empty URL resource', 0),
    ('ds-5', NULL, 'JSON', 'Null URL resource', 1),
    ('ds-5', 'https://example.com/weather.geojson', 'GeoJSON', 'Weather GeoJSON', 2);
"""


@pytest.fixture
async def catalog_db():
    """Create an in-memory SQLite DB with FTS5 catalog schema and seed data."""
    db = await aiosqlite.connect(":memory:")
    await db.executescript(CATALOG_SCHEMA)
    await db.executescript(SEED_DATA)
    await db.commit()
    yield db
    await db.close()


@pytest.fixture
def app_with_catalog(catalog_db):
    """Return the FastAPI app with catalog_db attached to state."""
    import os
    os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
    os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

    from fastapi import FastAPI
    from app.routers.catalog_search import router

    test_app = FastAPI()
    test_app.include_router(router, prefix="/api")
    test_app.state.catalog_db = catalog_db
    return test_app


@pytest.fixture
async def client(app_with_catalog):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_catalog),
        base_url="http://test",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /api/catalog-search
# ---------------------------------------------------------------------------


class TestCatalogSearch:
    @pytest.mark.asyncio
    async def test_basic_search(self, client):
        resp = await client.get("/api/catalog-search", params={"q": "climate"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["query"] == "climate"
        assert data["total"] >= 1
        assert len(data["results"]) >= 1
        # ds-1 should match "Climate Temperature Records"
        ids = [r["id"] for r in data["results"]]
        assert "ds-1" in ids

    @pytest.mark.asyncio
    async def test_search_returns_resources(self, client):
        resp = await client.get("/api/catalog-search", params={"q": "climate"})
        data = resp.json()
        ds1 = next(r for r in data["results"] if r["id"] == "ds-1")
        # ds-1 has CSV and JSON resources
        formats = [r["format"] for r in ds1["resources"]]
        assert "CSV" in formats
        assert "JSON" in formats

    @pytest.mark.asyncio
    async def test_resources_exclude_empty_urls(self, client):
        """ds-5 has empty and NULL URL resources; only GeoJSON should appear."""
        resp = await client.get("/api/catalog-search", params={"q": "weather stations"})
        data = resp.json()
        ds5 = next((r for r in data["results"] if r["id"] == "ds-5"), None)
        if ds5:
            urls = [r["url"] for r in ds5["resources"]]
            assert all(url for url in urls), "No empty URLs should be returned"

    @pytest.mark.asyncio
    async def test_format_filter_csv(self, client):
        resp = await client.get(
            "/api/catalog-search", params={"q": "data", "formats": "csv"}
        )
        data = resp.json()
        assert data["total"] >= 1
        # All returned datasets should have at least one CSV resource
        for result in data["results"]:
            resource_formats = [r["format"].lower() for r in result["resources"]]
            assert "csv" in resource_formats

    @pytest.mark.asyncio
    async def test_format_filter_parquet(self, client):
        resp = await client.get(
            "/api/catalog-search", params={"q": "air quality", "formats": "parquet"}
        )
        data = resp.json()
        assert data["total"] >= 1
        ids = [r["id"] for r in data["results"]]
        assert "ds-3" in ids

    @pytest.mark.asyncio
    async def test_format_filter_multiple(self, client):
        resp = await client.get(
            "/api/catalog-search", params={"q": "data", "formats": "csv,json"}
        )
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_format_filter_invalid_formats_ignored(self, client):
        """Invalid formats are stripped; if none remain, no filter applied."""
        resp = await client.get(
            "/api/catalog-search", params={"q": "climate", "formats": "pdf,docx"}
        )
        data = resp.json()
        # Falls back to unfiltered search
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_pagination_limit(self, client):
        resp = await client.get(
            "/api/catalog-search", params={"q": "data", "limit": 2}
        )
        data = resp.json()
        assert len(data["results"]) <= 2

    @pytest.mark.asyncio
    async def test_pagination_offset(self, client):
        # Get first page
        resp1 = await client.get(
            "/api/catalog-search", params={"q": "data", "limit": 2, "offset": 0}
        )
        # Get second page
        resp2 = await client.get(
            "/api/catalog-search", params={"q": "data", "limit": 2, "offset": 2}
        )
        data1, data2 = resp1.json(), resp2.json()
        ids1 = {r["id"] for r in data1["results"]}
        ids2 = {r["id"] for r in data2["results"]}
        # No overlap between pages
        assert ids1.isdisjoint(ids2)

    @pytest.mark.asyncio
    async def test_no_results(self, client):
        resp = await client.get(
            "/api/catalog-search", params={"q": "xyznonexistent"}
        )
        data = resp.json()
        assert data["total"] == 0
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_theme_parsed(self, client):
        resp = await client.get("/api/catalog-search", params={"q": "climate"})
        data = resp.json()
        ds1 = next(r for r in data["results"] if r["id"] == "ds-1")
        assert "Environment" in ds1["theme"]
        assert "Climate" in ds1["theme"]

    @pytest.mark.asyncio
    async def test_missing_query_returns_422(self, client):
        resp = await client.get("/api/catalog-search")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_empty_query_returns_422(self, client):
        resp = await client.get("/api/catalog-search", params={"q": ""})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_special_chars_in_query(self, client):
        """FTS5 special chars should be sanitized, not cause errors."""
        resp = await client.get(
            "/api/catalog-search", params={"q": 'climate "OR" NOT*'}
        )
        assert resp.status_code == 200


class TestCatalogSearchNoCatalog:
    """Tests when catalog_db is None (unavailable)."""

    @pytest.mark.asyncio
    async def test_returns_503_when_no_catalog(self):
        from fastapi import FastAPI
        from app.routers.catalog_search import router

        test_app = FastAPI()
        test_app.include_router(router, prefix="/api")
        test_app.state.catalog_db = None

        async with AsyncClient(
            transport=ASGITransport(app=test_app),
            base_url="http://test",
        ) as c:
            resp = await c.get("/api/catalog-search", params={"q": "test"})
            assert resp.status_code == 503
            assert "not available" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# GET /api/catalog-count
# ---------------------------------------------------------------------------


class TestCatalogCount:
    @pytest.mark.asyncio
    async def test_total_count(self, client):
        resp = await client.get("/api/catalog-count")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert data["formats"] is None

    @pytest.mark.asyncio
    async def test_count_filtered_by_csv(self, client):
        resp = await client.get("/api/catalog-count", params={"formats": "csv"})
        data = resp.json()
        # ds-1, ds-2, ds-3 have CSV resources with valid URLs
        assert data["total"] == 3
        assert data["formats"] == ["csv"]

    @pytest.mark.asyncio
    async def test_count_filtered_by_parquet(self, client):
        resp = await client.get("/api/catalog-count", params={"formats": "parquet"})
        data = resp.json()
        assert data["total"] == 1  # Only ds-3

    @pytest.mark.asyncio
    async def test_count_filtered_by_multiple(self, client):
        resp = await client.get(
            "/api/catalog-count", params={"formats": "csv,parquet"}
        )
        data = resp.json()
        # ds-1, ds-2, ds-3 have CSV; ds-3 has parquet -> 3 distinct
        assert data["total"] == 3

    @pytest.mark.asyncio
    async def test_count_invalid_format_ignored(self, client):
        resp = await client.get("/api/catalog-count", params={"formats": "pdf"})
        data = resp.json()
        # Invalid format stripped, falls back to total count
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_count_geojson(self, client):
        resp = await client.get("/api/catalog-count", params={"formats": "geojson"})
        data = resp.json()
        assert data["total"] == 1  # Only ds-5

    @pytest.mark.asyncio
    async def test_returns_503_when_no_catalog(self):
        from fastapi import FastAPI
        from app.routers.catalog_search import router

        test_app = FastAPI()
        test_app.include_router(router, prefix="/api")
        test_app.state.catalog_db = None

        async with AsyncClient(
            transport=ASGITransport(app=test_app),
            base_url="http://test",
        ) as c:
            resp = await c.get("/api/catalog-count")
            assert resp.status_code == 503
