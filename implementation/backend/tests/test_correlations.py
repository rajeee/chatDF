"""Tests for the correlation matrix endpoint and worker function.

Tests:
- Worker function: compute_correlations with numeric columns, edge cases
- Endpoint: GET /conversations/{id}/datasets/{dataset_id}/correlations
"""

from __future__ import annotations

import json
import math
import os
import tempfile
from datetime import datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio

# ---------------------------------------------------------------------------
# Worker function tests (no HTTP, pure unit tests)
# ---------------------------------------------------------------------------


class TestComputeCorrelationsWorker:
    """Tests for the compute_correlations worker function."""

    def _make_parquet(self, data: dict) -> str:
        """Create a temporary parquet file from a dict of columns and return its path."""
        import polars as pl

        df = pl.DataFrame(data)
        fd, path = tempfile.mkstemp(suffix=".parquet")
        os.close(fd)
        df.write_parquet(path)
        return path

    def test_basic_correlation(self):
        """Computes correlation for 2+ numeric columns."""
        from app.workers.data_worker import compute_correlations

        path = self._make_parquet({
            "a": [1.0, 2.0, 3.0, 4.0, 5.0],
            "b": [2.0, 4.0, 6.0, 8.0, 10.0],
            "c": [5.0, 4.0, 3.0, 2.0, 1.0],
        })
        try:
            result = compute_correlations(f"file://{path}")

            assert "columns" in result
            assert "matrix" in result
            assert result["columns"] == ["a", "b", "c"]
            assert len(result["matrix"]) == 3
            assert len(result["matrix"][0]) == 3

            # a and b are perfectly correlated (1.0)
            assert result["matrix"][0][1] == 1.0
            # a and c are perfectly anti-correlated (-1.0)
            assert result["matrix"][0][2] == -1.0
            # Diagonal is always 1.0
            assert result["matrix"][0][0] == 1.0
            assert result["matrix"][1][1] == 1.0
            assert result["matrix"][2][2] == 1.0
        finally:
            os.unlink(path)

    def test_fewer_than_2_numeric_columns(self):
        """Returns error when fewer than 2 numeric columns."""
        from app.workers.data_worker import compute_correlations

        path = self._make_parquet({
            "name": ["alice", "bob", "carol"],
            "age": [25, 30, 35],
        })
        try:
            result = compute_correlations(f"file://{path}")
            assert "error" in result
            assert "2 numeric columns" in result["error"]
        finally:
            os.unlink(path)

    def test_no_numeric_columns(self):
        """Returns error when no numeric columns at all."""
        from app.workers.data_worker import compute_correlations

        path = self._make_parquet({
            "name": ["alice", "bob", "carol"],
            "city": ["NY", "LA", "SF"],
        })
        try:
            result = compute_correlations(f"file://{path}")
            assert "error" in result
            assert "2 numeric columns" in result["error"]
        finally:
            os.unlink(path)

    def test_mixed_types_selects_only_numeric(self):
        """Only numeric columns are included; string columns are excluded."""
        from app.workers.data_worker import compute_correlations

        path = self._make_parquet({
            "name": ["alice", "bob", "carol", "dave", "eve"],
            "x": [1.0, 2.0, 3.0, 4.0, 5.0],
            "y": [10, 20, 30, 40, 50],
            "label": ["a", "b", "c", "d", "e"],
        })
        try:
            result = compute_correlations(f"file://{path}")
            assert "columns" in result
            # Only x and y should be included
            assert set(result["columns"]) == {"x", "y"}
            assert len(result["matrix"]) == 2
        finally:
            os.unlink(path)

    def test_nan_replaced_with_null(self):
        """NaN values in correlation matrix are replaced with null/None."""
        from app.workers.data_worker import compute_correlations

        # A constant column will produce NaN correlations
        path = self._make_parquet({
            "a": [1.0, 2.0, 3.0, 4.0, 5.0],
            "constant": [5.0, 5.0, 5.0, 5.0, 5.0],
        })
        try:
            result = compute_correlations(f"file://{path}")
            assert "columns" in result
            # The correlation of a constant column with anything is NaN -> null
            matrix = result["matrix"]
            for row in matrix:
                for val in row:
                    if val is not None:
                        assert not math.isnan(val), "NaN should be replaced with None"
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# Endpoint integration tests
# ---------------------------------------------------------------------------


