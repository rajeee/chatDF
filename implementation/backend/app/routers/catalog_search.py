"""Catalog search router -- full-text search over the local data.gov catalog.

Uses FTS5 on the 386K-dataset datagov_catalog.db for instant search results.
Returns datasets with their loadable resources (CSV, JSON, GeoJSON, XLS/XLSX).

Endpoints:
- GET /api/catalog-search?q={query}&limit={limit}&offset={offset}
"""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# Formats that ChatDF can load
LOADABLE_FORMATS = {"csv", "json", "geojson", "xls", "xlsx", "parquet"}


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class CatalogResource(BaseModel):
    url: str
    format: str
    name: str | None = None


class CatalogSearchResult(BaseModel):
    id: str
    title: str
    description: str | None = None
    publisher: str | None = None
    theme: list[str] = []
    landing_page: str | None = None
    modified: str | None = None
    resources: list[CatalogResource] = []


class CatalogSearchResponse(BaseModel):
    results: list[CatalogSearchResult]
    total: int
    query: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize_fts_query(raw: str) -> str:
    """Sanitize user input for FTS5 MATCH.

    Strips FTS5 special characters, splits into tokens, and joins with
    spaces (implicit AND in FTS5).
    """
    # Remove FTS5 operators and special chars
    cleaned = re.sub(r'[^\w\s]', ' ', raw)
    tokens = cleaned.split()
    # Filter out empty and very short tokens
    tokens = [t for t in tokens if len(t) > 1]
    if not tokens:
        return raw.strip()
    return " ".join(tokens)


