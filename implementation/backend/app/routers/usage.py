"""Usage router — token usage stats for the current user.

Implements: spec/backend/rest_api/plan.md#routersusagepy
"""

from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_db
from app.models import UsageResponse
from app.services import rate_limit_service

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /usage
# Implements: spec/backend/rest_api/plan.md#routersusagepy
# ---------------------------------------------------------------------------


@router.get("", response_model=UsageResponse)
async def get_usage(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> UsageResponse:
    """Return token usage statistics for the authenticated user."""
    status = await rate_limit_service.check_limit(db, user["id"])

    return UsageResponse(
        tokens_used=status.usage_tokens,
        token_limit=status.limit_tokens,
        remaining=status.remaining_tokens,
        resets_in_seconds=status.resets_in_seconds if status.resets_in_seconds is not None else 0,
        usage_percent=status.usage_percent,
    )
