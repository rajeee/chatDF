"""Tests for the export router.

Covers:
- POST /export/xlsx  -> returns an Excel file (200)
- POST /export/xlsx  -> handles empty data (200)
- POST /export/xlsx  -> requires authentication (401)
"""

from __future__ import annotations

import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

import aiosqlite  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_session, make_user  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _insert_user(db: aiosqlite.Connection, user: dict) -> None:
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            user["google_id"],
            user["email"],
            user["name"],
            user["avatar_url"],
            user["created_at"],
            user["last_login_at"],
        ),
    )
    await db.commit()


async def _insert_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            session["id"],
            session["user_id"],
            session["created_at"],
            session["expires_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def fresh_db():
    """In-memory SQLite database with the full ChatDF schema."""
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA_SQL)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def test_user(fresh_db):
    user = make_user()
    await _insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_session(fresh_db, test_user):
    session = make_session(user_id=test_user["id"])
    await _insert_session(fresh_db, session)
    return session


@pytest_asyncio.fixture
async def authed_client(fresh_db, test_session):
    """Authenticated httpx client with session cookie."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as c:
        yield c


@pytest_asyncio.fixture
async def client(fresh_db):
    """Unauthenticated httpx client."""
    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as c:
        yield c


# =========================================================================
# Tests
# =========================================================================


class TestExportXlsx:
    """POST /export/xlsx -> returns an Excel file."""

    @pytest.mark.asyncio
    async def test_export_xlsx_returns_file(self, authed_client):
        """POST /export/xlsx returns an Excel file."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["name", "age"],
                "rows": [["Alice", 30], ["Bob", 25]],
                "filename": "test-export",
            },
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument" in response.headers["content-type"]
        assert "test-export.xlsx" in response.headers.get("content-disposition", "")
        # Verify it's a valid xlsx (starts with PK zip signature)
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_export_xlsx_empty_data(self, authed_client):
        """POST /export/xlsx handles empty data."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["a", "b"],
                "rows": [],
            },
        )
        assert response.status_code == 200
        assert response.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_export_xlsx_default_filename(self, authed_client):
        """POST /export/xlsx uses default filename when not provided."""
        response = await authed_client.post(
            "/export/xlsx",
            json={
                "columns": ["x"],
                "rows": [["val"]],
            },
        )
        assert response.status_code == 200
        assert "query-results.xlsx" in response.headers.get("content-disposition", "")

    @pytest.mark.asyncio
    async def test_export_xlsx_requires_auth(self, client):
        """POST /export/xlsx requires authentication."""
        response = await client.post(
            "/export/xlsx",
            json={"columns": ["a"], "rows": [["1"]]},
        )
        assert response.status_code == 401
