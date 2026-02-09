"""Tests for enhanced dataset sampling controls.

Tests the preview endpoint with the new sample_method parameter:
- head (default)
- tail
- random
- stratified (with sample_column)
- percentage (with sample_percentage)

Also tests backward compatibility with the old random_sample param.
"""

from __future__ import annotations

import json
import os

# Set required env vars before any app imports.
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret")

from app.config import get_settings  # noqa: E402
get_settings.cache_clear()

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from tests.factories import make_conversation, make_dataset  # noqa: E402
from tests.rest_api.conftest import (  # noqa: E402
    assert_error_response,
    assert_success_response,
    insert_session,
    insert_user,
)


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


async def insert_dataset(db, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            ds["id"],
            ds["conversation_id"],
            ds["url"],
            ds["name"],
            ds["row_count"],
            ds["column_count"],
            ds["schema_json"],
            ds["status"],
            ds["error_message"],
            ds["loaded_at"],
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures (reuse the rest_api conftest fixtures)
# ---------------------------------------------------------------------------

import aiosqlite  # noqa: E402
from tests.conftest import SCHEMA_SQL  # noqa: E402
from tests.factories import make_user, make_session  # noqa: E402
from unittest.mock import AsyncMock  # noqa: E402


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
    await insert_user(fresh_db, user)
    return user


@pytest_asyncio.fixture
async def test_session(fresh_db, test_user):
    session = make_session(user_id=test_user["id"])
    await insert_session(fresh_db, session)
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


@pytest.fixture
def mock_worker_pool():
    pool = AsyncMock()
    pool.validate_url = AsyncMock(return_value={"valid": True})
    pool.get_schema = AsyncMock(
        return_value={
            "columns": [{"name": "id", "type": "INTEGER"}, {"name": "value", "type": "TEXT"}],
            "row_count": 100,
        },
    )
    pool.run_query = AsyncMock(
        return_value={
            "rows": [{"id": 1, "value": "a"}],
            "columns": ["id", "value"],
            "total_rows": 1,
        },
    )
    return pool


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    conv = make_conversation(user_id=test_user["id"])
    await insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def dataset_in_conversation(fresh_db, conversation_owned):
    ds = make_dataset(
        conversation_id=conversation_owned["id"],
        url="https://example.com/data.parquet",
        name="table1",
        row_count=1000,
        column_count=3,
        schema_json=json.dumps([
            {"name": "id", "type": "INTEGER"},
            {"name": "value", "type": "TEXT"},
            {"name": "category", "type": "TEXT"},
        ]),
        status="ready",
    )
    await insert_dataset(fresh_db, ds)
    return ds


# ---------------------------------------------------------------------------
# Test: HEAD sampling (default)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_head_sampling_default(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=head (default) uses simple LIMIT query."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value", "category"],
        "rows": [{"id": 1, "value": "a", "category": "x"}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=head&sample_size=10",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "head"
    assert body["columns"] == ["id", "value", "category"]

    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "LIMIT 10" in sql_arg
    assert "ORDER BY" not in sql_arg
    assert "ROW_NUMBER" not in sql_arg


# ---------------------------------------------------------------------------
# Test: TAIL sampling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_tail_sampling(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=tail uses ROW_NUMBER DESC query."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value", "category", "_rn"],
        "rows": [{"id": 100, "value": "z", "category": "y", "_rn": 1000}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=tail&sample_size=25",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "tail"
    # _rn column should be filtered out of the response
    assert "_rn" not in body["columns"]
    assert body["columns"] == ["id", "value", "category"]

    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "ROW_NUMBER() OVER ()" in sql_arg
    assert "ORDER BY _rn DESC" in sql_arg
    assert "LIMIT 25" in sql_arg


# ---------------------------------------------------------------------------
# Test: RANDOM sampling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_random_sampling(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=random uses ORDER BY RANDOM() query."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value", "category"],
        "rows": [{"id": 42, "value": "rand", "category": "r"}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=random&sample_size=50",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "random"

    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "ORDER BY RANDOM()" in sql_arg
    assert "LIMIT 50" in sql_arg


# ---------------------------------------------------------------------------
# Test: STRATIFIED sampling with column
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_stratified_sampling(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=stratified partitions by the given column."""
    from app.main import app

    # First call: COUNT(DISTINCT ...) returns 5 categories
    # Second call: the actual stratified query
    mock_worker_pool.run_query.side_effect = [
        {
            "columns": ["cnt"],
            "rows": [{"cnt": 5}],
            "total_rows": 1,
        },
        {
            "columns": ["id", "value", "category", "_rn"],
            "rows": [
                {"id": 1, "value": "a", "category": "x", "_rn": 1},
                {"id": 2, "value": "b", "category": "y", "_rn": 1},
            ],
            "total_rows": 2,
        },
    ]
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=stratified&sample_column=category&sample_size=10",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "stratified"
    # _rn column should be filtered out
    assert "_rn" not in body["columns"]

    # The second run_query call should have PARTITION BY
    calls = mock_worker_pool.run_query.call_args_list
    assert len(calls) == 2

    # First call: count distinct
    count_sql = calls[0][0][0]
    assert 'COUNT(DISTINCT "category")' in count_sql

    # Second call: stratified query
    stratified_sql = calls[1][0][0]
    assert 'PARTITION BY "category"' in stratified_sql
    assert "ORDER BY RANDOM()" in stratified_sql
    assert "LIMIT 10" in stratified_sql


# ---------------------------------------------------------------------------
# Test: STRATIFIED without column returns 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_stratified_without_column_returns_400(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=stratified but no sample_column returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=stratified&sample_size=10",
    )

    assert response.status_code == 400
    body = response.json()
    assert "sample_column is required" in body.get("error", body.get("detail", ""))


# ---------------------------------------------------------------------------
# Test: STRATIFIED with invalid column returns 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_stratified_invalid_column_returns_400(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=stratified and non-existent column returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=stratified&sample_column=nonexistent&sample_size=10",
    )

    assert response.status_code == 400
    body = response.json()
    assert "not found" in body.get("error", body.get("detail", ""))


# ---------------------------------------------------------------------------
# Test: PERCENTAGE sampling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_percentage_sampling(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_method=percentage computes count from total rows."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value", "category"],
        "rows": [{"id": i, "value": f"v{i}", "category": "c"} for i in range(10)],
        "total_rows": 10,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    # 1% of 1000 rows = 10
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=percentage&sample_percentage=1.0",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "percentage"

    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "ORDER BY RANDOM()" in sql_arg
    # 1% of 1000 = 10
    assert "LIMIT 10" in sql_arg


# ---------------------------------------------------------------------------
# Test: PERCENTAGE sampling caps at 100
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_percentage_sampling_caps_at_100(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with percentage that would exceed 100 rows caps at 100."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id"],
        "rows": [{"id": i} for i in range(100)],
        "total_rows": 100,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    # 50% of 1000 rows = 500, but capped at 100
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=percentage&sample_percentage=50.0",
    )

    body = assert_success_response(response, status_code=200)
    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "LIMIT 100" in sql_arg


# ---------------------------------------------------------------------------
# Test: Invalid sample method returns 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_invalid_sample_method_returns_422(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with invalid sample_method returns 422 validation error."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=invalid_method",
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Test: Percentage out of range returns 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_percentage_out_of_range_returns_422(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with sample_percentage > 100 returns 422 validation error."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?sample_method=percentage&sample_percentage=200.0",
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Test: Backward compatibility - random_sample=true overrides to random
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_backward_compat_random_sample(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview with random_sample=true (old param) treats as sample_method=random."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value", "category"],
        "rows": [{"id": 5, "value": "e", "category": "c"}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]
    # Use old-style random_sample param without sample_method
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview"
        "?random_sample=true&sample_size=10",
    )

    body = assert_success_response(response, status_code=200)
    assert body["sample_method"] == "random"

    call_args = mock_worker_pool.run_query.call_args
    sql_arg = call_args[0][0]
    assert "ORDER BY RANDOM()" in sql_arg


# ---------------------------------------------------------------------------
# Test: response includes sample_method field
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_preview_response_includes_sample_method(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """POST preview response body always includes sample_method field."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value", "category"],
        "rows": [{"id": 1, "value": "a", "category": "x"}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    dataset_id = dataset_in_conversation["id"]

    # Default (no sample_method param) should return "head"
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/datasets/{dataset_id}/preview",
    )

    body = assert_success_response(response, status_code=200)
    assert "sample_method" in body
    assert body["sample_method"] == "head"
