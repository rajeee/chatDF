"""Conversation search endpoint tests.

Tests the GET /conversations/search endpoint for global message search.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_message
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
)


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


async def insert_message(db, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, reasoning, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg.get("sql_query"),
            msg.get("reasoning"),
            msg.get("token_count", 0),
            msg["created_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_with_messages(fresh_db, test_user):
    """A conversation owned by test_user with multiple messages."""
    conv = make_conversation(user_id=test_user["id"], title="Test Chat")
    await insert_conversation(fresh_db, conv)

    msg1 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="What is the average salary?",
        created_at=datetime(2026, 1, 1, 10, 0, 0).isoformat(),
    )
    msg2 = make_message(
        conversation_id=conv["id"],
        role="assistant",
        content="The average salary is $75,000.",
        created_at=datetime(2026, 1, 1, 10, 1, 0).isoformat(),
    )
    msg3 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="Show me the top 10 employees by salary.",
        created_at=datetime(2026, 1, 1, 10, 2, 0).isoformat(),
    )

    await insert_message(fresh_db, msg1)
    await insert_message(fresh_db, msg2)
    await insert_message(fresh_db, msg3)

    return {"conversation": conv, "messages": [msg1, msg2, msg3]}


@pytest_asyncio.fixture
async def multiple_conversations(fresh_db, test_user):
    """Multiple conversations with different messages."""
    conv1 = make_conversation(user_id=test_user["id"], title="First Chat")
    conv2 = make_conversation(user_id=test_user["id"], title="Second Chat")
    await insert_conversation(fresh_db, conv1)
    await insert_conversation(fresh_db, conv2)

    msg1 = make_message(
        conversation_id=conv1["id"],
        role="user",
        content="Find all customers from New York",
    )
    msg2 = make_message(
        conversation_id=conv2["id"],
        role="user",
        content="Show revenue by quarter",
    )
    msg3 = make_message(
        conversation_id=conv2["id"],
        role="assistant",
        content="Here are the customers from New York: ...",
    )

    await insert_message(fresh_db, msg1)
    await insert_message(fresh_db, msg2)
    await insert_message(fresh_db, msg3)

    return {
        "conv1": conv1,
        "conv2": conv2,
        "messages": [msg1, msg2, msg3],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_finds_matching_messages(authed_client, conversation_with_messages):
    """Search returns messages matching the query string."""
    response = await authed_client.get("/conversations/search?q=salary")

    body = assert_success_response(response, status_code=200)
    assert "results" in body
    assert "total" in body
    assert body["total"] == 3  # "average salary", "salary is $75,000", and "employees by salary"

    # Verify results contain the matching messages
    results = body["results"]
    assert len(results) == 3

    # Check that snippets contain the search term
    for result in results:
        assert "salary" in result["snippet"].lower()
        assert result["conversation_id"] == conversation_with_messages["conversation"]["id"]
        assert "message_id" in result
        assert "message_role" in result
        assert "conversation_title" in result
        assert "created_at" in result


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_returns_empty_for_no_match(authed_client, conversation_with_messages):
    """Search returns empty results when no messages match."""
    response = await authed_client.get("/conversations/search?q=nonexistent")

    body = assert_success_response(response, status_code=200)
    assert body["total"] == 0
    assert len(body["results"]) == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_respects_user_isolation(authed_client, other_user_client, fresh_db, test_user):
    """Search only returns results from the current user's conversations."""
    # Create conversation for test_user
    conv1 = make_conversation(user_id=test_user["id"], title="My Chat")
    await insert_conversation(fresh_db, conv1)
    msg1 = make_message(
        conversation_id=conv1["id"],
        content="This is a secret message from user 1",
    )
    await insert_message(fresh_db, msg1)

    # Create conversation for other_user
    conv2 = make_conversation(user_id="other-user", title="Other Chat")
    await insert_conversation(fresh_db, conv2)
    msg2 = make_message(
        conversation_id=conv2["id"],
        content="This is a secret message from user 2",
    )
    await insert_message(fresh_db, msg2)

    # Test user searches for "secret"
    response = await authed_client.get("/conversations/search?q=secret")
    body = assert_success_response(response, status_code=200)

    # Should only find their own message
    assert body["total"] == 1
    assert body["results"][0]["conversation_id"] == conv1["id"]
    assert "user 1" in body["results"][0]["snippet"]

    # Other user searches for "secret"
    response = await other_user_client.get("/conversations/search?q=secret")
    body = assert_success_response(response, status_code=200)

    # Should only find their own message
    assert body["total"] == 1
    assert body["results"][0]["conversation_id"] == conv2["id"]
    assert "user 2" in body["results"][0]["snippet"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_limit_parameter(authed_client, fresh_db, test_user):
    """Search respects the limit parameter and caps at 50."""
    # Create a conversation with many messages containing the same word
    conv = make_conversation(user_id=test_user["id"], title="Many Messages")
    await insert_conversation(fresh_db, conv)

    for i in range(60):
        msg = make_message(
            conversation_id=conv["id"],
            content=f"Message number {i} containing keyword",
        )
        await insert_message(fresh_db, msg)

    # Test default limit (20)
    response = await authed_client.get("/conversations/search?q=keyword")
    body = assert_success_response(response, status_code=200)
    assert body["total"] <= 20

    # Test custom limit
    response = await authed_client.get("/conversations/search?q=keyword&limit=10")
    body = assert_success_response(response, status_code=200)
    assert body["total"] <= 10

    # Test that limit is capped at 50
    response = await authed_client.get("/conversations/search?q=keyword&limit=100")
    body = assert_success_response(response, status_code=200)
    assert body["total"] <= 50


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_requires_query_parameter(authed_client):
    """Search returns 400 when query parameter is missing or empty."""
    # Missing query parameter
    response = await authed_client.get("/conversations/search")
    assert response.status_code == 422  # FastAPI validation error

    # Empty query parameter
    response = await authed_client.get("/conversations/search?q=")
    assert_error_response(response, 400, "required")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_case_insensitive(authed_client, conversation_with_messages):
    """Search is case-insensitive."""
    # Search with uppercase
    response = await authed_client.get("/conversations/search?q=SALARY")
    body = assert_success_response(response, status_code=200)
    assert body["total"] == 3

    # Search with mixed case
    response = await authed_client.get("/conversations/search?q=SaLaRy")
    body = assert_success_response(response, status_code=200)
    assert body["total"] == 3


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_snippet_includes_context(authed_client, conversation_with_messages):
    """Search snippet includes context around the match."""
    response = await authed_client.get("/conversations/search?q=average")
    body = assert_success_response(response, status_code=200)

    assert body["total"] >= 1
    result = body["results"][0]

    # Snippet should include the match and surrounding context
    snippet = result["snippet"]
    assert "average" in snippet.lower()
    # The full sentence should be in the snippet
    assert "salary" in snippet.lower()
