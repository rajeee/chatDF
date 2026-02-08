"""Rate limit service for ChatDF.

Implements: spec/backend/rate_limiting/plan.md

Provides:
- ``check_limit``: Query token usage in the rolling 24h window.
- ``record_usage``: Insert a new token_usage row.
- ``RateLimitStatus``: Pydantic model returned by ``check_limit``.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from uuid import uuid4

import aiosqlite
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOKEN_LIMIT = 5_000_000
WARNING_THRESHOLD_PERCENT = 80
_CACHE_TTL_SECONDS = 60

# ---------------------------------------------------------------------------
# In-memory TTL cache for check_limit results
# Maps user_id -> (RateLimitStatus, expiry_timestamp)
# ---------------------------------------------------------------------------

_cache: dict[str, tuple[RateLimitStatus, float]] = {}

# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------


class RateLimitStatus(BaseModel):
    """Current rate-limit status for a user."""

    allowed: bool
    usage_tokens: int
    limit_tokens: int
    usage_percent: float
    remaining_tokens: int
    resets_in_seconds: int | None
    warning: bool


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def check_limit(db: aiosqlite.Connection, user_id: str) -> RateLimitStatus:
    """Check the current token usage for *user_id* in the rolling 24h window.

    Implements: spec/backend/rate_limiting/plan.md#rolling-24h-window-query

    Results are cached in-memory for up to ``_CACHE_TTL_SECONDS`` (60 s) to
    avoid redundant SQLite queries when the same user triggers multiple
    rate-limit checks within a short window (e.g. pre-check + post-check).
    """
    # Fast path: return cached result if still valid
    cached = _cache.get(user_id)
    if cached is not None:
        result, expiry = cached
        if time.time() < expiry:
            return result

    now = datetime.utcnow()
    window_start = (now - timedelta(hours=24)).isoformat()

    cursor = await db.execute(
        "SELECT "
        "  COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens, "
        "  MIN(timestamp) AS oldest_timestamp "
        "FROM token_usage "
        "WHERE user_id = ? AND timestamp > ?",
        (user_id, window_start),
    )
    row = await cursor.fetchone()

    total_tokens: int = row["total_tokens"]
    oldest_timestamp: str | None = row["oldest_timestamp"]

    usage_percent = total_tokens / TOKEN_LIMIT * 100
    allowed = total_tokens < TOKEN_LIMIT
    warning = usage_percent >= WARNING_THRESHOLD_PERCENT
    remaining_tokens = max(0, TOKEN_LIMIT - total_tokens)

    # Calculate resets_in_seconds only when over limit
    resets_in_seconds: int | None = None
    if not allowed and oldest_timestamp is not None:
        oldest_dt = datetime.fromisoformat(oldest_timestamp)
        expires_at = oldest_dt + timedelta(hours=24)
        resets_in_seconds = max(0, int((expires_at - now).total_seconds()))

    status = RateLimitStatus(
        allowed=allowed,
        usage_tokens=total_tokens,
        limit_tokens=TOKEN_LIMIT,
        usage_percent=usage_percent,
        remaining_tokens=remaining_tokens,
        resets_in_seconds=resets_in_seconds,
        warning=warning,
    )

    # Store in cache with TTL
    _cache[user_id] = (status, time.time() + _CACHE_TTL_SECONDS)

    return status


async def record_usage(
    db: aiosqlite.Connection,
    user_id: str,
    conversation_id: str | None,
    input_tokens: int,
    output_tokens: int,
    model_name: str = "gemini-2.5-flash",
) -> None:
    """Record token usage for *user_id*.

    Implements: spec/backend/rate_limiting/plan.md#recording-usage
    """
    now = datetime.utcnow().isoformat()
    usage_id = str(uuid4())

    await db.execute(
        "INSERT INTO token_usage (id, user_id, conversation_id, model_name, "
        "input_tokens, output_tokens, cost, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (usage_id, user_id, conversation_id, model_name, input_tokens, output_tokens, 0.0, now),
    )
    await db.commit()

    # Invalidate cached check_limit result so next call sees fresh data
    _cache.pop(user_id, None)


def clear_cache() -> None:
    """Clear the entire rate-limit cache.  Intended for testing."""
    _cache.clear()
