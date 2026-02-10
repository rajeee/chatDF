"""Usage endpoint tests.

Tests: spec/backend/rest_api/test.md#USAGE-EP-1, USAGE-EP-2
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# USAGE-EP-1: Authenticated request returns usage stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_authenticated_request_returns_usage_stats(authed_client, fresh_db, test_user):
    """GET /usage with valid session returns tokens_used, token_limit, remaining,
    resets_in_seconds, and usage_percent."""
    # Seed some token usage for the test user
    from datetime import datetime, timezone
    from uuid import uuid4

    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await fresh_db.execute(
        "INSERT INTO token_usage (id, user_id, conversation_id, model_name, "
        "input_tokens, output_tokens, cost, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid4()), test_user["id"], None, "gemini-2.5-flash", 1000, 500, 0.0, now),
    )
    await fresh_db.commit()

    response = await authed_client.get("/usage")

    assert response.status_code == 200
    body = response.json()
    assert "tokens_used" in body
    assert "token_limit" in body
    assert "remaining" in body
    assert "resets_in_seconds" in body
    assert "usage_percent" in body

    assert body["tokens_used"] == 1500
    assert body["token_limit"] == 5_000_000
    assert body["remaining"] == 5_000_000 - 1500
    assert isinstance(body["resets_in_seconds"], int)
    assert isinstance(body["usage_percent"], float)
    assert body["usage_percent"] == pytest.approx(1500 / 5_000_000 * 100)


# ---------------------------------------------------------------------------
# USAGE-EP-2: Unauthenticated request returns 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unauthenticated_request_returns_401(authed_client):
    """GET /usage without session cookie returns 401."""
    # We need a client without the session cookie.
    # Re-create one without cookies using the same transport.
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001 — accessing internal for test
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as unauthed_client:
        response = await unauthed_client.get("/usage")

    assert response.status_code == 401
