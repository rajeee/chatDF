"""Search endpoint tests.

Tests for GET /conversations/search?q=<search_term>:
- Search returns matching messages across conversations
- Search returns empty list when no matches
- Search is scoped to current user (user A cannot see user B's messages)
- Search requires authentication (returns 401 without session)
- Search with empty query returns 400
- Search respects the limit parameter
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_message
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


async def insert_message(db, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg["sql_query"],
            msg["token_count"],
            msg["created_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_with_messages(fresh_db, test_user):
    """A conversation owned by test_user with several messages."""
    conv = make_conversation(
        user_id=test_user["id"],
        title="Data Analysis Chat",
    )
    await insert_conversation(fresh_db, conv)

    msg1 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="How do I calculate the average revenue per customer?",
        created_at="2025-01-01T10:00:00",
    )
    msg2 = make_message(
        conversation_id=conv["id"],
        role="assistant",
        content="You can use SELECT AVG(revenue) FROM customers to calculate average revenue.",
        created_at="2025-01-01T10:01:00",
    )
    msg3 = make_message(
        conversation_id=conv["id"],
        role="user",
        content="What about filtering by region?",
        created_at="2025-01-01T10:02:00",
    )

    await insert_message(fresh_db, msg1)
    await insert_message(fresh_db, msg2)
    await insert_message(fresh_db, msg3)

    return {
        "conversation": conv,
        "messages": [msg1, msg2, msg3],
    }


@pytest_asyncio.fixture
async def second_conversation(fresh_db, test_user):
    """A second conversation owned by test_user with different content."""
    conv = make_conversation(
        user_id=test_user["id"],
        title="SQL Help",
    )
    await insert_conversation(fresh_db, conv)

    msg = make_message(
        conversation_id=conv["id"],
        role="user",
        content="How do I join two tables to compute revenue totals?",
        created_at="2025-01-02T10:00:00",
    )
    await insert_message(fresh_db, msg)

    return {
        "conversation": conv,
        "messages": [msg],
    }


@pytest_asyncio.fixture
async def other_user_conversation(fresh_db):
    """A conversation owned by a different user (not test_user)."""
    from tests.rest_api.conftest import insert_user, insert_session
    from tests.factories import make_user, make_session

    other_user = make_user(id="other-user-id", google_id="google_other_search")
    await insert_user(fresh_db, other_user)

    conv = make_conversation(
        user_id=other_user["id"],
        title="Other User Chat",
    )
    await insert_conversation(fresh_db, conv)

    msg = make_message(
        conversation_id=conv["id"],
        role="user",
        content="This message about revenue should be invisible to test_user.",
        created_at="2025-01-01T09:00:00",
    )
    await insert_message(fresh_db, msg)

    return {
        "user": other_user,
        "conversation": conv,
        "messages": [msg],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_returns_matching_messages(
    authed_client, conversation_with_messages
):
    """GET /conversations/search?q=revenue returns messages containing 'revenue'."""
    response = await authed_client.get("/conversations/search", params={"q": "revenue"})

    body = assert_success_response(response, status_code=200)

    assert body["total"] == 2
    assert len(body["results"]) == 2

    # Both matching messages should reference the correct conversation
    conv_id = conversation_with_messages["conversation"]["id"]
    for result in body["results"]:
        assert result["conversation_id"] == conv_id
        assert "revenue" in result["snippet"].lower()
        assert result["conversation_title"] == "Data Analysis Chat"
        assert result["message_role"] in ("user", "assistant")
        assert "message_id" in result
        assert "created_at" in result


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_returns_empty_list_when_no_matches(
    authed_client, conversation_with_messages
):
    """GET /conversations/search?q=nonexistent returns empty results."""
    response = await authed_client.get(
        "/conversations/search", params={"q": "zzz_nonexistent_term_zzz"}
    )

    body = assert_success_response(response, status_code=200)

    assert body["total"] == 0
    assert body["results"] == []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_is_scoped_to_current_user(
    authed_client, conversation_with_messages, other_user_conversation
):
    """Search results only include messages from the authenticated user's conversations.

    Even though other_user has a message containing 'revenue', it should not
    appear in test_user's search results.
    """
    response = await authed_client.get("/conversations/search", params={"q": "revenue"})

    body = assert_success_response(response, status_code=200)

    # Only test_user's messages match -- the other user's message is excluded
    assert body["total"] == 2
    result_conv_ids = {r["conversation_id"] for r in body["results"]}
    assert other_user_conversation["conversation"]["id"] not in result_conv_ids


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_requires_authentication(authed_client, conversation_with_messages):
    """GET /conversations/search without session cookie returns 401."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as unauthed_client:
        response = await unauthed_client.get(
            "/conversations/search", params={"q": "revenue"}
        )

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_across_multiple_conversations(
    authed_client, conversation_with_messages, second_conversation
):
    """Search returns results from multiple conversations belonging to the same user."""
    response = await authed_client.get("/conversations/search", params={"q": "revenue"})

    body = assert_success_response(response, status_code=200)

    # 2 from first conversation + 1 from second conversation
    assert body["total"] == 3
    conv_ids = {r["conversation_id"] for r in body["results"]}
    assert conversation_with_messages["conversation"]["id"] in conv_ids
    assert second_conversation["conversation"]["id"] in conv_ids


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_results_ordered_by_created_at_descending(
    authed_client, conversation_with_messages
):
    """Search results are ordered by message created_at descending (most recent first)."""
    response = await authed_client.get("/conversations/search", params={"q": "revenue"})

    body = assert_success_response(response, status_code=200)

    assert body["total"] >= 2
    # Verify descending order
    dates = [r["created_at"] for r in body["results"]]
    assert dates == sorted(dates, reverse=True)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_empty_query_returns_400(authed_client):
    """GET /conversations/search?q= (empty query) returns 400."""
    response = await authed_client.get("/conversations/search", params={"q": ""})

    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_respects_limit_parameter(
    authed_client, conversation_with_messages, second_conversation
):
    """GET /conversations/search?q=revenue&limit=1 returns at most 1 result."""
    response = await authed_client.get(
        "/conversations/search", params={"q": "revenue", "limit": 1}
    )

    body = assert_success_response(response, status_code=200)

    assert body["total"] == 1
    assert len(body["results"]) == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_snippet_contains_context(
    authed_client, conversation_with_messages
):
    """Search result snippets contain the matched text with surrounding context."""
    response = await authed_client.get("/conversations/search", params={"q": "average"})

    body = assert_success_response(response, status_code=200)

    assert body["total"] >= 1
    # The snippet should contain the search term
    snippet = body["results"][0]["snippet"]
    assert "average" in snippet.lower()
    # The snippet should also contain some surrounding context
    assert len(snippet) > len("average")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_search_is_case_insensitive(
    authed_client, conversation_with_messages
):
    """Search is case-insensitive: searching for 'REVENUE' matches 'revenue'."""
    response = await authed_client.get(
        "/conversations/search", params={"q": "REVENUE"}
    )

    body = assert_success_response(response, status_code=200)

    # LIKE in SQLite is case-insensitive for ASCII by default
    assert body["total"] >= 1
