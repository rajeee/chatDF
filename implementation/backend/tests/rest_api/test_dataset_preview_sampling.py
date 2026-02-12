"""Tests for dataset preview sampling edge cases.

Covers POST /conversations/{conversation_id}/datasets/{dataset_id}/preview with:
- Default head sampling
- Tail sampling
- Random sampling
- Stratified without sample_column (400)
- Stratified with invalid column (400)
- Percentage sampling
- Invalid sample_method (422 regex validation)
- Backward compat: random_sample=true overrides method to random
- Dataset not found (404)
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio

from tests.factories import make_conversation, make_dataset
from tests.rest_api.conftest import assert_error_response, assert_success_response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
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
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conversation_owned(fresh_db, test_user):
    """A conversation owned by the default test_user."""
    conv = make_conversation(user_id=test_user["id"], title="Preview Test Conv")
    await insert_conversation(fresh_db, conv)
    return conv


@pytest_asyncio.fixture
async def ready_dataset(fresh_db, conversation_owned):
    """A ready dataset with a known schema, seeded into the DB."""
    schema = [
        {"name": "id", "type": "INTEGER"},
        {"name": "category", "type": "TEXT"},
        {"name": "value", "type": "FLOAT"},
    ]
    ds = make_dataset(
        conversation_id=conversation_owned["id"],
        name="test_table",
        status="ready",
        row_count=200,
        column_count=3,
        schema_json=json.dumps(schema),
        url="https://example.com/test.parquet",
    )
    await insert_dataset(fresh_db, ds)
    return ds


@pytest_asyncio.fixture
async def authed_client_with_pool(fresh_db, test_session, mock_worker_pool):
    """Authenticated client with mock worker_pool attached to app.state."""
    from app.main import app
    from httpx import ASGITransport, AsyncClient

    app.state.db = fresh_db
    app.state.worker_pool = mock_worker_pool
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"session_token": test_session["id"]},
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# Helper to build the preview URL
# ---------------------------------------------------------------------------


def _preview_url(conversation_id: str, dataset_id: str) -> str:
    return f"/conversations/{conversation_id}/datasets/{dataset_id}/preview"


# ===========================================================================
# Tests
# ===========================================================================


class TestDatasetPreviewSampling:
    """POST /conversations/{conv_id}/datasets/{ds_id}/preview"""

    # -----------------------------------------------------------------------
    # 1. Default head sampling
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_default_head_sampling(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
        mock_worker_pool,
    ):
        """Default request (no params) uses head sampling and returns data."""
        mock_worker_pool.run_query.return_value = {
            "rows": [{"id": 1, "category": "A", "value": 10.0}],
            "columns": ["id", "category", "value"],
            "total_rows": 1,
        }

        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(url)

        body = assert_success_response(response, 200)
        assert body["sample_method"] == "head"
        assert body["columns"] == ["id", "category", "value"]
        assert len(body["rows"]) == 1
        assert body["rows"][0] == [1, "A", 10.0]
        assert body["total_rows"] == 200

        # Verify the SQL passed to run_query uses LIMIT
        call_args = mock_worker_pool.run_query.call_args
        sql = call_args[0][0]
        assert "LIMIT 10" in sql
        assert "ORDER BY" not in sql  # head doesn't randomize

    # -----------------------------------------------------------------------
    # 2. Tail sampling
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_tail_sampling(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
        mock_worker_pool,
    ):
        """sample_method=tail returns data ordered by descending row number."""
        mock_worker_pool.run_query.return_value = {
            "rows": [
                {"id": 200, "category": "Z", "value": 99.0, "_rn": 200},
                {"id": 199, "category": "Y", "value": 98.0, "_rn": 199},
            ],
            "columns": ["id", "category", "value", "_rn"],
            "total_rows": 2,
        }

        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url, params={"sample_method": "tail", "sample_size": 5}
        )

        body = assert_success_response(response, 200)
        assert body["sample_method"] == "tail"
        # _rn column should be filtered out from display
        assert "_rn" not in body["columns"]
        assert body["columns"] == ["id", "category", "value"]
        # Rows should not contain _rn values
        assert len(body["rows"][0]) == 3

        # Verify the SQL uses ROW_NUMBER and DESC ordering
        sql = mock_worker_pool.run_query.call_args[0][0]
        assert "ROW_NUMBER" in sql
        assert "DESC" in sql
        assert "LIMIT 5" in sql

    # -----------------------------------------------------------------------
    # 3. Random sampling
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_random_sampling(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
        mock_worker_pool,
    ):
        """sample_method=random returns data with ORDER BY RANDOM()."""
        mock_worker_pool.run_query.return_value = {
            "rows": [{"id": 42, "category": "B", "value": 55.5}],
            "columns": ["id", "category", "value"],
            "total_rows": 1,
        }

        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url, params={"sample_method": "random", "sample_size": 3}
        )

        body = assert_success_response(response, 200)
        assert body["sample_method"] == "random"
        assert body["columns"] == ["id", "category", "value"]
        assert len(body["rows"]) == 1

        # Verify SQL uses RANDOM()
        sql = mock_worker_pool.run_query.call_args[0][0]
        assert "RANDOM()" in sql
        assert "LIMIT 3" in sql

    # -----------------------------------------------------------------------
    # 4. Stratified without sample_column -> 400
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_stratified_without_sample_column_returns_400(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
    ):
        """Stratified sampling without sample_column returns 400."""
        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url, params={"sample_method": "stratified"}
        )

        assert response.status_code == 400
        body = response.json()
        assert "sample_column is required" in body["error"]

    # -----------------------------------------------------------------------
    # 5. Stratified with invalid column -> 400
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_stratified_with_invalid_column_returns_400(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
    ):
        """Stratified sampling with a column not in the schema returns 400."""
        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url,
            params={
                "sample_method": "stratified",
                "sample_column": "nonexistent_col",
            },
        )

        assert response.status_code == 400
        body = response.json()
        assert "nonexistent_col" in body["error"]
        assert "not found" in body["error"]

    # -----------------------------------------------------------------------
    # 6. Percentage sampling
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_percentage_sampling(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
        mock_worker_pool,
    ):
        """sample_method=percentage computes row count from percentage and total rows."""
        mock_worker_pool.run_query.return_value = {
            "rows": [
                {"id": 10, "category": "A", "value": 1.0},
                {"id": 20, "category": "B", "value": 2.0},
            ],
            "columns": ["id", "category", "value"],
            "total_rows": 2,
        }

        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url,
            params={"sample_method": "percentage", "sample_percentage": 5.0},
        )

        body = assert_success_response(response, 200)
        assert body["sample_method"] == "percentage"
        assert body["columns"] == ["id", "category", "value"]

        # With 200 rows at 5%, computed_count = round(200 * 5.0 / 100) = 10
        sql = mock_worker_pool.run_query.call_args[0][0]
        assert "RANDOM()" in sql
        assert "LIMIT 10" in sql

    # -----------------------------------------------------------------------
    # 7. Invalid sample_method -> 422 (regex validation)
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_invalid_sample_method_returns_422(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
    ):
        """An invalid sample_method value fails regex validation with 422."""
        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url, params={"sample_method": "bogus_method"}
        )

        assert response.status_code == 422

    # -----------------------------------------------------------------------
    # 8. Backward compat: random_sample=true overrides sample_method
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_backward_compat_random_sample_overrides_method(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        ready_dataset,
        authed_client_with_pool,
        mock_worker_pool,
    ):
        """random_sample=true with default sample_method overrides to random."""
        mock_worker_pool.run_query.return_value = {
            "rows": [{"id": 7, "category": "C", "value": 77.7}],
            "columns": ["id", "category", "value"],
            "total_rows": 1,
        }

        url = _preview_url(conversation_owned["id"], ready_dataset["id"])
        response = await authed_client_with_pool.post(
            url, params={"random_sample": "true"}
        )

        body = assert_success_response(response, 200)
        assert body["sample_method"] == "random"

        # Verify SQL uses RANDOM()
        sql = mock_worker_pool.run_query.call_args[0][0]
        assert "RANDOM()" in sql

    # -----------------------------------------------------------------------
    # 9. Dataset not found -> 404
    # -----------------------------------------------------------------------

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_dataset_not_found_returns_404(
        self,
        fresh_db,
        test_user,
        conversation_owned,
        authed_client_with_pool,
    ):
        """Preview for a nonexistent dataset returns 404."""
        fake_dataset_id = str(uuid4())
        url = _preview_url(conversation_owned["id"], fake_dataset_id)
        response = await authed_client_with_pool.post(url)

        assert response.status_code == 404
        body = response.json()
        assert "not found" in body["error"].lower()