def _parse_theme(theme_str: str | None) -> list[str]:
    """Parse the theme field, which may be a JSON array string."""
    if not theme_str:
        return []
    try:
        parsed = json.loads(theme_str)
        if isinstance(parsed, list):
            return [str(t) for t in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
    return [theme_str] if theme_str.strip() else []


# ---------------------------------------------------------------------------
# GET /api/catalog-search
# ---------------------------------------------------------------------------


@router.get("/catalog-search", response_model=CatalogSearchResponse)
async def search_catalog(
    request: Request,
    q: str = Query(..., min_length=1, max_length=300, description="Search query"),
    limit: int = Query(default=20, ge=1, le=100, description="Max results"),
    offset: int = Query(default=0, ge=0, description="Result offset for pagination"),
    formats: str | None = Query(
        default=None,
        description="Comma-separated format filter (e.g. 'csv,json'). "
        "Only return datasets with at least one resource in these formats.",
    ),
) -> CatalogSearchResponse:
    """Full-text search over the data.gov catalog.

    Searches the FTS5 index on datasets(title, notes, publisher_extra, theme)
    and returns ranked results with loadable resources.

    When ``formats`` is provided, only datasets that have at least one
    resource matching the requested formats are returned.  The total count
    also reflects this filter.
    """
    catalog_db = getattr(request.app.state, "catalog_db", None)
    if catalog_db is None:
        raise HTTPException(status_code=503, detail="Catalog database not available")

    fts_query = _sanitize_fts_query(q)
    if not fts_query:
        return CatalogSearchResponse(results=[], total=0, query=q)

    # Parse format filter
    format_filter: list[str] | None = None
    if formats:
        format_filter = [
            f.strip().lower()
            for f in formats.split(",")
            if f.strip() and f.strip().lower() in LOADABLE_FORMATS
        ]
        if not format_filter:
            format_filter = None

    try:
        if format_filter:
            # Join with resources table to filter by format
            fmt_placeholders = ",".join("?" * len(format_filter))

            count_row = await catalog_db.execute_fetchall(
                f"""
                SELECT COUNT(DISTINCT d.id)
                FROM datasets d
                JOIN datasets_fts fts ON d.rowid = fts.rowid
                JOIN resources r ON r.dataset_id = d.id
                WHERE datasets_fts MATCH ?
                  AND LOWER(r.format) IN ({fmt_placeholders})
                  AND r.url IS NOT NULL AND r.url != ''
                """,
                (fts_query, *format_filter),
            )
            total = count_row[0][0] if count_row else 0

            rows = await catalog_db.execute_fetchall(
                f"""
                SELECT DISTINCT d.id, d.title, d.notes, d.publisher_extra, d.theme,
                       d.landing_page, d.metadata_modified, fts.rank
                FROM datasets d
                JOIN datasets_fts fts ON d.rowid = fts.rowid
                JOIN resources r ON r.dataset_id = d.id
                WHERE datasets_fts MATCH ?
                  AND LOWER(r.format) IN ({fmt_placeholders})
                  AND r.url IS NOT NULL AND r.url != ''
                ORDER BY fts.rank
                LIMIT ? OFFSET ?
                """,
                (fts_query, *format_filter, limit, offset),
            )
        else:
            # No format filter — return all FTS matches
            count_row = await catalog_db.execute_fetchall(
                "SELECT COUNT(*) FROM datasets_fts WHERE datasets_fts MATCH ?",
                (fts_query,),
            )
            total = count_row[0][0] if count_row else 0

            rows = await catalog_db.execute_fetchall(
                """
                SELECT d.id, d.title, d.notes, d.publisher_extra, d.theme,
                       d.landing_page, d.metadata_modified
                FROM datasets d
                JOIN datasets_fts fts ON d.rowid = fts.rowid
                WHERE datasets_fts MATCH ?
                ORDER BY fts.rank
                LIMIT ? OFFSET ?
                """,
                (fts_query, limit, offset),
            )

        if not rows:
            return CatalogSearchResponse(results=[], total=total, query=q)

        # Collect dataset IDs for batch resource fetch
        dataset_ids = [row[0] for row in rows]
        placeholders = ",".join("?" * len(dataset_ids))

        resource_rows = await catalog_db.execute_fetchall(
            f"""
            SELECT dataset_id, url, format, name
            FROM resources
            WHERE dataset_id IN ({placeholders})
              AND LOWER(format) IN ('csv', 'json', 'geojson', 'xls', 'xlsx', 'parquet')
              AND url IS NOT NULL AND url != ''
            ORDER BY dataset_id,
                CASE LOWER(format)
                    WHEN 'csv' THEN 1
                    WHEN 'parquet' THEN 2
                    WHEN 'json' THEN 3
                    WHEN 'geojson' THEN 4
                    WHEN 'xls' THEN 5
                    WHEN 'xlsx' THEN 6
                    ELSE 7
                END,
                position
            """,
            dataset_ids,
        )

        # Group resources by dataset_id
        resources_by_dataset: dict[str, list[CatalogResource]] = {}
        for r_row in resource_rows:
            did = r_row[0]
            if did not in resources_by_dataset:
                resources_by_dataset[did] = []
            resources_by_dataset[did].append(
                CatalogResource(url=r_row[1], format=r_row[2], name=r_row[3])
            )

        results = []
        for row in rows:
            results.append(
                CatalogSearchResult(
                    id=row[0],
                    title=row[1],
                    description=row[2],
                    publisher=row[3],
                    theme=_parse_theme(row[4]),
                    landing_page=row[5],
                    modified=row[6],
                    resources=resources_by_dataset.get(row[0], []),
                )
            )

        return CatalogSearchResponse(results=results, total=total, query=q)

    except Exception as exc:
        logger.exception("Catalog search failed for query %r", q)
        raise HTTPException(status_code=500, detail=f"Catalog search error: {exc}")


# ---------------------------------------------------------------------------
# GET /api/catalog-count
# ---------------------------------------------------------------------------


class CatalogCountResponse(BaseModel):
    total: int
    formats: list[str] | None = None


@router.get("/catalog-count", response_model=CatalogCountResponse)
async def catalog_count(
    request: Request,
    formats: str | None = Query(
        default=None,
        description="Comma-separated format filter. Returns count of datasets "
        "with at least one resource in these formats.",
    ),
) -> CatalogCountResponse:
    """Return the total number of datasets, optionally filtered by format."""
    catalog_db = getattr(request.app.state, "catalog_db", None)
    if catalog_db is None:
        raise HTTPException(status_code=503, detail="Catalog database not available")

    format_filter: list[str] | None = None
    if formats:
        format_filter = [
            f.strip().lower()
            for f in formats.split(",")
            if f.strip() and f.strip().lower() in LOADABLE_FORMATS
        ]
        if not format_filter:
            format_filter = None

    try:
        if format_filter:
            fmt_placeholders = ",".join("?" * len(format_filter))
            row = await catalog_db.execute_fetchall(
                f"""
                SELECT COUNT(DISTINCT d.id)
                FROM datasets d
                JOIN resources r ON r.dataset_id = d.id
                WHERE LOWER(r.format) IN ({fmt_placeholders})
                  AND r.url IS NOT NULL AND r.url != ''
                """,
                format_filter,
            )
        else:
            row = await catalog_db.execute_fetchall(
                "SELECT COUNT(*) FROM datasets"
            )

        total = row[0][0] if row else 0
        return CatalogCountResponse(total=total, formats=format_filter)

    except Exception as exc:
        logger.exception("Catalog count failed")
        raise HTTPException(status_code=500, detail=f"Catalog count error: {exc}")
