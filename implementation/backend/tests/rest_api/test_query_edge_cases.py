"""Edge-case tests for conversation query and generate-sql endpoints."""
from __future__ import annotations

import json
from uuid import uuid4

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from tests.factories import make_conversation, make_dataset
from tests.rest_api.conftest import assert_error_response, assert_success_response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv):
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (conv["id"], conv["user_id"], conv["title"], conv["created_at"], conv["updated_at"]),
    )
    await db.commit()


async def insert_dataset(db, ds):
    await db.execute(
        "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ds["id"], ds["conversation_id"], ds["url"], ds["name"], ds["row_count"], ds["column_count"], ds["schema_json"], ds["status"], ds["error_message"], ds["loaded_at"]),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
        row_count=100,
        column_count=2,
        schema_json=json.dumps([{"name": "id", "type": "INTEGER"}, {"name": "value", "type": "TEXT"}]),
        status="ready",
    )
    await insert_dataset(fresh_db, ds)
    return ds


# ===========================================================================
# POST /conversations/{id}/query -- error paths
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_no_datasets_returns_400(authed_client, fresh_db, conversation_owned, mock_worker_pool):
    """Query when no datasets are loaded in the conversation returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT * FROM table1"},
    )

    assert_error_response(response, 400, "No datasets loaded")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_worker_sql_error_returns_400(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Query with SQL that the worker_pool returns an error for returns 400."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "error_type": "sql",
        "message": "Column not found",
    }
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT nonexistent_col FROM table1"},
    )

    assert_error_response(response, 400, "Column not found")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_empty_sql_returns_422(authed_client, fresh_db, conversation_owned, mock_worker_pool):
    """Query with empty SQL string returns 422 validation error (pydantic min_length=1)."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": ""},
    )

    # pydantic validation rejects empty string due to min_length=1
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_nonexistent_conversation_returns_404(authed_client, fresh_db, mock_worker_pool):
    """Query against a nonexistent conversation returns 404."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    fake_conv_id = str(uuid4())
    response = await authed_client.post(
        f"/conversations/{fake_conv_id}/query",
        json={"sql": "SELECT 1"},
    )

    assert_error_response(response, 404, "Conversation not found")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_no_worker_pool_returns_503(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation
):
    """Query when worker_pool is None returns 503."""
    from app.main import app

    app.state.worker_pool = None

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT * FROM table1"},
    )

    assert_error_response(response, 503, "Worker pool unavailable")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_worker_internal_error_returns_400(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Worker returning an internal error_type still returns 400 with the message."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "error_type": "internal",
        "message": "Out of memory",
    }
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT * FROM table1"},
    )

    assert_error_response(response, 400, "Out of memory")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_worker_error_without_message_returns_default(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Worker returning error_type but no message uses the fallback 'Query execution failed'."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "error_type": "sql",
    }
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT bad_stuff FROM table1"},
    )

    assert_error_response(response, 400, "Query execution failed")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_only_loading_datasets_returns_400(authed_client, fresh_db, conversation_owned, mock_worker_pool):
    """Datasets with status='loading' are not considered ready; query returns 400."""
    from app.main import app

    app.state.worker_pool = mock_worker_pool

    # Insert a dataset with status="loading" (not "ready")
    ds = make_dataset(
        conversation_id=conversation_owned["id"],
        url="https://example.com/loading.parquet",
        name="loading_table",
        status="loading",
    )
    await insert_dataset(fresh_db, ds)

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT * FROM loading_table"},
    )

    assert_error_response(response, 400, "No datasets loaded")


# ===========================================================================
# POST /conversations/{id}/query -- success paths
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_success_returns_columns_and_rows(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Successful query returns columns, rows (list-of-lists), total_rows, and timing info."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value"],
        "rows": [{"id": 1, "value": "a"}, {"id": 2, "value": "b"}],
        "total_rows": 2,
    }
    app.state.worker_pool = mock_worker_pool

    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": "SELECT id, value FROM table1"},
    )

    body = assert_success_response(response, 200)
    assert body["columns"] == ["id", "value"]
    assert body["rows"] == [[1, "a"], [2, "b"]]
    assert body["total_rows"] == 2
    assert "execution_time_ms" in body
    assert isinstance(body["execution_time_ms"], float)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_same_sql_twice_works(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Same query executed twice should work (whether cached or not)."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id", "value"],
        "rows": [{"id": 1, "value": "a"}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    sql = "SELECT id, value FROM table1 LIMIT 1"

    # First execution
    response1 = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": sql},
    )
    body1 = assert_success_response(response1, 200)
    assert body1["columns"] == ["id", "value"]
    assert body1["total_rows"] == 1

    # Second execution -- same SQL
    response2 = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": sql},
    )
    body2 = assert_success_response(response2, 200)
    assert body2["columns"] == ["id", "value"]
    assert body2["total_rows"] == 1

    # Worker pool should have been called twice
    assert mock_worker_pool.run_query.call_count == 2


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_records_history_on_success(
    authed_client, fresh_db, test_user, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Successful query is recorded in query_history table."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "columns": ["id"],
        "rows": [{"id": 1}],
        "total_rows": 1,
    }
    app.state.worker_pool = mock_worker_pool

    sql = "SELECT id FROM table1"
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": sql},
    )
    assert_success_response(response, 200)

    # Check query_history
    cursor = await fresh_db.execute(
        "SELECT * FROM query_history WHERE user_id = ? AND conversation_id = ?",
        (test_user["id"], conversation_owned["id"]),
    )
    rows = await cursor.fetchall()
    assert len(rows) >= 1
    history_row = rows[0]
    assert history_row["status"] == "success"
    assert history_row["query"] == sql


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_records_history_on_error(
    authed_client, fresh_db, test_user, conversation_owned, dataset_in_conversation, mock_worker_pool
):
    """Failed query is recorded in query_history with status='error'."""
    from app.main import app

    mock_worker_pool.run_query.return_value = {
        "error_type": "sql",
        "message": "Syntax error near SELECT",
    }
    app.state.worker_pool = mock_worker_pool

    sql = "SELEC bad_syntax"
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/query",
        json={"sql": sql},
    )
    assert response.status_code == 400

    # Check query_history
    cursor = await fresh_db.execute(
        "SELECT * FROM query_history WHERE user_id = ? AND conversation_id = ? AND status = 'error'",
        (test_user["id"], conversation_owned["id"]),
    )
    rows = await cursor.fetchall()
    assert len(rows) >= 1
    history_row = rows[0]
    assert history_row["error_message"] == "Syntax error near SELECT"


# ===========================================================================
# POST /conversations/{id}/generate-sql -- edge cases
# ===========================================================================


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_sql_no_datasets_returns_400(authed_client, fresh_db, conversation_owned):
    """Generate SQL when no datasets are loaded returns 400."""
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/generate-sql",
        json={"question": "How many rows are there?"},
    )

    assert_error_response(response, 400, "No datasets loaded")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_sql_nonexistent_conversation_returns_404(authed_client, fresh_db):
    """Generate SQL against a nonexistent conversation returns 404."""
    fake_conv_id = str(uuid4())
    response = await authed_client.post(
        f"/conversations/{fake_conv_id}/generate-sql",
        json={"question": "How many rows are there?"},
    )

    assert_error_response(response, 404, "Conversation not found")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_sql_success(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation
):
    """Generate SQL with a loaded dataset and mocked LLM returns sql and explanation."""
    mock_response = MagicMock()
    mock_response.text = "SQL: SELECT COUNT(*) FROM table1\nEXPLANATION: Counts all rows."
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.llm_service.client", mock_client), \
         patch("app.services.llm_service.MODEL_ID", "test-model"):
        response = await authed_client.post(
            f"/conversations/{conversation_owned['id']}/generate-sql",
            json={"question": "How many rows are there?"},
        )

    body = assert_success_response(response, 200)
    assert body["sql"] == "SELECT COUNT(*) FROM table1"
    assert body["explanation"] == "Counts all rows."


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_sql_llm_error_returns_502(
    authed_client, fresh_db, conversation_owned, dataset_in_conversation
):
    """LLM failure during generate-sql returns 502."""
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=RuntimeError("Gemini unavailable")
    )

    with patch("app.services.llm_service.client", mock_client), \
         patch("app.services.llm_service.MODEL_ID", "test-model"):
        response = await authed_client.post(
            f"/conversations/{conversation_owned['id']}/generate-sql",
            json={"question": "Show me all data"},
        )

    assert_error_response(response, 502, "LLM error")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_sql_empty_question_returns_422(authed_client, fresh_db, conversation_owned):
    """Generate SQL with empty question string returns 422 (pydantic min_length=1)."""
    response = await authed_client.post(
        f"/conversations/{conversation_owned['id']}/generate-sql",
        json={"question": ""},
    )

    assert response.status_code == 422
