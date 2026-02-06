"""Constraint tests: WAL mode, UUID format, ISO timestamps, CHECK constraints.

Tests: database/test.md#WAL-1, UUID-1, TS-1, CHECK-1, CHECK-2
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime

import aiosqlite
import pytest

from ..factories import (
    make_user,
    make_session,
    make_conversation,
    make_message,
    make_dataset,
    make_token_usage,
)
from .conftest import (
    _insert_user,
    _insert_session,
    _insert_conversation,
    _insert_message,
    _insert_dataset,
    _insert_token_usage,
)


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


# ---------------------------------------------------------------------------
# WAL-1: WAL mode enabled
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_wal_mode_enabled(tmp_path):
    """WAL-1: After init_db on a file-based database, journal_mode is WAL.

    Note: in-memory databases do not support WAL mode, so this test uses a
    temporary file to verify the PRAGMA is actually applied.
    """
    from app.database import init_db

    db_path = str(tmp_path / "test.db")
    conn = await aiosqlite.connect(db_path)
    try:
        conn.row_factory = aiosqlite.Row
        await init_db(conn)
        cursor = await conn.execute("PRAGMA journal_mode")
        row = await cursor.fetchone()
        assert row[0] == "wal"
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# UUID-1: UUID generation for all IDs
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_uuid_format_all_tables(fresh_db):
    """UUID-1: IDs inserted via factories are valid UUIDs (8-4-4-4-12 hex)."""
    db = fresh_db

    user = make_user()
    await _insert_user(db, user)
    assert UUID_RE.match(user["id"]), f"User id not UUID: {user['id']}"

    session = make_session(user_id=user["id"])
    await _insert_session(db, session)
    assert UUID_RE.match(session["id"]), f"Session id not UUID: {session['id']}"

    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)
    assert UUID_RE.match(conv["id"]), f"Conversation id not UUID: {conv['id']}"

    msg = make_message(conversation_id=conv["id"])
    await _insert_message(db, msg)
    assert UUID_RE.match(msg["id"]), f"Message id not UUID: {msg['id']}"

    ds = make_dataset(conversation_id=conv["id"])
    await _insert_dataset(db, ds)
    assert UUID_RE.match(ds["id"]), f"Dataset id not UUID: {ds['id']}"

    tu = make_token_usage(user_id=user["id"], conversation_id=conv["id"])
    await _insert_token_usage(db, tu)
    assert UUID_RE.match(tu["id"]), f"Token usage id not UUID: {tu['id']}"

    await db.commit()

    # Verify from the database itself
    for table, col in [
        ("users", "id"),
        ("sessions", "id"),
        ("conversations", "id"),
        ("messages", "id"),
        ("datasets", "id"),
        ("token_usage", "id"),
    ]:
        cursor = await db.execute(f"SELECT {col} FROM {table}")
        rows = await cursor.fetchall()
        for row in rows:
            assert UUID_RE.match(row[0]), f"{table}.{col} not UUID: {row[0]}"


# ---------------------------------------------------------------------------
# TS-1: Timestamp format ISO 8601
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_timestamps_iso8601(fresh_db):
    """TS-1: All timestamp columns store valid ISO 8601 strings."""
    db = fresh_db

    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)
    msg = make_message(conversation_id=conv["id"])
    await _insert_message(db, msg)
    ds = make_dataset(conversation_id=conv["id"])
    await _insert_dataset(db, ds)
    tu = make_token_usage(user_id=user["id"])
    await _insert_token_usage(db, tu)
    session = make_session(user_id=user["id"])
    await _insert_session(db, session)
    await db.commit()

    # Check each timestamp column parses as ISO 8601
    timestamp_queries = [
        ("users", ["created_at", "last_login_at"]),
        ("sessions", ["created_at", "expires_at"]),
        ("conversations", ["created_at", "updated_at"]),
        ("messages", ["created_at"]),
        ("datasets", ["loaded_at"]),
        ("token_usage", ["timestamp"]),
    ]
    for table, columns in timestamp_queries:
        cols_str = ", ".join(columns)
        cursor = await db.execute(f"SELECT {cols_str} FROM {table}")
        rows = await cursor.fetchall()
        for row in rows:
            for i, col_name in enumerate(columns):
                value = row[i]
                assert value is not None, f"{table}.{col_name} is NULL"
                try:
                    datetime.fromisoformat(value)
                except ValueError:
                    pytest.fail(f"{table}.{col_name} is not ISO 8601: {value!r}")


# ---------------------------------------------------------------------------
# CHECK-1: Role CHECK constraint on messages
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_message_role_user_accepted(fresh_db):
    """CHECK-1: role='user' is accepted."""
    db = fresh_db
    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)

    msg = make_message(conversation_id=conv["id"], role="user")
    await _insert_message(db, msg)
    await db.commit()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_message_role_assistant_accepted(fresh_db):
    """CHECK-1: role='assistant' is accepted."""
    db = fresh_db
    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)

    msg = make_message(conversation_id=conv["id"], role="assistant")
    await _insert_message(db, msg)
    await db.commit()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_message_role_system_rejected(fresh_db):
    """CHECK-1: role='system' is rejected by CHECK constraint."""
    db = fresh_db
    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)

    msg = make_message(conversation_id=conv["id"], role="system")
    with pytest.raises(sqlite3.IntegrityError):
        await _insert_message(db, msg)
        await db.commit()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_message_role_empty_rejected(fresh_db):
    """CHECK-1: role='' is rejected by CHECK constraint."""
    db = fresh_db
    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)

    msg = make_message(conversation_id=conv["id"], role="")
    with pytest.raises(sqlite3.IntegrityError):
        await _insert_message(db, msg)
        await db.commit()


# ---------------------------------------------------------------------------
# CHECK-2: Dataset status CHECK constraint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize("status", ["loading", "ready", "error"])
async def test_dataset_status_valid_accepted(fresh_db, status):
    """CHECK-2: Valid status values are accepted."""
    db = fresh_db
    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)

    ds = make_dataset(conversation_id=conv["id"], status=status)
    await _insert_dataset(db, ds)
    await db.commit()


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize("status", ["pending", "complete", "failed", ""])
async def test_dataset_status_invalid_rejected(fresh_db, status):
    """CHECK-2: Invalid status values are rejected by CHECK constraint."""
    db = fresh_db
    user = make_user()
    await _insert_user(db, user)
    conv = make_conversation(user_id=user["id"])
    await _insert_conversation(db, conv)

    ds = make_dataset(conversation_id=conv["id"], status=status)
    with pytest.raises(sqlite3.IntegrityError):
        await _insert_dataset(db, ds)
        await db.commit()