# Import test infra - set env vars before app imports
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from app.config import get_settings  # noqa: E402
get_settings.cache_clear()

import aiosqlite  # noqa: E402

from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_conversation, make_dataset, make_session, make_user  # noqa: E402


async def _insert_user(db, user):
    await db.execute(
        "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], user["google_id"], user["email"], user["name"],
         user["avatar_url"], user["created_at"], user["last_login_at"]),
    )
    await db.commit()


async def _insert_session(db, session):
    await db.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session["id"], session["user_id"], session["created_at"], session["expires_at"]),
    )
    await db.commit()


async def _insert_conversation(db, conv):
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def _insert_dataset(db, ds):
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ds["id"], ds["conversation_id"], ds["url"], ds["name"],
         ds["row_count"], ds["column_count"], ds["schema_json"],
         ds["status"], ds["error_message"], ds["loaded_at"]),
    )
    await db.commit()


@pytest_asyncio.fixture
async def fresh_db():
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
    from app.main import app
    from httpx import ASGITransport, AsyncClient

    app.state.db = fresh_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as client:
        yield client


@pytest_asyncio.fixture
async def conversation(fresh_db, test_user):
    conv = make_conversation(user_id=test_user["id"])
    await _insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def dataset(fresh_db, conversation):
    ds = make_dataset(
        conversation_id=conversation["id"],
        url="https://example.com/data.parquet",
        name="table1",
        row_count=100,
        column_count=3,
        schema_json=json.dumps([
            {"name": "x", "type": "Float64"},
            {"name": "y", "type": "Int64"},
            {"name": "name", "type": "Utf8"},
        ]),
        status="ready",
    )
    await _insert_dataset(fresh_db, ds)
    return ds


@pytest.mark.asyncio
@pytest.mark.integration
async def test_correlations_endpoint_success(authed_client, fresh_db, conversation, dataset):
    """GET correlations returns 200 with columns and matrix."""
    from app.main import app

    mock_pool = AsyncMock()
    mock_pool.compute_correlations = AsyncMock(return_value={
        "columns": ["x", "y"],
        "matrix": [[1.0, 0.95], [0.95, 1.0]],
    })
    app.state.worker_pool = mock_pool

    response = await authed_client.get(
        f"/conversations/{conversation['id']}/datasets/{dataset['id']}/correlations",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["columns"] == ["x", "y"]
    assert body["matrix"] == [[1.0, 0.95], [0.95, 1.0]]

    # Verify the worker was called with the correct URL
    mock_pool.compute_correlations.assert_awaited_once_with(dataset["url"])


@pytest.mark.asyncio
@pytest.mark.integration
async def test_correlations_endpoint_too_few_numeric(authed_client, fresh_db, conversation, dataset):
    """GET correlations returns 400 when dataset has fewer than 2 numeric columns."""
    from app.main import app

    mock_pool = AsyncMock()
    mock_pool.compute_correlations = AsyncMock(return_value={
        "error": "Need at least 2 numeric columns for correlation matrix",
    })
    app.state.worker_pool = mock_pool

    response = await authed_client.get(
        f"/conversations/{conversation['id']}/datasets/{dataset['id']}/correlations",
    )

    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.integration
async def test_correlations_endpoint_dataset_not_found(authed_client, fresh_db, conversation):
    """GET correlations returns 404 for nonexistent dataset."""
    from app.main import app

    mock_pool = AsyncMock()
    app.state.worker_pool = mock_pool

    response = await authed_client.get(
        f"/conversations/{conversation['id']}/datasets/nonexistent-id/correlations",
    )

    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.integration
async def test_correlations_endpoint_worker_error(authed_client, fresh_db, conversation, dataset):
    """GET correlations returns 500 when worker returns error_type."""
    from app.main import app

    mock_pool = AsyncMock()
    mock_pool.compute_correlations = AsyncMock(return_value={
        "error_type": "internal",
        "message": "Unexpected failure",
    })
    app.state.worker_pool = mock_pool

    response = await authed_client.get(
        f"/conversations/{conversation['id']}/datasets/{dataset['id']}/correlations",
    )

    assert response.status_code == 500
