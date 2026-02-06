"""Foreign key and cascade tests.

Tests: database/test.md#FK-1 through FK-8, CASCADE-1, CASCADE-2
"""

from __future__ import annotations

import sqlite3

import pytest

from ..factories import (
    make_session,
    make_conversation,
    make_message,
    make_dataset,
    make_token_usage,
)
from .conftest import (
    _insert_session,
    _insert_conversation,
    _insert_message,
    _insert_dataset,
    _insert_token_usage,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _count(db, table: str, where: str = "", params: tuple = ()) -> int:
    sql = f"SELECT COUNT(*) FROM {table}"
    if where:
        sql += f" WHERE {where}"
    cursor = await db.execute(sql, params)
    row = await cursor.fetchone()
    return row[0]


# ---------------------------------------------------------------------------
# FK-1: Foreign key constraint enforced
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_fk_enforced_session_nonexistent_user(fresh_db):
    """FK-1: Inserting a session with a nonexistent user_id raises IntegrityError."""
    session = make_session(user_id="nonexistent-user-id")
    with pytest.raises(sqlite3.IntegrityError):
        await _insert_session(fresh_db, session)
        await fresh_db.commit()


# ---------------------------------------------------------------------------
# FK-2: ON DELETE CASCADE - Sessions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_cascade_delete_user_removes_sessions(populated_db):
    """FK-2: Deleting a user cascades to delete their sessions."""
    db = populated_db
    assert await _count(db, "sessions", "user_id = ?", ("user-a-id",)) == 1

    await db.execute("DELETE FROM users WHERE id = ?", ("user-a-id",))
    await db.commit()

    assert await _count(db, "sessions", "user_id = ?", ("user-a-id",)) == 0


# ---------------------------------------------------------------------------
# FK-3: ON DELETE CASCADE - Conversations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_cascade_delete_user_removes_conversations(populated_db):
    """FK-3: Deleting a user cascades to delete their conversations."""
    db = populated_db
    assert await _count(db, "conversations", "user_id = ?", ("user-a-id",)) == 1

    await db.execute("DELETE FROM users WHERE id = ?", ("user-a-id",))
    await db.commit()

    assert await _count(db, "conversations", "user_id = ?", ("user-a-id",)) == 0


# ---------------------------------------------------------------------------
# FK-4: ON DELETE CASCADE - Messages via Conversation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_cascade_delete_conversation_removes_messages(populated_db):
    """FK-4: Deleting a conversation cascades to delete its messages."""
    db = populated_db
    assert await _count(db, "messages", "conversation_id = ?", ("conv-a-id",)) == 10

    await db.execute("DELETE FROM conversations WHERE id = ?", ("conv-a-id",))
    await db.commit()

    assert await _count(db, "messages", "conversation_id = ?", ("conv-a-id",)) == 0


# ---------------------------------------------------------------------------
# FK-5: ON DELETE CASCADE - Datasets via Conversation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_cascade_delete_conversation_removes_datasets(populated_db):
    """FK-5: Deleting a conversation cascades to delete its datasets."""
    db = populated_db
    assert await _count(db, "datasets", "conversation_id = ?", ("conv-a-id",)) == 3

    await db.execute("DELETE FROM conversations WHERE id = ?", ("conv-a-id",))
    await db.commit()

    assert await _count(db, "datasets", "conversation_id = ?", ("conv-a-id",)) == 0


# ---------------------------------------------------------------------------
# FK-6: ON DELETE CASCADE - Token Usage
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_cascade_delete_user_removes_token_usage(populated_db):
    """FK-6: Deleting a user cascades to delete their token_usage records."""
    db = populated_db
    assert await _count(db, "token_usage", "user_id = ?", ("user-a-id",)) == 1

    await db.execute("DELETE FROM users WHERE id = ?", ("user-a-id",))
    await db.commit()

    assert await _count(db, "token_usage", "user_id = ?", ("user-a-id",)) == 0


# ---------------------------------------------------------------------------
# FK-7: ON DELETE SET NULL - referral_keys.created_by
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_null_on_delete_referral_key_created_by(populated_db):
    """FK-7: Deleting the admin who created referral keys sets created_by to NULL."""
    db = populated_db

    cursor = await db.execute(
        "SELECT created_by FROM referral_keys WHERE key = ?", ("ref-created-by-a",)
    )
    row = await cursor.fetchone()
    assert row[0] == "user-a-id"

    await db.execute("DELETE FROM users WHERE id = ?", ("user-a-id",))
    await db.commit()

    cursor = await db.execute(
        "SELECT created_by FROM referral_keys WHERE key = ?", ("ref-created-by-a",)
    )
    row = await cursor.fetchone()
    assert row is not None, "Referral key should still exist"
    assert row[0] is None, "created_by should be NULL after user deletion"


# ---------------------------------------------------------------------------
# FK-8: ON DELETE SET NULL - referral_keys.used_by
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_null_on_delete_referral_key_used_by(populated_db):
    """FK-8: Deleting the user who redeemed a referral key sets used_by to NULL."""
    db = populated_db

    cursor = await db.execute(
        "SELECT used_by FROM referral_keys WHERE key = ?", ("ref-used-by-b",)
    )
    row = await cursor.fetchone()
    assert row[0] == "user-b-id"

    await db.execute("DELETE FROM users WHERE id = ?", ("user-b-id",))
    await db.commit()

    cursor = await db.execute(
        "SELECT used_by FROM referral_keys WHERE key = ?", ("ref-used-by-b",)
    )
    row = await cursor.fetchone()
    assert row is not None, "Referral key should still exist"
    assert row[0] is None, "used_by should be NULL after user deletion"


# ---------------------------------------------------------------------------
# CASCADE-1: Delete user - full cascade
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_full_cascade_delete_user(populated_db):
    """CASCADE-1: Deleting a user cascades through sessions, conversations,
    messages, datasets, and token_usage. Other users' data is untouched."""
    db = populated_db

    # Pre-conditions: user_a has data
    assert await _count(db, "sessions", "user_id = ?", ("user-a-id",)) == 1
    assert await _count(db, "conversations", "user_id = ?", ("user-a-id",)) == 1
    assert await _count(db, "messages", "conversation_id = ?", ("conv-a-id",)) == 10
    assert await _count(db, "datasets", "conversation_id = ?", ("conv-a-id",)) == 3
    assert await _count(db, "token_usage", "user_id = ?", ("user-a-id",)) == 1

    await db.execute("DELETE FROM users WHERE id = ?", ("user-a-id",))
    await db.commit()

    # Post-conditions: all user_a data gone
    assert await _count(db, "sessions", "user_id = ?", ("user-a-id",)) == 0
    assert await _count(db, "conversations", "user_id = ?", ("user-a-id",)) == 0
    assert await _count(db, "messages", "conversation_id = ?", ("conv-a-id",)) == 0
    assert await _count(db, "datasets", "conversation_id = ?", ("conv-a-id",)) == 0
    assert await _count(db, "token_usage", "user_id = ?", ("user-a-id",)) == 0

    # user_b data is untouched
    assert await _count(db, "users", "id = ?", ("user-b-id",)) == 1
    assert await _count(db, "sessions", "user_id = ?", ("user-b-id",)) == 1
    assert await _count(db, "conversations", "user_id = ?", ("user-b-id",)) == 1
    assert await _count(db, "messages", "conversation_id = ?", ("conv-b-id",)) == 1
    assert await _count(db, "token_usage", "user_id = ?", ("user-b-id",)) == 1


# ---------------------------------------------------------------------------
# CASCADE-2: Delete conversation - cascade to messages and datasets
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_cascade_delete_conversation_full(populated_db):
    """CASCADE-2: Deleting a conversation with 10 messages and 3 datasets
    removes all of them. Other conversations are unaffected."""
    db = populated_db

    assert await _count(db, "messages", "conversation_id = ?", ("conv-a-id",)) == 10
    assert await _count(db, "datasets", "conversation_id = ?", ("conv-a-id",)) == 3

    await db.execute("DELETE FROM conversations WHERE id = ?", ("conv-a-id",))
    await db.commit()

    assert await _count(db, "messages", "conversation_id = ?", ("conv-a-id",)) == 0
    assert await _count(db, "datasets", "conversation_id = ?", ("conv-a-id",)) == 0

    # conv_b data untouched
    assert await _count(db, "messages", "conversation_id = ?", ("conv-b-id",)) == 1
