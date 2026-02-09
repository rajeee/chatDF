"""Dataset search router -- search public Hugging Face datasets.

Provides a lightweight search endpoint that queries the Hugging Face Hub API
for public Parquet datasets, returning simplified metadata suitable for
browsing and loading into a conversation.

Endpoints:
- GET /api/dataset-search?q={query}&limit={limit}  -> search_datasets
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

HUGGINGFACE_API_URL = "https://huggingface.co/api/datasets"

# Common Parquet file URL patterns on the Hugging Face Hub
PARQUET_URL_PATTERNS = [
    "https://huggingface.co/datasets/{id}/resolve/main/data/train-00000-of-00001.parquet",
    "https://huggingface.co/datasets/{id}/resolve/main/train.parquet",
    "https://huggingface.co/datasets/{id}/resolve/main/data/train.parquet",
]


class DatasetSearchResult(BaseModel):
    """A single result from a Hugging Face dataset search."""

    id: str
    description: str | None = None
    downloads: int = 0
    likes: int = 0
    tags: list[str] = []
    last_modified: str | None = None
    parquet_url: str


class DatasetSearchResponse(BaseModel):
    """Response for GET /api/dataset-search."""

    results: list[DatasetSearchResult]
    total: int


# ---------------------------------------------------------------------------
# GET /api/dataset-search
# ---------------------------------------------------------------------------


@router.get("/dataset-search", response_model=DatasetSearchResponse)
async def search_datasets(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    limit: int = Query(default=10, ge=1, le=50, description="Max results to return"),
) -> DatasetSearchResponse:
    """Search public Hugging Face datasets.

    Calls the Hugging Face Hub REST API and returns a simplified list of
    dataset metadata with constructed Parquet file URLs.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                HUGGINGFACE_API_URL,
                params={
                    "search": q,
                    "limit": limit,
                    "sort": "downloads",
                },
            )
            response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Hugging Face API request timed out",
        )
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Hugging Face API returned %d: %s",
            exc.response.status_code,
            exc.response.text[:200],
        )
        raise HTTPException(
            status_code=502,
            detail=f"Hugging Face API error: {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        logger.warning("Hugging Face API request failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to connect to Hugging Face API",
        )

    raw_results: list[dict[str, Any]] = response.json()

    results: list[DatasetSearchResult] = []
    for item in raw_results:
        dataset_id = item.get("id", "")
        if not dataset_id:
            continue

        # Construct the most common Parquet URL pattern
        parquet_url = PARQUET_URL_PATTERNS[0].format(id=dataset_id)

        results.append(
            DatasetSearchResult(
                id=dataset_id,
                description=item.get("description") or item.get("cardData", {}).get("description"),
                downloads=item.get("downloads", 0),
                likes=item.get("likes", 0),
                tags=item.get("tags", []),
                last_modified=item.get("lastModified"),
                parquet_url=parquet_url,
            )
        )

    return DatasetSearchResponse(results=results, total=len(results))
