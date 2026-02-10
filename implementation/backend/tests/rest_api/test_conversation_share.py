"""Tests for conversation share/unshare endpoints.

Covers:
- POST /conversations/{id}/share -> creates share token
- POST /conversations/{id}/share -> returns existing token if already shared
- DELETE /conversations/{id}/share -> removes share token
- Both endpoints require authentication
- Both endpoints verify conversation ownership
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation
from tests.rest_api.conftest import (
    assert_success_response,
    insert_session,
    insert_user,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, is_pinned, share_token, shared_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv.get("is_pinned", 0),
            conv.get("share_token"),
            conv.get("shared_at"),
            conv["created_at"],
            conv["updated_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    """A conversation owned by the default test_user."""
    conv = make_conversation(user_id=test_user["id"], title="Shareable Conv")
    await insert_conversation(fresh_db, conv)
    return conv


# ---------------------------------------------------------------------------
# SHARE-1: POST /conversations/{id}/share - Creates a share token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_conversation_creates_token(authed_client, fresh_db, conversation_owned):
    """POST /conversations/{id}/share generates a share_token and share_url."""
    conv_id = conversation_owned["id"]

    response = await authed_client.post(f"/conversations/{conv_id}/share")

    body = assert_success_response(response, status_code=201)
    assert "share_token" in body
    assert "share_url" in body
    assert len(body["share_token"]) > 0
    assert body["share_token"] in body["share_url"]

    # Verify DB was updated
    cursor = await fresh_db.execute(
        "SELECT share_token, shared_at FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["share_token"] == body["share_token"]
    assert row["shared_at"] is not None


# ---------------------------------------------------------------------------
# SHARE-2: POST /conversations/{id}/share - Returns existing token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_conversation_returns_existing(authed_client, fresh_db, test_user):
    """POST /conversations/{id}/share returns the same token if already shared."""
    existing_token = "existing-share-token-abc"
    conv = make_conversation(
        user_id=test_user["id"],
        title="Already Shared",
        share_token=existing_token,
        shared_at="2025-01-01T00:00:00",
    )
    await insert_conversation(fresh_db, conv)

    response = await authed_client.post(f"/conversations/{conv['id']}/share")

    body = assert_success_response(response, status_code=201)
    assert body["share_token"] == existing_token
    assert existing_token in body["share_url"]

    # Verify DB was NOT changed
    cursor = await fresh_db.execute(
        "SELECT share_token, shared_at FROM conversations WHERE id = ?", (conv["id"],)
    )
    row = await cursor.fetchone()
    assert row["share_token"] == existing_token
    assert row["shared_at"] == "2025-01-01T00:00:00"


# ---------------------------------------------------------------------------
# SHARE-3: POST /conversations/{id}/share - Not found
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_conversation_not_found(authed_client):
    """POST /conversations/{id}/share on nonexistent conversation returns 404."""
    fake_id = str(uuid4())
    response = await authed_client.post(f"/conversations/{fake_id}/share")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# SHARE-4: POST /conversations/{id}/share - Requires auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_requires_auth(authed_client, conversation_owned):
    """POST /conversations/{id}/share without session cookie returns 401."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        response = await unauthed.post(
            f"/conversations/{conversation_owned['id']}/share"
        )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# SHARE-5: DELETE /conversations/{id}/share - Removes share token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unshare_conversation(authed_client, fresh_db, test_user):
    """DELETE /conversations/{id}/share sets share_token and shared_at to NULL."""
    conv = make_conversation(
        user_id=test_user["id"],
        title="Shared Conv",
        share_token="token-to-remove",
        shared_at="2025-01-01T00:00:00",
    )
    await insert_conversation(fresh_db, conv)

    response = await authed_client.delete(f"/conversations/{conv['id']}/share")

    body = assert_success_response(response, status_code=200)
    assert body["success"] is True

    # Verify DB was updated - share_token should be NULL
    cursor = await fresh_db.execute(
        "SELECT share_token, shared_at FROM conversations WHERE id = ?", (conv["id"],)
    )
    row = await cursor.fetchone()
    assert row["share_token"] is None
    assert row["shared_at"] is None


# ---------------------------------------------------------------------------
# SHARE-6: DELETE /conversations/{id}/share - Not found
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unshare_conversation_not_found(authed_client):
    """DELETE /conversations/{id}/share on nonexistent conversation returns 404."""
    fake_id = str(uuid4())
    response = await authed_client.delete(f"/conversations/{fake_id}/share")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# SHARE-7: DELETE /conversations/{id}/share - Requires auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unshare_requires_auth(authed_client, conversation_owned):
    """DELETE /conversations/{id}/share without session cookie returns 401."""
    from httpx import AsyncClient

    transport = authed_client._transport  # noqa: SLF001
    async with AsyncClient(transport=transport, base_url="http://test") as unauthed:
        response = await unauthed.delete(
            f"/conversations/{conversation_owned['id']}/share"
        )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# SHARE-8: Full cycle - share, unshare, reshare gets new token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_then_unshare_then_reshare(authed_client, fresh_db, conversation_owned):
    """Share -> unshare -> reshare produces a new, different token each time."""
    conv_id = conversation_owned["id"]

    # Step 1: Share
    resp1 = await authed_client.post(f"/conversations/{conv_id}/share")
    body1 = assert_success_response(resp1, status_code=201)
    first_token = body1["share_token"]
    assert len(first_token) > 0

    # Step 2: Unshare
    resp2 = await authed_client.delete(f"/conversations/{conv_id}/share")
    body2 = assert_success_response(resp2, status_code=200)
    assert body2["success"] is True

    # Verify token is cleared in DB
    cursor = await fresh_db.execute(
        "SELECT share_token FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["share_token"] is None

    # Step 3: Reshare - should get a new token
    resp3 = await authed_client.post(f"/conversations/{conv_id}/share")
    body3 = assert_success_response(resp3, status_code=201)
    second_token = body3["share_token"]
    assert len(second_token) > 0

    # The new token should differ from the first
    assert second_token != first_token

    # Verify DB reflects the new token
    cursor = await fresh_db.execute(
        "SELECT share_token, shared_at FROM conversations WHERE id = ?", (conv_id,)
    )
    row = await cursor.fetchone()
    assert row["share_token"] == second_token
    assert row["shared_at"] is not None


# ---------------------------------------------------------------------------
# SHARE-9: POST /conversations/{id}/share - Ownership check (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_share_conversation_not_owner_returns_403(
    other_user_client, fresh_db, conversation_owned
):
    """POST /conversations/{id}/share for another user's conversation returns 403."""
    response = await other_user_client.post(
        f"/conversations/{conversation_owned['id']}/share"
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# SHARE-10: DELETE /conversations/{id}/share - Ownership check (403)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_unshare_conversation_not_owner_returns_403(
    other_user_client, fresh_db, test_user
):
    """DELETE /conversations/{id}/share for another user's conversation returns 403."""
    conv = make_conversation(
        user_id=test_user["id"],
        title="Shared Conv",
        share_token="some-token",
        shared_at="2025-01-01T00:00:00",
    )
    await insert_conversation(fresh_db, conv)

    response = await other_user_client.delete(
        f"/conversations/{conv['id']}/share"
    )
    assert response.status_code == 403
