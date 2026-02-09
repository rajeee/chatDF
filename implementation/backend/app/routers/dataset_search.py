"""Dataset search router -- search public Hugging Face datasets.

Provides a lightweight search endpoint that queries the Hugging Face Hub API
for public Parquet datasets, returning simplified metadata suitable for
browsing and loading into a conversation.

Endpoints:
- GET /api/dataset-search?q={query}&limit={limit}  -> search_datasets
- GET /api/dataset-discover?q={query}&limit={limit} -> discover_datasets (NL search)
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
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


# ---------------------------------------------------------------------------
# Natural Language Dataset Discovery
# ---------------------------------------------------------------------------

# Common English stop words to strip from natural-language queries
STOP_WORDS: set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "can", "could", "must", "about", "above",
    "after", "again", "against", "all", "am", "and", "any", "at", "because",
    "before", "below", "between", "both", "but", "by", "down", "during",
    "each", "few", "for", "from", "further", "get", "got", "he", "her",
    "here", "hers", "herself", "him", "himself", "his", "how", "i", "if",
    "in", "into", "it", "its", "itself", "just", "me", "more", "most", "my",
    "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
    "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same",
    "she", "so", "some", "such", "than", "that", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "under", "until", "up", "very", "we", "what", "when",
    "where", "which", "while", "who", "whom", "why", "with", "you", "your",
    "yours", "yourself", "yourselves",
    # Task-specific stop words
    "find", "show", "give", "want", "need", "looking", "search", "dataset",
    "datasets", "data", "me", "like", "please", "some", "related",
}

# Map of natural language categories to HF search tags/keywords
CATEGORY_TAGS: dict[str, list[str]] = {
    "climate": ["climate", "weather", "temperature", "environment"],
    "finance": ["finance", "stock", "economics", "financial"],
    "health": ["health", "medical", "healthcare", "disease"],
    "census": ["census", "population", "demographics"],
    "education": ["education", "school", "university"],
    "transportation": ["transport", "traffic", "flight"],
    "energy": ["energy", "electricity", "solar", "wind"],
    "agriculture": ["agriculture", "farming", "crop"],
}


def extract_keywords(query: str) -> list[str]:
    """Extract meaningful keywords from a natural language query.

    Removes stop words, punctuation, and returns unique lowercased tokens
    in the order they first appear.
    """
    # Remove punctuation and normalise whitespace
    cleaned = re.sub(r"[^\w\s]", " ", query.lower())
    tokens = cleaned.split()

    seen: set[str] = set()
    keywords: list[str] = []
    for token in tokens:
        if token not in STOP_WORDS and token not in seen and len(token) > 1:
            seen.add(token)
            keywords.append(token)
    return keywords


def match_categories(query: str) -> list[str]:
    """Return HF-compatible tag keywords when the query matches known categories.

    Checks both category names and their associated keywords against the query.
    """
    query_lower = query.lower()
    matched_tags: list[str] = []
    for category, tags in CATEGORY_TAGS.items():
        if category in query_lower or any(tag in query_lower for tag in tags):
            matched_tags.extend(tags)
    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for tag in matched_tags:
        if tag not in seen:
            seen.add(tag)
            unique.append(tag)
    return unique


class DatasetDiscoveryResult(BaseModel):
    """A single result from NL dataset discovery, with relevance score."""

    id: str
    description: str | None = None
    downloads: int = 0
    likes: int = 0
    tags: list[str] = []
    last_modified: str | None = None
    parquet_url: str
    relevance_score: float = 0.0


class DatasetDiscoveryResponse(BaseModel):
    """Response for GET /api/dataset-discover."""

    results: list[DatasetDiscoveryResult]
    total: int
    keywords: list[str]
    matched_categories: list[str]


def _compute_relevance(
    item: dict[str, Any],
    keywords: list[str],
) -> float:
    """Compute a relevance score combining keyword matches and popularity.

    Score = keyword_match_ratio * 50 + log10(downloads + 1) * 5 + log10(likes + 1) * 2
    """
    item_text = " ".join([
        (item.get("id") or ""),
        (item.get("description") or ""),
        " ".join(item.get("tags") or []),
    ]).lower()

    if not keywords:
        keyword_score = 0.0
    else:
        matches = sum(1 for kw in keywords if kw in item_text)
        keyword_score = (matches / len(keywords)) * 50

    downloads = item.get("downloads", 0)
    likes = item.get("likes", 0)
    popularity_score = math.log10(max(downloads, 0) + 1) * 5 + math.log10(max(likes, 0) + 1) * 2

    return round(keyword_score + popularity_score, 2)


async def _search_hf(
    search_term: str,
    limit: int,
) -> list[dict[str, Any]]:
    """Issue a single search request to the Hugging Face Hub API."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                HUGGINGFACE_API_URL,
                params={
                    "search": search_term,
                    "limit": limit,
                    "sort": "downloads",
                },
            )
            response.raise_for_status()
            return response.json()  # type: ignore[no-any-return]
    except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.RequestError) as exc:
        logger.warning("HF search for %r failed: %s", search_term, exc)
        return []


@router.get("/dataset-discover", response_model=DatasetDiscoveryResponse)
async def discover_datasets(
    q: str = Query(..., min_length=1, max_length=500, description="Natural language query"),
    limit: int = Query(default=10, ge=1, le=50, description="Max results to return"),
) -> DatasetDiscoveryResponse:
    """Discover datasets using a natural language description.

    Extracts keywords from the query, checks for category matches, searches
    the Hugging Face Hub with multiple strategies, then ranks results by
    relevance score (keyword match + popularity).
    """
    keywords = extract_keywords(q)
    matched_cats = match_categories(q)

    # Build search tasks: keyword search + optional category tag searches
    search_tasks: list[Any] = []

    # Primary keyword search
    keyword_query = " ".join(keywords) if keywords else q.strip()
    if keyword_query:
        search_tasks.append(_search_hf(keyword_query, limit))

    # Category-based tag searches (first two matched tags to avoid too many requests)
    for tag in matched_cats[:2]:
        search_tasks.append(_search_hf(tag, limit))

    # Execute all searches concurrently
    if not search_tasks:
        return DatasetDiscoveryResponse(
            results=[], total=0, keywords=keywords, matched_categories=matched_cats,
        )

    all_results = await asyncio.gather(*search_tasks)

    # Merge and deduplicate results
    seen_ids: set[str] = set()
    merged: list[dict[str, Any]] = []
    for result_list in all_results:
        for item in result_list:
            dataset_id = item.get("id", "")
            if dataset_id and dataset_id not in seen_ids:
                seen_ids.add(dataset_id)
                merged.append(item)

    # Compute relevance scores and sort
    scored: list[tuple[float, dict[str, Any]]] = []
    for item in merged:
        score = _compute_relevance(item, keywords)
        scored.append((score, item))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Take top `limit` results and build response
    results: list[DatasetDiscoveryResult] = []
    for score, item in scored[:limit]:
        dataset_id = item.get("id", "")
        parquet_url = PARQUET_URL_PATTERNS[0].format(id=dataset_id)
        results.append(
            DatasetDiscoveryResult(
                id=dataset_id,
                description=item.get("description") or item.get("cardData", {}).get("description"),
                downloads=item.get("downloads", 0),
                likes=item.get("likes", 0),
                tags=item.get("tags", []),
                last_modified=item.get("lastModified"),
                parquet_url=parquet_url,
                relevance_score=score,
            )
        )

    return DatasetDiscoveryResponse(
        results=results,
        total=len(results),
        keywords=keywords,
        matched_categories=matched_cats,
    )
