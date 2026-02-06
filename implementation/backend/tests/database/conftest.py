"""Fixtures for database-level tests.

Provides:
- ``fresh_db``: in-memory SQLite with schema via ``init_db``
- ``populated_db``: ``fresh_db`` pre-seeded with a full entity graph
"""

from __future__ import annotations

import aiosqlite
import pytest
import pytest_asyncio

from app.database import init_db
from ..factories import (
    make_user,
    make_session,
    make_conversation,
    make_message,
    make_dataset,
    make_token_usage,
    make_referral_key,
)


# ---------------------------------------------------------------------------
# Insert helpers (parameterised SQL)
# ---------------------------------------------------------------------------

async def _insert_user(db: aiosqlite.Connection, u: dict) -> None:
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (u["id"], u["google_id"], u["email"], u["name"], u["avatar_url"], u["created_at"], u["last_login_at"]),
    )


async def _insert_session(db: aiosqlite.Connection, s: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (s["id"], s["user_id"], s["created_at"], s["expires_at"]),
    )


async def _insert_conversation(db: aiosqlite.Connection, c: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (c["id"], c["user_id"], c["title"], c["created_at"], c["updated_at"]),
    )


async def _insert_message(db: aiosqlite.Connection, m: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (m["id"], m["conversation_id"], m["role"], m["content"], m["sql_query"], m["token_count"], m["created_at"]),
    )


async def _insert_dataset(db: aiosqlite.Connection, d: dict) -> None:
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (d["id"], d["conversation_id"], d["url"], d["name"], d["row_count"], d["column_count"],
         d["schema_json"], d["status"], d["error_message"], d["loaded_at"]),
    )


async def _insert_token_usage(db: aiosqlite.Connection, t: dict) -> None:
    await db.execute(
        "INSERT INTO token_usage (id, user_id, conversation_id, model_name, input_tokens, output_tokens, cost, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (t["id"], t["user_id"], t["conversation_id"], t["model_name"], t["input_tokens"],
         t["output_tokens"], t["cost"], t["timestamp"]),
    )


async def _insert_referral_key(db: aiosqlite.Connection, r: dict) -> None:
    await db.execute(
        "INSERT INTO referral_keys (key, created_by, used_by, created_at, used_at) VALUES (?, ?, ?, ?, ?)",
        (r["key"], r["created_by"], r["used_by"], r["created_at"], r["used_at"]),
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database initialised via ``init_db``."""
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await init_db(conn)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def populated_db(fresh_db):
    """``fresh_db`` pre-seeded with two users and a full entity graph.

    Entity graph:
      user_a -> session_a, conv_a (10 messages, 3 datasets), token_usage_a, referral_key (created_by)
      user_b -> session_b, conv_b (1 message), referral_key (used_by)
    """
    db = fresh_db

    # --- Users ---
    user_a = make_user(id="user-a-id", google_id="google_aaa", email="a@test.com", name="User A")
    user_b = make_user(id="user-b-id", google_id="google_bbb", email="b@test.com", name="User B")
    await _insert_user(db, user_a)
    await _insert_user(db, user_b)

    # --- Sessions ---
    session_a = make_session(id="session-a-id", user_id="user-a-id")
    session_b = make_session(id="session-b-id", user_id="user-b-id")
    await _insert_session(db, session_a)
    await _insert_session(db, session_b)

    # --- Conversations ---
    conv_a = make_conversation(id="conv-a-id", user_id="user-a-id", title="Conversation A")
    conv_b = make_conversation(id="conv-b-id", user_id="user-b-id", title="Conversation B")
    await _insert_conversation(db, conv_a)
    await _insert_conversation(db, conv_b)

    # --- Messages for conv_a (10 messages) ---
    for i in range(10):
        msg = make_message(
            id=f"msg-a-{i}",
            conversation_id="conv-a-id",
            role="user" if i % 2 == 0 else "assistant",
            content=f"Message {i}",
        )
        await _insert_message(db, msg)

    # --- Message for conv_b (1 message) ---
    msg_b = make_message(id="msg-b-0", conversation_id="conv-b-id", role="user", content="Hello B")
    await _insert_message(db, msg_b)

    # --- Datasets for conv_a (3 datasets) ---
    for i in range(3):
        ds = make_dataset(
            id=f"ds-a-{i}",
            conversation_id="conv-a-id",
            name=f"table{i+1}",
            status="ready",
        )
        await _insert_dataset(db, ds)

    # --- Token usage ---
    tu_a = make_token_usage(id="tu-a-id", user_id="user-a-id", conversation_id="conv-a-id")
    tu_b = make_token_usage(id="tu-b-id", user_id="user-b-id", conversation_id="conv-b-id")
    await _insert_token_usage(db, tu_a)
    await _insert_token_usage(db, tu_b)

    # --- Referral keys ---
    rk_created = make_referral_key(key="ref-created-by-a", created_by="user-a-id")
    rk_used = make_referral_key(key="ref-used-by-b", used_by="user-b-id")
    await _insert_referral_key(db, rk_created)
    await _insert_referral_key(db, rk_used)

    await db.commit()

    yield db
