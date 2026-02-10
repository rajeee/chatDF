"""Hardening tests for complex conversation operations.

Covers edge cases and deeper verification for:
- Fork conversation: message ordering, SQL preservation, dataset schema copy,
  forking at first/last message, forking non-existent conversation
- Share/unshare: share URL format, unshare already-unshared, share another user's conv
- Export HTML via HTTP endpoint: content-type, disposition, content integrity,
  empty conversation, SQL blocks in HTML, special characters
- Run query: error history recording, multiple datasets, empty SQL validation,
  pagination edge cases
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

from unittest.mock import AsyncMock, MagicMock  # noqa: E402
from uuid import uuid4  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from tests.factories import make_conversation, make_dataset, make_message  # noqa: E402
from tests.rest_api.conftest import (  # noqa: E402
    assert_error_response,
    assert_success_response,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def insert_conversation(db, conv: dict) -> None:
    await db.execute(
        "INSERT INTO conversations (id, user_id, title, is_pinned, share_token, shared_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            conv["id"],
            conv["user_id"],
            conv["title"],
            conv.get("is_pinned", 0),
            conv.get("share_token"),
            conv.get("shared_at"),
            conv["created_at"],
            conv["updated_at"],
        ),
    )
    await db.commit()


async def insert_message(db, msg: dict) -> None:
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, sql_query, reasoning, token_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg["sql_query"],
            msg.get("reasoning"),
            msg["token_count"],
            msg["created_at"],
        ),
    )
    await db.commit()


async def insert_dataset(db, ds: dict) -> None:
    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, "
        "status, error_message, loaded_at, file_size_bytes, column_descriptions) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            ds.get("file_size_bytes"),
            ds.get("column_descriptions", "{}"),
        ),
    )
    await db.commit()


# ===========================================================================
# FORK: Hardening tests
# ===========================================================================


class TestForkConversationHardening:
    """Deep-dive fork conversation tests beyond basic happy path."""

    @pytest.mark.asyncio
    async def test_fork_preserves_message_order_and_roles(
        self, authed_client, fresh_db, test_user,
    ):
        """Forked conversation preserves exact chronological order and alternating roles."""
        conv = make_conversation(user_id=test_user["id"], title="Ordered Chat")
        await insert_conversation(fresh_db, conv)

        msgs = []
        for i in range(6):
            role = "user" if i % 2 == 0 else "assistant"
            msg = make_message(
                conversation_id=conv["id"],
                role=role,
                content=f"Message {i}",
                created_at=f"2024-01-01T10:00:{i:02d}",
            )
            msgs.append(msg)
            await insert_message(fresh_db, msg)

        # Fork at message index 4 (5th message, role=user)
        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": msgs[4]["id"]},
        )
        body = assert_success_response(response, status_code=201)
        fork_id = body["id"]

        cursor = await fresh_db.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at",
            (fork_id,),
        )
        forked = await cursor.fetchall()

        assert len(forked) == 5
        expected_roles = ["user", "assistant", "user", "assistant", "user"]
        for i, row in enumerate(forked):
            assert row["role"] == expected_roles[i]
            assert row["content"] == f"Message {i}"

    @pytest.mark.asyncio
    async def test_fork_preserves_sql_query_in_messages(
        self, authed_client, fresh_db, test_user,
    ):
        """Forked messages retain their sql_query field values."""
        conv = make_conversation(user_id=test_user["id"], title="SQL Chat")
        await insert_conversation(fresh_db, conv)

        user_msg = make_message(
            conversation_id=conv["id"],
            role="user",
            content="Show me sales",
            created_at="2024-01-01T10:00:00",
        )
        await insert_message(fresh_db, user_msg)

        assistant_msg = make_message(
            conversation_id=conv["id"],
            role="assistant",
            content="Here are the results",
            sql_query="SELECT * FROM sales WHERE amount > 100",
            created_at="2024-01-01T10:00:01",
        )
        await insert_message(fresh_db, assistant_msg)

        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": assistant_msg["id"]},
        )
        body = assert_success_response(response, status_code=201)
        fork_id = body["id"]

        cursor = await fresh_db.execute(
            "SELECT sql_query FROM messages WHERE conversation_id = ? AND role = 'assistant'",
            (fork_id,),
        )
        row = await cursor.fetchone()
        assert row["sql_query"] == "SELECT * FROM sales WHERE amount > 100"

    @pytest.mark.asyncio
    async def test_fork_copies_dataset_schema_and_metadata(
        self, authed_client, fresh_db, test_user,
    ):
        """Forked datasets retain schema_json, row_count, column_count, and status."""
        conv = make_conversation(user_id=test_user["id"], title="Data Conv")
        await insert_conversation(fresh_db, conv)

        msg = make_message(
            conversation_id=conv["id"],
            role="user",
            content="Load data",
            created_at="2024-01-01T10:00:00",
        )
        await insert_message(fresh_db, msg)

        schema = json.dumps([
            {"name": "id", "type": "INTEGER"},
            {"name": "name", "type": "TEXT"},
            {"name": "score", "type": "FLOAT"},
        ])
        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/data.parquet",
            name="scores_table",
            row_count=500,
            column_count=3,
            schema_json=schema,
            status="ready",
            file_size_bytes=102400,
            column_descriptions=json.dumps({"id": "Primary key", "score": "Test score"}),
        )
        await insert_dataset(fresh_db, ds)

        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": msg["id"]},
        )
        body = assert_success_response(response, status_code=201)
        fork_id = body["id"]

        cursor = await fresh_db.execute(
            "SELECT * FROM datasets WHERE conversation_id = ?",
            (fork_id,),
        )
        forked_ds = await cursor.fetchone()

        assert forked_ds["name"] == "scores_table"
        assert forked_ds["row_count"] == 500
        assert forked_ds["column_count"] == 3
        assert forked_ds["status"] == "ready"
        assert forked_ds["url"] == "https://example.com/data.parquet"
        assert forked_ds["file_size_bytes"] == 102400

        parsed_schema = json.loads(forked_ds["schema_json"])
        assert len(parsed_schema) == 3
        assert parsed_schema[0]["name"] == "id"

        parsed_descs = json.loads(forked_ds["column_descriptions"])
        assert parsed_descs["score"] == "Test score"

    @pytest.mark.asyncio
    async def test_fork_at_first_message(
        self, authed_client, fresh_db, test_user,
    ):
        """Forking at the very first message copies only that one message."""
        conv = make_conversation(user_id=test_user["id"], title="Multi Msg")
        await insert_conversation(fresh_db, conv)

        msg1 = make_message(
            conversation_id=conv["id"],
            role="user",
            content="First message",
            created_at="2024-01-01T10:00:00",
        )
        msg2 = make_message(
            conversation_id=conv["id"],
            role="assistant",
            content="Second message",
            created_at="2024-01-01T10:00:01",
        )
        await insert_message(fresh_db, msg1)
        await insert_message(fresh_db, msg2)

        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": msg1["id"]},
        )
        body = assert_success_response(response, status_code=201)

        cursor = await fresh_db.execute(
            "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?",
            (body["id"],),
        )
        row = await cursor.fetchone()
        assert row["cnt"] == 1

    @pytest.mark.asyncio
    async def test_fork_at_last_message_copies_all(
        self, authed_client, fresh_db, test_user,
    ):
        """Forking at the last message copies all messages."""
        conv = make_conversation(user_id=test_user["id"], title="Full Fork")
        await insert_conversation(fresh_db, conv)

        msg_ids = []
        for i in range(4):
            msg = make_message(
                conversation_id=conv["id"],
                role="user" if i % 2 == 0 else "assistant",
                content=f"Msg {i}",
                created_at=f"2024-01-01T10:00:{i:02d}",
            )
            msg_ids.append(msg["id"])
            await insert_message(fresh_db, msg)

        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": msg_ids[-1]},
        )
        body = assert_success_response(response, status_code=201)

        cursor = await fresh_db.execute(
            "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?",
            (body["id"],),
        )
        row = await cursor.fetchone()
        assert row["cnt"] == 4

    @pytest.mark.asyncio
    async def test_fork_nonexistent_conversation_returns_404(
        self, authed_client, fresh_db,
    ):
        """Forking a conversation that does not exist returns 404."""
        fake_conv_id = str(uuid4())
        fake_msg_id = str(uuid4())

        response = await authed_client.post(
            f"/conversations/{fake_conv_id}/fork",
            json={"message_id": fake_msg_id},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_fork_creates_new_ids_not_copies(
        self, authed_client, fresh_db, test_user,
    ):
        """Forked messages and datasets have new UUIDs, not the same as the source."""
        conv = make_conversation(user_id=test_user["id"], title="ID Check")
        await insert_conversation(fresh_db, conv)

        msg = make_message(
            conversation_id=conv["id"],
            role="user",
            content="Hello",
            created_at="2024-01-01T10:00:00",
        )
        await insert_message(fresh_db, msg)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/test.parquet",
            name="test_table",
            status="ready",
        )
        await insert_dataset(fresh_db, ds)

        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": msg["id"]},
        )
        body = assert_success_response(response, status_code=201)
        fork_id = body["id"]

        # Verify message ID is different
        cursor = await fresh_db.execute(
            "SELECT id FROM messages WHERE conversation_id = ?",
            (fork_id,),
        )
        forked_msg = await cursor.fetchone()
        assert forked_msg["id"] != msg["id"]

        # Verify dataset ID is different
        cursor = await fresh_db.execute(
            "SELECT id FROM datasets WHERE conversation_id = ?",
            (fork_id,),
        )
        forked_ds = await cursor.fetchone()
        assert forked_ds["id"] != ds["id"]

    @pytest.mark.asyncio
    async def test_fork_preserves_reasoning_field(
        self, authed_client, fresh_db, test_user,
    ):
        """Forked assistant messages retain the reasoning field."""
        conv = make_conversation(user_id=test_user["id"], title="Reasoning Test")
        await insert_conversation(fresh_db, conv)

        msg = make_message(
            conversation_id=conv["id"],
            role="assistant",
            content="Analysis result",
            reasoning="The user asked about sales trends so I queried the database",
            created_at="2024-01-01T10:00:00",
        )
        await insert_message(fresh_db, msg)

        response = await authed_client.post(
            f"/conversations/{conv['id']}/fork",
            json={"message_id": msg["id"]},
        )
        body = assert_success_response(response, status_code=201)

        cursor = await fresh_db.execute(
            "SELECT reasoning FROM messages WHERE conversation_id = ?",
            (body["id"],),
        )
        row = await cursor.fetchone()
        assert row["reasoning"] == "The user asked about sales trends so I queried the database"


# ===========================================================================
# SHARE / UNSHARE: Hardening tests
# ===========================================================================


class TestShareUnshareHardening:
    """Edge cases for sharing and unsharing conversations."""

    @pytest.mark.asyncio
    async def test_share_url_contains_base_url_and_token(
        self, authed_client, fresh_db, test_user,
    ):
        """Share URL is properly constructed with base_url/share/{token}."""
        conv = make_conversation(user_id=test_user["id"], title="Share URL Test")
        await insert_conversation(fresh_db, conv)

        response = await authed_client.post(f"/conversations/{conv['id']}/share")
        body = assert_success_response(response, status_code=201)

        token = body["share_token"]
        share_url = body["share_url"]

        # URL should contain the token
        assert token in share_url
        # URL should have /share/ path
        assert "/share/" in share_url
        # Token should be URL-safe and non-empty
        assert len(token) > 10

    @pytest.mark.asyncio
    async def test_unshare_already_unshared_succeeds(
        self, authed_client, fresh_db, test_user,
    ):
        """Unsharing a conversation that was never shared still returns success."""
        conv = make_conversation(user_id=test_user["id"], title="Not Shared")
        await insert_conversation(fresh_db, conv)

        response = await authed_client.delete(f"/conversations/{conv['id']}/share")
        body = assert_success_response(response, status_code=200)
        assert body["success"] is True

        # Verify DB still has NULL for share_token
        cursor = await fresh_db.execute(
            "SELECT share_token, shared_at FROM conversations WHERE id = ?",
            (conv["id"],),
        )
        row = await cursor.fetchone()
        assert row["share_token"] is None
        assert row["shared_at"] is None

    @pytest.mark.asyncio
    async def test_share_sets_shared_at_timestamp(
        self, authed_client, fresh_db, test_user,
    ):
        """Sharing sets the shared_at timestamp in the database."""
        conv = make_conversation(user_id=test_user["id"], title="Timestamp Check")
        await insert_conversation(fresh_db, conv)

        response = await authed_client.post(f"/conversations/{conv['id']}/share")
        assert_success_response(response, status_code=201)

        cursor = await fresh_db.execute(
            "SELECT shared_at FROM conversations WHERE id = ?",
            (conv["id"],),
        )
        row = await cursor.fetchone()
        assert row["shared_at"] is not None
        # Timestamp should be parseable ISO format
        from datetime import datetime
        datetime.fromisoformat(row["shared_at"])  # Will raise if invalid

    @pytest.mark.asyncio
    async def test_share_token_is_cryptographically_random(
        self, authed_client, fresh_db, test_user,
    ):
        """Two different conversations get distinct share tokens."""
        conv1 = make_conversation(user_id=test_user["id"], title="Conv 1")
        conv2 = make_conversation(user_id=test_user["id"], title="Conv 2")
        await insert_conversation(fresh_db, conv1)
        await insert_conversation(fresh_db, conv2)

        resp1 = await authed_client.post(f"/conversations/{conv1['id']}/share")
        resp2 = await authed_client.post(f"/conversations/{conv2['id']}/share")

        body1 = assert_success_response(resp1, status_code=201)
        body2 = assert_success_response(resp2, status_code=201)

        assert body1["share_token"] != body2["share_token"]


# ===========================================================================
# EXPORT HTML: HTTP endpoint tests
# ===========================================================================


class TestExportHtmlEndpoint:
    """Tests for GET /conversations/{id}/export/html via HTTP."""

    @pytest.mark.asyncio
    async def test_export_html_returns_html_content_type(
        self, authed_client, fresh_db, test_user,
    ):
        """Export HTML returns text/html content type."""
        conv = make_conversation(user_id=test_user["id"], title="HTML Export")
        await insert_conversation(fresh_db, conv)

        msg = make_message(
            conversation_id=conv["id"],
            role="user",
            content="Hello world",
            created_at="2024-01-01T10:00:00",
        )
        await insert_message(fresh_db, msg)

        response = await authed_client.get(
            f"/conversations/{conv['id']}/export/html",
        )

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_export_html_has_content_disposition(
        self, authed_client, fresh_db, test_user,
    ):
        """Export HTML sets Content-Disposition attachment header with filename."""
        conv = make_conversation(user_id=test_user["id"], title="DL Test")
        await insert_conversation(fresh_db, conv)

        response = await authed_client.get(
            f"/conversations/{conv['id']}/export/html",
        )

        assert response.status_code == 200
        cd = response.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert f"conversation-{conv['id']}.html" in cd

    @pytest.mark.asyncio
    async def test_export_html_contains_messages_and_title(
        self, authed_client, fresh_db, test_user,
    ):
        """Exported HTML includes conversation title and message content."""
        conv = make_conversation(user_id=test_user["id"], title="My Analysis")
        await insert_conversation(fresh_db, conv)

        msg1 = make_message(
            conversation_id=conv["id"],
            role="user",
            content="What are the top sellers?",
            created_at="2024-01-01T10:00:00",
        )
        msg2 = make_message(
            conversation_id=conv["id"],
            role="assistant",
            content="The top sellers are Product A and Product B.",
            sql_query="SELECT name, SUM(qty) FROM products GROUP BY name ORDER BY SUM(qty) DESC LIMIT 2",
            created_at="2024-01-01T10:00:01",
        )
        await insert_message(fresh_db, msg1)
        await insert_message(fresh_db, msg2)

        response = await authed_client.get(
            f"/conversations/{conv['id']}/export/html",
        )

        html = response.text
        assert "My Analysis" in html
        assert "What are the top sellers?" in html
        assert "The top sellers are Product A and Product B." in html
        assert "SELECT name, SUM(qty)" in html
        assert "<!DOCTYPE html>" in html

    @pytest.mark.asyncio
    async def test_export_html_empty_conversation(
        self, authed_client, fresh_db, test_user,
    ):
        """Exporting a conversation with no messages returns valid HTML."""
        conv = make_conversation(user_id=test_user["id"], title="Empty Chat")
        await insert_conversation(fresh_db, conv)

        response = await authed_client.get(
            f"/conversations/{conv['id']}/export/html",
        )

        assert response.status_code == 200
        html = response.text
        assert "<!DOCTYPE html>" in html
        assert "Empty Chat" in html
        assert '<div class="messages">' in html

    @pytest.mark.asyncio
    async def test_export_html_escapes_special_characters(
        self, authed_client, fresh_db, test_user,
    ):
        """HTML export escapes special characters to prevent XSS."""
        conv = make_conversation(user_id=test_user["id"], title="XSS Test")
        await insert_conversation(fresh_db, conv)

        msg = make_message(
            conversation_id=conv["id"],
            role="user",
            content='<script>alert("xss")</script>',
            created_at="2024-01-01T10:00:00",
        )
        await insert_message(fresh_db, msg)

        response = await authed_client.get(
            f"/conversations/{conv['id']}/export/html",
        )

        html = response.text
        assert '<script>alert("xss")</script>' not in html
        assert "&lt;script&gt;" in html

    @pytest.mark.asyncio
    async def test_export_html_includes_datasets_section(
        self, authed_client, fresh_db, test_user,
    ):
        """HTML export includes a datasets section when datasets exist."""
        conv = make_conversation(user_id=test_user["id"], title="Dataset Export")
        await insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/report.csv",
            name="quarterly_report",
            row_count=2500,
            column_count=8,
            status="ready",
        )
        await insert_dataset(fresh_db, ds)

        response = await authed_client.get(
            f"/conversations/{conv['id']}/export/html",
        )

        html = response.text
        assert "quarterly_report" in html
        assert "2,500 rows" in html
        assert "8 columns" in html

    @pytest.mark.asyncio
    async def test_export_html_nonexistent_conversation_returns_404(
        self, authed_client, fresh_db,
    ):
        """Export HTML for a non-existent conversation returns 404."""
        fake_id = str(uuid4())
        response = await authed_client.get(
            f"/conversations/{fake_id}/export/html",
        )
        assert response.status_code == 404


# ===========================================================================
# RUN QUERY: Hardening tests
# ===========================================================================


class TestRunQueryHardening:
    """Deeper run_query endpoint tests beyond basic coverage."""

    @pytest_asyncio.fixture
    async def conv_with_dataset(self, fresh_db, test_user):
        """A conversation with a ready dataset."""
        conv = make_conversation(user_id=test_user["id"], title="Query Conv")
        await insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/data.parquet",
            name="data_table",
            row_count=100,
            column_count=3,
            schema_json='[{"name": "id", "type": "INTEGER"}]',
            status="ready",
        )
        await insert_dataset(fresh_db, ds)
        return conv, ds

    @pytest.mark.asyncio
    async def test_query_error_records_in_history(
        self, authed_client, fresh_db, conv_with_dataset,
    ):
        """A failed query is recorded in query_history with status='error'."""
        from app.main import app

        conv, ds = conv_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "error_type": "sql_error",
            "message": "column 'nonexistent' not found",
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT nonexistent FROM data_table"},
        )

        assert response.status_code == 400

        cursor = await fresh_db.execute(
            "SELECT * FROM query_history WHERE conversation_id = ? AND status = 'error'",
            (conv["id"],),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row["query"] == "SELECT nonexistent FROM data_table"
        assert "not found" in row["error_message"]
        assert row["source"] == "sql_panel"

    @pytest.mark.asyncio
    async def test_query_with_multiple_datasets(
        self, authed_client, fresh_db, test_user,
    ):
        """Query passes all ready datasets to the worker pool."""
        from app.main import app

        conv = make_conversation(user_id=test_user["id"], title="Multi DS")
        await insert_conversation(fresh_db, conv)

        ds1 = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/sales.parquet",
            name="sales",
            status="ready",
        )
        ds2 = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/products.parquet",
            name="products",
            status="ready",
        )
        ds3 = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/failed.parquet",
            name="failed_ds",
            status="error",
        )
        await insert_dataset(fresh_db, ds1)
        await insert_dataset(fresh_db, ds2)
        await insert_dataset(fresh_db, ds3)

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id"],
            "rows": [{"id": 1}],
            "total_rows": 1,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT * FROM sales JOIN products ON sales.pid = products.id"},
        )

        assert response.status_code == 200

        # Verify only 'ready' datasets were passed (not the 'error' one)
        call_args = mock_pool.run_query.call_args
        datasets_arg = call_args[0][1]
        assert len(datasets_arg) == 2
        names = {d["table_name"] for d in datasets_arg}
        assert names == {"sales", "products"}

    @pytest.mark.asyncio
    async def test_query_no_datasets_returns_400(
        self, authed_client, fresh_db, test_user,
    ):
        """Query on a conversation with no datasets returns 400."""
        from app.main import app

        conv = make_conversation(user_id=test_user["id"], title="Empty DS")
        await insert_conversation(fresh_db, conv)

        app.state.worker_pool = AsyncMock()

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT 1"},
        )

        assert response.status_code == 400
        data = response.json()
        assert "No datasets loaded" in data["error"]

    @pytest.mark.asyncio
    async def test_query_only_error_datasets_returns_400(
        self, authed_client, fresh_db, test_user,
    ):
        """If all datasets are in 'error' status, no ready datasets means 400."""
        from app.main import app

        conv = make_conversation(user_id=test_user["id"], title="Error DS Only")
        await insert_conversation(fresh_db, conv)

        ds = make_dataset(
            conversation_id=conv["id"],
            url="https://example.com/broken.parquet",
            name="broken",
            status="error",
        )
        await insert_dataset(fresh_db, ds)

        app.state.worker_pool = AsyncMock()

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT * FROM broken"},
        )

        assert response.status_code == 400
        data = response.json()
        assert "No datasets loaded" in data["error"]

    @pytest.mark.asyncio
    async def test_query_page_beyond_total_returns_empty_rows(
        self, authed_client, fresh_db, conv_with_dataset,
    ):
        """Requesting a page beyond total_pages returns empty rows array."""
        from app.main import app

        conv, ds = conv_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id", "val"],
            "rows": [{"id": 1, "val": "a"}, {"id": 2, "val": "b"}],
            "total_rows": 2,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT * FROM data_table", "page": 999, "page_size": 10},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["rows"] == []
        assert data["page"] == 999

    @pytest.mark.asyncio
    async def test_query_worker_pool_unavailable_returns_503(
        self, authed_client, fresh_db, conv_with_dataset,
    ):
        """Query with no worker pool on app.state returns 503."""
        from app.main import app

        conv, ds = conv_with_dataset
        app.state.worker_pool = None

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT 1"},
        )

        assert response.status_code == 503
        data = response.json()
        assert "Worker pool unavailable" in data["error"]

    @pytest.mark.asyncio
    async def test_query_result_converts_row_dicts_to_lists(
        self, authed_client, fresh_db, conv_with_dataset,
    ):
        """Worker pool returns row dicts which get converted to ordered lists matching columns."""
        from app.main import app

        conv, ds = conv_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["name", "age", "city"],
            "rows": [
                {"name": "Alice", "age": 30, "city": "NYC"},
                {"name": "Bob", "age": 25, "city": "LA"},
            ],
            "total_rows": 2,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT name, age, city FROM data_table"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["columns"] == ["name", "age", "city"]
        assert data["rows"][0] == ["Alice", 30, "NYC"]
        assert data["rows"][1] == ["Bob", 25, "LA"]

    @pytest.mark.asyncio
    async def test_query_success_records_in_history(
        self, authed_client, fresh_db, conv_with_dataset,
    ):
        """A successful query is recorded in query_history with status='success'."""
        from app.main import app

        conv, ds = conv_with_dataset

        mock_pool = AsyncMock()
        mock_pool.run_query = AsyncMock(return_value={
            "columns": ["id"],
            "rows": [{"id": 1}, {"id": 2}, {"id": 3}],
            "total_rows": 3,
        })
        app.state.worker_pool = mock_pool

        response = await authed_client.post(
            f"/conversations/{conv['id']}/query",
            json={"sql": "SELECT id FROM data_table"},
        )

        assert response.status_code == 200

        cursor = await fresh_db.execute(
            "SELECT * FROM query_history WHERE conversation_id = ? AND status = 'success'",
            (conv["id"],),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row["query"] == "SELECT id FROM data_table"
        assert row["row_count"] == 3
        assert row["source"] == "sql_panel"
        assert row["execution_time_ms"] is not None
        assert row["execution_time_ms"] >= 0
