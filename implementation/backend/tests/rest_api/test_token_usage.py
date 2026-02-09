"""Token usage endpoint tests.

Tests for GET /conversations/{conversation_id}/token-usage:
- Returns correct aggregated token usage data
- Returns zeros when no token usage exists
- Requires authentication (401)
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_token_usage
from tests.rest_api.conftest import assert_success_response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv["created_at"],
            conv["updated_at"],
        ),
    )
    await db.commit()


async def insert_token_usage(db, usage: dict) -> None:
    await db.execute(
        "INSERT INTO token_usage (id, user_id, conversation_id, model_name, "
        "input_tokens, output_tokens, cost, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            usage["id"],
            usage["user_id"],
            usage["conversation_id"],
            usage["model_name"],
            usage["input_tokens"],
            usage["output_tokens"],
            usage["cost"],
            usage["timestamp"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation(fresh_db, test_user):
    """A conversation owned by test_user."""
    conv = make_conversation(user_id=test_user["id"], title="Token Test Chat")
    await insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def conversation_with_usage(fresh_db, test_user, conversation):
    """A conversation with multiple token usage records."""
    usage1 = make_token_usage(
        user_id=test_user["id"],
        conversation_id=conversation["id"],
        input_tokens=1000,
        output_tokens=500,
        cost=0.001,
    )
    usage2 = make_token_usage(
        user_id=test_user["id"],
        conversation_id=conversation["id"],
        input_tokens=2000,
        output_tokens=800,
        cost=0.002,
    )
    usage3 = make_token_usage(
        user_id=test_user["id"],
        conversation_id=conversation["id"],
        input_tokens=500,
        output_tokens=200,
        cost=0.0005,
    )

    await insert_token_usage(fresh_db, usage1)
    await insert_token_usage(fresh_db, usage2)
    await insert_token_usage(fresh_db, usage3)

    return {
        "conversation": conversation,
        "usages": [usage1, usage2, usage3],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_usage_returns_correct_aggregated_data(
    authed_client, conversation_with_usage
):
    """GET /conversations/{id}/token-usage returns correct aggregated totals."""
    conv_id = conversation_with_usage["conversation"]["id"]
    response = await authed_client.get(f"/conversations/{conv_id}/token-usage")

    body = assert_success_response(response, status_code=200)

    assert body["total_input_tokens"] == 3500  # 1000 + 2000 + 500
    assert body["total_output_tokens"] == 1500  # 500 + 800 + 200
    assert body["total_tokens"] == 5000  # 3500 + 1500
    assert body["total_cost"] == pytest.approx(0.0035)  # 0.001 + 0.002 + 0.0005
    assert body["request_count"] == 3


@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_usage_returns_zeros_when_no_usage(authed_client, conversation):
    """GET /conversations/{id}/token-usage returns zeros when no token usage exists."""
    conv_id = conversation["id"]
    response = await authed_client.get(f"/conversations/{conv_id}/token-usage")

    body = assert_success_response(response, status_code=200)

    assert body["total_input_tokens"] == 0
    assert body["total_output_tokens"] == 0
    assert body["total_tokens"] == 0
    assert body["total_cost"] == 0.0
    assert body["request_count"] == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_usage_requires_authentication(authed_client, conversation):
    """GET /conversations/{id}/token-usage without session cookie returns 401."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as unauthed_client:
        response = await unauthed_client.get(
            f"/conversations/{conversation['id']}/token-usage"
        )

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_usage_returns_404_for_nonexistent_conversation(authed_client):
    """GET /conversations/{id}/token-usage returns 404 for non-existent conversation."""
    fake_id = str(uuid4())
    response = await authed_client.get(f"/conversations/{fake_id}/token-usage")

    assert response.status_code == 404
