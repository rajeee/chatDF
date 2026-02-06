"""Index tests: verify all 7 indexes exist and uniqueness constraints work.

Tests: database/test.md#INDEX-1 through INDEX-3
"""

from __future__ import annotations

import pytest
import sqlite3

from ..factories import make_user, make_referral_key
from .conftest import _insert_user, _insert_referral_key


# ---------------------------------------------------------------------------
# INDEX-1: All 7 indexes created
# ---------------------------------------------------------------------------

EXPECTED_INDEXES = {
    "idx_users_google_id",
    "idx_sessions_user_id",
    "idx_referral_keys_used_by",
    "idx_conversations_user_id",
    "idx_messages_conversation_id",
    "idx_datasets_conversation_id",
    "idx_token_usage_user_timestamp",
}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_all_seven_indexes_exist(fresh_db):
    """INDEX-1: All 7 explicitly-created indexes exist."""
    cursor = await fresh_db.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    )
    indexes = {row[0] for row in await cursor.fetchall()}
    assert EXPECTED_INDEXES.issubset(indexes), (
        f"Missing indexes: {EXPECTED_INDEXES - indexes}"
    )


# ---------------------------------------------------------------------------
# INDEX-2: Unique index on users.google_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_unique_google_id(fresh_db):
    """INDEX-2: Inserting two users with the same google_id raises IntegrityError."""
    user1 = make_user(google_id="duplicate_gid")
    user2 = make_user(google_id="duplicate_gid")
    await _insert_user(fresh_db, user1)
    await fresh_db.commit()

    with pytest.raises(sqlite3.IntegrityError):
        await _insert_user(fresh_db, user2)
        await fresh_db.commit()


# ---------------------------------------------------------------------------
# INDEX-3: Unique constraint on referral_keys.key (PK)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_unique_referral_key(fresh_db):
    """INDEX-3: Inserting two referral keys with the same key value raises IntegrityError."""
    rk1 = make_referral_key(key="same-key")
    rk2 = make_referral_key(key="same-key")
    await _insert_referral_key(fresh_db, rk1)
    await fresh_db.commit()

    with pytest.raises(sqlite3.IntegrityError):
        await _insert_referral_key(fresh_db, rk2)
        await fresh_db.commit()
