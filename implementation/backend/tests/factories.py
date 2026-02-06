"""Factory functions for generating test data dicts.

Each factory produces a valid dict with UUID ids and ISO 8601 timestamps by
default.  Pass keyword overrides to customize individual fields.
"""

from datetime import datetime, timedelta
from uuid import uuid4


def make_user(**overrides: object) -> dict:
    """Return a user dict matching the ``users`` table schema."""
    now = datetime.utcnow().isoformat()
    defaults: dict = {
        "id": str(uuid4()),
        "google_id": f"google_{uuid4().hex[:8]}",
        "email": f"user_{uuid4().hex[:6]}@test.com",
        "name": "Test User",
        "avatar_url": None,
        "created_at": now,
        "last_login_at": now,
    }
    return {**defaults, **overrides}


def make_session(**overrides: object) -> dict:
    """Return a session dict matching the ``sessions`` table schema."""
    now = datetime.utcnow()
    defaults: dict = {
        "id": str(uuid4()),
        "user_id": str(uuid4()),
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=7)).isoformat(),
    }
    return {**defaults, **overrides}


def make_conversation(**overrides: object) -> dict:
    """Return a conversation dict matching the ``conversations`` table schema."""
    now = datetime.utcnow().isoformat()
    defaults: dict = {
        "id": str(uuid4()),
        "user_id": str(uuid4()),
        "title": "",
        "created_at": now,
        "updated_at": now,
    }
    return {**defaults, **overrides}


def make_message(**overrides: object) -> dict:
    """Return a message dict matching the ``messages`` table schema."""
    defaults: dict = {
        "id": str(uuid4()),
        "conversation_id": str(uuid4()),
        "role": "user",
        "content": "Hello, world!",
        "sql_query": None,
        "token_count": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **overrides}


def make_dataset(**overrides: object) -> dict:
    """Return a dataset dict matching the ``datasets`` table schema."""
    defaults: dict = {
        "id": str(uuid4()),
        "conversation_id": str(uuid4()),
        "url": "https://example.com/data.parquet",
        "name": "table1",
        "row_count": 0,
        "column_count": 0,
        "schema_json": "[]",
        "status": "loading",
        "error_message": None,
        "loaded_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **overrides}


def make_token_usage(**overrides: object) -> dict:
    """Return a token_usage dict matching the ``token_usage`` table schema."""
    defaults: dict = {
        "id": str(uuid4()),
        "user_id": str(uuid4()),
        "conversation_id": None,
        "model_name": "gemini-2.5-flash",
        "input_tokens": 100,
        "output_tokens": 50,
        "cost": 0.0,
        "timestamp": datetime.utcnow().isoformat(),
    }
    return {**defaults, **overrides}


def make_referral_key(**overrides: object) -> dict:
    """Return a referral_key dict matching the ``referral_keys`` table schema."""
    defaults: dict = {
        "key": f"ref-{uuid4().hex[:12]}",
        "created_by": None,
        "used_by": None,
        "created_at": datetime.utcnow().isoformat(),
        "used_at": None,
    }
    return {**defaults, **overrides}
