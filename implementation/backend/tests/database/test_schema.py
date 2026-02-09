"""Schema tests: verify all 7 tables exist with correct columns.

Tests: database/test.md#SCHEMA-1 through SCHEMA-8
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# SCHEMA-1: All 7 tables created
# ---------------------------------------------------------------------------

EXPECTED_TABLES = {
    "users",
    "sessions",
    "referral_keys",
    "conversations",
    "messages",
    "datasets",
    "token_usage",
    "saved_queries",
    "query_history",
    "user_settings",
    "query_results_cache",
}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_all_seven_tables_exist(fresh_db):
    """SCHEMA-1: After init_db, all 7 tables exist in sqlite_master."""
    cursor = await fresh_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    tables = {row[0] for row in await cursor.fetchall()}
    assert tables == EXPECTED_TABLES


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_columns(db, table_name: str) -> dict:
    """Return {col_name: {cid, name, type, notnull, dflt_value, pk}} for a table."""
    cursor = await db.execute(f"PRAGMA table_info({table_name})")
    rows = await cursor.fetchall()
    return {row[1]: {"cid": row[0], "name": row[1], "type": row[2], "notnull": row[3], "dflt_value": row[4], "pk": row[5]} for row in rows}


def _assert_column(columns: dict, name: str, col_type: str, *, notnull: int, pk: int = 0):
    """Assert a column exists with the expected type, nullability, and PK flag."""
    assert name in columns, f"Column '{name}' not found. Available: {list(columns.keys())}"
    col = columns[name]
    assert col["type"] == col_type, f"Column '{name}' type: expected {col_type}, got {col['type']}"
    assert col["notnull"] == notnull, f"Column '{name}' notnull: expected {notnull}, got {col['notnull']}"
    assert col["pk"] == pk, f"Column '{name}' pk: expected {pk}, got {col['pk']}"


# ---------------------------------------------------------------------------
# SCHEMA-2: Users table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_users_table_structure(fresh_db):
    """SCHEMA-2: Users table has correct columns, types, and constraints."""
    cols = await _get_columns(fresh_db, "users")
    assert len(cols) == 7
    _assert_column(cols, "id", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "google_id", "TEXT", notnull=1)
    _assert_column(cols, "email", "TEXT", notnull=1)
    _assert_column(cols, "name", "TEXT", notnull=1)
    _assert_column(cols, "avatar_url", "TEXT", notnull=0)
    _assert_column(cols, "created_at", "TEXT", notnull=1)
    _assert_column(cols, "last_login_at", "TEXT", notnull=1)


# ---------------------------------------------------------------------------
# SCHEMA-3: Sessions table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_sessions_table_structure(fresh_db):
    """SCHEMA-3: Sessions table has correct columns."""
    cols = await _get_columns(fresh_db, "sessions")
    assert len(cols) == 4
    _assert_column(cols, "id", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "user_id", "TEXT", notnull=1)
    _assert_column(cols, "created_at", "TEXT", notnull=1)
    _assert_column(cols, "expires_at", "TEXT", notnull=1)


# ---------------------------------------------------------------------------
# SCHEMA-4: Referral keys table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_referral_keys_table_structure(fresh_db):
    """SCHEMA-4: Referral keys table has correct columns."""
    cols = await _get_columns(fresh_db, "referral_keys")
    assert len(cols) == 5
    _assert_column(cols, "key", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "created_by", "TEXT", notnull=0)
    _assert_column(cols, "used_by", "TEXT", notnull=0)
    _assert_column(cols, "created_at", "TEXT", notnull=1)
    _assert_column(cols, "used_at", "TEXT", notnull=0)


# ---------------------------------------------------------------------------
# SCHEMA-5: Conversations table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_conversations_table_structure(fresh_db):
    """SCHEMA-5: Conversations table has correct columns."""
    cols = await _get_columns(fresh_db, "conversations")
    assert len(cols) == 8
    _assert_column(cols, "id", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "user_id", "TEXT", notnull=1)
    _assert_column(cols, "title", "TEXT", notnull=1)
    _assert_column(cols, "is_pinned", "INTEGER", notnull=1)
    _assert_column(cols, "share_token", "TEXT", notnull=0)
    _assert_column(cols, "shared_at", "TEXT", notnull=0)
    _assert_column(cols, "created_at", "TEXT", notnull=1)
    _assert_column(cols, "updated_at", "TEXT", notnull=1)


# ---------------------------------------------------------------------------
# SCHEMA-6: Messages table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_messages_table_structure(fresh_db):
    """SCHEMA-6: Messages table has correct columns."""
    cols = await _get_columns(fresh_db, "messages")
    assert len(cols) == 8
    _assert_column(cols, "id", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "conversation_id", "TEXT", notnull=1)
    _assert_column(cols, "role", "TEXT", notnull=1)
    _assert_column(cols, "content", "TEXT", notnull=1)
    _assert_column(cols, "sql_query", "TEXT", notnull=0)
    _assert_column(cols, "reasoning", "TEXT", notnull=0)
    _assert_column(cols, "token_count", "INTEGER", notnull=1)
    _assert_column(cols, "created_at", "TEXT", notnull=1)


# ---------------------------------------------------------------------------
# SCHEMA-7: Datasets table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_datasets_table_structure(fresh_db):
    """SCHEMA-7: Datasets table has correct columns."""
    cols = await _get_columns(fresh_db, "datasets")
    assert len(cols) == 12
    _assert_column(cols, "id", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "conversation_id", "TEXT", notnull=1)
    _assert_column(cols, "url", "TEXT", notnull=1)
    _assert_column(cols, "name", "TEXT", notnull=1)
    _assert_column(cols, "row_count", "INTEGER", notnull=1)
    _assert_column(cols, "column_count", "INTEGER", notnull=1)
    _assert_column(cols, "schema_json", "TEXT", notnull=1)
    _assert_column(cols, "status", "TEXT", notnull=1)
    _assert_column(cols, "error_message", "TEXT", notnull=0)
    _assert_column(cols, "loaded_at", "TEXT", notnull=1)
    _assert_column(cols, "file_size_bytes", "INTEGER", notnull=0)
    _assert_column(cols, "column_descriptions", "TEXT", notnull=1)


# ---------------------------------------------------------------------------
# SCHEMA-8: Token usage table structure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.unit
async def test_token_usage_table_structure(fresh_db):
    """SCHEMA-8: Token usage table has correct columns."""
    cols = await _get_columns(fresh_db, "token_usage")
    assert len(cols) == 8
    _assert_column(cols, "id", "TEXT", notnull=0, pk=1)
    _assert_column(cols, "user_id", "TEXT", notnull=1)
    _assert_column(cols, "conversation_id", "TEXT", notnull=0)
    _assert_column(cols, "model_name", "TEXT", notnull=1)
    _assert_column(cols, "input_tokens", "INTEGER", notnull=1)
    _assert_column(cols, "output_tokens", "INTEGER", notnull=1)
    _assert_column(cols, "cost", "REAL", notnull=1)
    _assert_column(cols, "timestamp", "TEXT", notnull=1)
