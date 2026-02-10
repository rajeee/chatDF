"""Conversations router -- CRUD for conversations plus chat endpoints.

Implements: spec/backend/rest_api/plan.md#routersconversationspy

Endpoints:
- POST /conversations                          -> create_conversation
- GET /conversations                           -> list_conversations
- POST /conversations/bulk-delete              -> bulk_delete_conversations
- POST /conversations/bulk-pin                 -> bulk_pin_conversations
- GET /conversations/{conversation_id}         -> get_conversation_detail
- GET /conversations/{conversation_id}/export       -> export_conversation
- GET /conversations/{conversation_id}/export/html  -> export_conversation_html
- PATCH /conversations/{conversation_id}       -> rename_conversation
- DELETE /conversations/{conversation_id}      -> delete_conversation
- DELETE /conversations                        -> clear_all_conversations
- POST /conversations/{conversation_id}/messages -> send_message
- DELETE /conversations/{conversation_id}/messages/{message_id} -> delete_message
- POST /conversations/{conversation_id}/stop     -> stop_generation
- GET  /conversations/{conversation_id}/token-usage -> get_token_usage
- POST /conversations/{conversation_id}/fork      -> fork_conversation
"""

from __future__ import annotations

import asyncio
import html as html_module
import json
import logging
import math
import secrets
from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.dependencies import get_conversation, get_current_user, get_db
from app.models import (
    ClearAllResponse,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
    DatasetResponse,
    ExplainSqlRequest,
    ExplainSqlResponse,
    ForkConversationRequest,
    GenerateSqlRequest,
    GenerateSqlResponse,
    MessageAckResponse,
    MessageResponse,
    PinConversationRequest,
    PromptPreviewRequest,
    PromptPreviewResponse,
    PublicConversationResponse,
    RenameConversationRequest,
    RunQueryRequest,
    RunQueryResponse,
    SearchResponse,
    SearchResult,
    SendMessageRequest,
    ShareConversationResponse,
    SuccessResponse,
)
from app.services import chat_service
from app.services import dataset_service, llm_service

router = APIRouter()
public_router = APIRouter()


# ---------------------------------------------------------------------------
# POST /conversations
# Implements: spec/backend/rest_api/spec.md#post-conversations
# ---------------------------------------------------------------------------


@router.post("", status_code=201, response_model=ConversationResponse)
async def create_conversation(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> ConversationResponse:
    """Create a new empty conversation for the authenticated user."""
    conv_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, user["id"], "", now, now),
    )
    await db.commit()

    return ConversationResponse(
        id=conv_id,
        title="",
        created_at=datetime.fromisoformat(now),
    )


# ---------------------------------------------------------------------------
# POST /conversations/import
# Import a previously exported conversation from JSON
# ---------------------------------------------------------------------------


@router.post("/import", status_code=201)
async def import_conversation(
    body: dict,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Import a previously exported conversation from JSON.

    Accepts the same format produced by the frontend JSON export feature.
    Creates a new conversation with all messages and datasets preserved.
    """
    # --- Validate top-level fields ---
    title = body.get("title", "")
    if not isinstance(title, str):
        raise HTTPException(status_code=400, detail="title must be a string")
    title = title[:100]

    messages = body.get("messages")
    if messages is None:
        messages = []
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="messages must be an array")
    if len(messages) > 1000:
        raise HTTPException(status_code=400, detail="messages array exceeds maximum of 1000 items")

    datasets = body.get("datasets")
    if datasets is None:
        datasets = []
    if not isinstance(datasets, list):
        raise HTTPException(status_code=400, detail="datasets must be an array")
    if len(datasets) > 50:
        raise HTTPException(status_code=400, detail="datasets array exceeds maximum of 50 items")

    # --- Validate individual messages ---
    for i, msg in enumerate(messages):
        if not isinstance(msg, dict):
            raise HTTPException(status_code=400, detail=f"messages[{i}] must be an object")
        role = msg.get("role")
        if role not in ("user", "assistant"):
            raise HTTPException(
                status_code=400,
                detail=f"messages[{i}].role must be 'user' or 'assistant'",
            )
        content = msg.get("content")
        if not isinstance(content, str):
            raise HTTPException(
                status_code=400,
                detail=f"messages[{i}].content must be a string",
            )

    # --- Validate individual datasets ---
    for i, ds in enumerate(datasets):
        if not isinstance(ds, dict):
            raise HTTPException(status_code=400, detail=f"datasets[{i}] must be an object")
        url = ds.get("url")
        if not url or not isinstance(url, str):
            raise HTTPException(
                status_code=400,
                detail=f"datasets[{i}].url is required and must be a string",
            )

    # --- Create conversation ---
    conv_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, user["id"], title, now, now),
    )

    # --- Insert messages preserving order ---
    for i, msg in enumerate(messages):
        msg_id = str(uuid4())
        # Use provided timestamp or generate one with offset to preserve order
        created_at = msg.get("timestamp") or msg.get("created_at") or now
        if not isinstance(created_at, str):
            created_at = now

        await db.execute(
            "INSERT INTO messages (id, conversation_id, role, content, sql_query, reasoning, token_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                msg_id,
                conv_id,
                msg["role"],
                msg["content"],
                msg.get("sql_query"),
                msg.get("reasoning"),
                0,
                created_at,
            ),
        )

    # --- Insert datasets ---
    for ds in datasets:
        ds_id = str(uuid4())
        await db.execute(
            "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, loaded_at, file_size_bytes, column_descriptions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                ds_id,
                conv_id,
                ds["url"],
                ds.get("name", ""),
                ds.get("row_count", 0),
                ds.get("column_count", 0),
                ds.get("schema_json", "[]"),
                "ready",
                now,
                ds.get("file_size_bytes"),
                ds.get("column_descriptions", "{}"),
            ),
        )

    await db.commit()

    return {
        "id": conv_id,
        "title": title,
    }


# ---------------------------------------------------------------------------
# GET /conversations
# Implements: spec/backend/rest_api/spec.md#get-conversations
# ---------------------------------------------------------------------------


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> ConversationListResponse:
    """List all conversations for the authenticated user, sorted by updated_at desc."""
    cursor = await db.execute(
        "SELECT c.id, c.title, c.created_at, c.updated_at, c.is_pinned, "
        "  COALESCE(d_cnt.cnt, 0) AS dataset_count, "
        "  COALESCE(m_cnt.cnt, 0) AS message_count, "
        "  ("
        "    SELECT SUBSTR(m2.content, 1, 100) FROM messages m2 "
        "    WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1"
        "  ) AS last_message_preview "
        "FROM conversations c "
        "LEFT JOIN ("
        "  SELECT conversation_id, COUNT(*) AS cnt "
        "  FROM datasets GROUP BY conversation_id"
        ") d_cnt ON d_cnt.conversation_id = c.id "
        "LEFT JOIN ("
        "  SELECT conversation_id, COUNT(*) AS cnt "
        "  FROM messages GROUP BY conversation_id"
        ") m_cnt ON m_cnt.conversation_id = c.id "
        "WHERE c.user_id = ? "
        "ORDER BY c.is_pinned DESC, c.updated_at DESC",
        (user["id"],),
    )
    rows = await cursor.fetchall()

    conversations = [
        ConversationSummary(
            id=row["id"],
            title=row["title"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            dataset_count=row["dataset_count"],
            message_count=row["message_count"],
            last_message_preview=row["last_message_preview"],
            is_pinned=bool(row["is_pinned"]),
        )
        for row in rows
    ]

    return ConversationListResponse(conversations=conversations)


# ---------------------------------------------------------------------------
# GET /conversations/search
# Global search across all conversations by message content
# ---------------------------------------------------------------------------


@router.get("/search", response_model=SearchResponse)
async def search_conversations(
    q: str,
    limit: int = 20,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> SearchResponse:
    """Search across all conversations owned by the authenticated user.

    Searches message content (case-insensitive) and returns matching messages
    with a snippet of context around the match.
    """
    # Validate query parameter
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required")

    # Validate and cap limit
    if limit < 1:
        limit = 20
    elif limit > 50:
        limit = 50

    # Search messages across all user's conversations
    search_pattern = f"%{q}%"
    cursor = await db.execute(
        "SELECT m.id AS message_id, m.role, m.content, m.created_at, "
        "       c.id AS conversation_id, c.title "
        "FROM messages m "
        "JOIN conversations c ON m.conversation_id = c.id "
        "WHERE c.user_id = ? AND m.content LIKE ? "
        "ORDER BY m.created_at DESC "
        "LIMIT ?",
        (user["id"], search_pattern, limit),
    )
    rows = await cursor.fetchall()

    results = []
    for row in rows:
        content = row["content"]
        # Find the first match position (case-insensitive)
        lower_content = content.lower()
        lower_query = q.lower()
        match_pos = lower_content.find(lower_query)

        # Extract ~100 chars around the match
        snippet_start = max(0, match_pos - 50)
        snippet_end = min(len(content), match_pos + len(q) + 50)
        snippet = content[snippet_start:snippet_end]

        # Add ellipsis if we truncated
        if snippet_start > 0:
            snippet = "..." + snippet
        if snippet_end < len(content):
            snippet = snippet + "..."

        results.append(
            SearchResult(
                conversation_id=row["conversation_id"],
                conversation_title=row["title"],
                message_id=row["message_id"],
                message_role=row["role"],
                snippet=snippet,
                created_at=datetime.fromisoformat(row["created_at"]),
            )
        )

    return SearchResponse(results=results, total=len(results))


# ---------------------------------------------------------------------------
# POST /conversations/bulk-delete
# Delete multiple conversations at once
# ---------------------------------------------------------------------------


@router.post("/bulk-delete")
async def bulk_delete_conversations(
    body: dict,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Delete multiple conversations at once."""
    ids = body.get("ids", [])
    if not ids or len(ids) > 50:
        raise HTTPException(400, "Provide 1-50 conversation IDs")
    deleted = 0
    for cid in ids:
        # Verify ownership
        row = await db.execute(
            "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
            (cid, user["id"]),
        )
        if await row.fetchone():
            await db.execute("DELETE FROM conversations WHERE id = ?", (cid,))
            deleted += 1
    await db.commit()
    return {"deleted": deleted}


# ---------------------------------------------------------------------------
# POST /conversations/bulk-pin
# Pin or unpin multiple conversations at once
# ---------------------------------------------------------------------------


@router.post("/bulk-pin")
async def bulk_pin_conversations(
    body: dict,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Pin or unpin multiple conversations at once."""
    ids = body.get("ids", [])
    is_pinned = body.get("is_pinned", True)
    if not ids or len(ids) > 50:
        raise HTTPException(400, "Provide 1-50 conversation IDs")
    updated = 0
    for cid in ids:
        row = await db.execute(
            "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
            (cid, user["id"]),
        )
        if await row.fetchone():
            await db.execute(
                "UPDATE conversations SET is_pinned = ? WHERE id = ?",
                (1 if is_pinned else 0, cid),
            )
            updated += 1
    await db.commit()
    return {"updated": updated}


# ---------------------------------------------------------------------------
# GET /conversations/{conversation_id}
# Implements: spec/backend/rest_api/spec.md#get-conversationsid
# ---------------------------------------------------------------------------


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_detail(
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> ConversationDetailResponse:
    """Get conversation details including messages and datasets."""
    conv_id = conversation["id"]

    # Fetch messages
    cursor = await db.execute(
        "SELECT id, role, content, sql_query, reasoning, input_tokens, output_tokens, "
        "tool_call_trace, created_at "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conv_id,),
    )
    message_rows = await cursor.fetchall()
    messages = [
        MessageResponse(
            id=row["id"],
            role=row["role"],
            content=row["content"],
            sql_query=row["sql_query"],
            reasoning=row["reasoning"],
            input_tokens=row["input_tokens"] or 0,
            output_tokens=row["output_tokens"] or 0,
            tool_call_trace=row["tool_call_trace"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )
        for row in message_rows
    ]

    # Fetch datasets
    cursor = await db.execute(
        "SELECT id, name, url, row_count, column_count, status, schema_json, file_size_bytes, column_descriptions "
        "FROM datasets WHERE conversation_id = ?",
        (conv_id,),
    )
    dataset_rows = await cursor.fetchall()
    datasets = [
        DatasetResponse(
            id=row["id"],
            name=row["name"],
            url=row["url"],
            row_count=row["row_count"],
            column_count=row["column_count"],
            status=row["status"] or "ready",
            schema_json=row["schema_json"] or "{}",
            file_size_bytes=row["file_size_bytes"],
            column_descriptions=row["column_descriptions"] or "{}",
        )
        for row in dataset_rows
    ]

    return ConversationDetailResponse(
        id=conversation["id"],
        title=conversation["title"],
        created_at=datetime.fromisoformat(conversation["created_at"]),
        updated_at=datetime.fromisoformat(conversation["updated_at"]),
        messages=messages,
        datasets=datasets,
    )


# ---------------------------------------------------------------------------
# GET /conversations/{conversation_id}/export
# Download conversation as JSON file
# ---------------------------------------------------------------------------


@router.get("/{conversation_id}/export")
async def export_conversation(
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> StreamingResponse:
    """Export a conversation as a downloadable JSON file.

    Includes conversation metadata, all messages, and all datasets.
    """
    conv_id = conversation["id"]

    # Fetch messages
    cursor = await db.execute(
        "SELECT role, content, created_at, sql_query "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conv_id,),
    )
    message_rows = await cursor.fetchall()
    messages = [
        {
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"],
            "sql_query": row["sql_query"],
        }
        for row in message_rows
    ]

    # Fetch datasets
    cursor = await db.execute(
        "SELECT name, url, row_count, column_count, schema_json "
        "FROM datasets WHERE conversation_id = ?",
        (conv_id,),
    )
    dataset_rows = await cursor.fetchall()
    datasets = [
        {
            "name": row["name"],
            "url": row["url"],
            "row_count": row["row_count"],
            "column_count": row["column_count"],
            "schema_json": row["schema_json"],
        }
        for row in dataset_rows
    ]

    export_data = {
        "conversation": {
            "id": conv_id,
            "title": conversation["title"],
            "created_at": conversation["created_at"],
        },
        "messages": messages,
        "datasets": datasets,
    }

    json_bytes = json.dumps(export_data, indent=2, default=str).encode("utf-8")

    return StreamingResponse(
        iter([json_bytes]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="conversation-{conv_id}.json"',
        },
    )


# ---------------------------------------------------------------------------
# GET /conversations/{conversation_id}/export/html
# Download conversation as a standalone HTML file
# ---------------------------------------------------------------------------


async def _generate_conversation_html(
    db: aiosqlite.Connection,
    conversation_id: str,
    title: str,
) -> str:
    """Generate a self-contained HTML document for a conversation.

    This is extracted as a helper so it can be tested independently
    without spinning up the full FastAPI application.
    """
    escaped_title = html_module.escape(title or "Untitled Conversation")

    # Fetch messages
    cursor = await db.execute(
        "SELECT role, content, sql_query, created_at "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,),
    )
    message_rows = await cursor.fetchall()

    # Fetch datasets
    cursor = await db.execute(
        "SELECT name, url, row_count, column_count "
        "FROM datasets WHERE conversation_id = ?",
        (conversation_id,),
    )
    dataset_rows = await cursor.fetchall()

    # Build messages HTML
    messages_html_parts: list[str] = []
    for row in message_rows:
        role = row["role"]
        content = html_module.escape(row["content"] or "")
        sql_query = row["sql_query"]
        created_at = row["created_at"] or ""

        # Convert newlines to <br> for display
        content_html = content.replace("\n", "<br>")

        role_class = "user" if role == "user" else "assistant"
        role_label = "You" if role == "user" else "Assistant"

        msg_html = f'<div class="message {role_class}">'
        msg_html += f'<div class="message-header"><span class="role">{role_label}</span>'
        if created_at:
            escaped_ts = html_module.escape(created_at)
            msg_html += f'<span class="timestamp">{escaped_ts}</span>'
        msg_html += "</div>"
        msg_html += f'<div class="message-content">{content_html}</div>'

        if sql_query:
            escaped_sql = html_module.escape(sql_query)
            msg_html += f'<div class="sql-block"><div class="sql-label">SQL Query</div><pre><code>{escaped_sql}</code></pre></div>'

        msg_html += "</div>"
        messages_html_parts.append(msg_html)

    messages_html = "\n".join(messages_html_parts)

    # Build datasets HTML
    datasets_html = ""
    if dataset_rows:
        ds_items: list[str] = []
        for ds in dataset_rows:
            name = html_module.escape(ds["name"] or "Unnamed")
            url = html_module.escape(ds["url"] or "")
            row_count = ds["row_count"] or 0
            col_count = ds["column_count"] or 0
            url_part = ""
            if url:
                url_part = f'<br><span class="dataset-url">{url}</span>'
            ds_items.append(
                f'<div class="dataset-item">'
                f"<strong>{name}</strong>"
                f'<span class="dataset-meta">{row_count:,} rows, {col_count} columns</span>'
                f"{url_part}"
                f"</div>"
            )
        datasets_html = (
            '<div class="datasets-section">'
            "<h2>Datasets</h2>"
            + "\n".join(ds_items)
            + "</div>"
        )

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escaped_title} - ChatDF Export</title>
<style>
  :root {{
    --bg: #ffffff;
    --surface: #f8f9fa;
    --text: #1a1a1a;
    --text-secondary: #6b7280;
    --border: #e5e7eb;
    --user-bg: #3b82f6;
    --user-text: #ffffff;
    --assistant-bg: #f3f4f6;
    --assistant-text: #1a1a1a;
    --sql-bg: #f8f5f0;
    --sql-border: #e8e0d4;
    --sql-label: #8b7355;
    --accent: #3b82f6;
  }}

  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #111827;
      --surface: #1f2937;
      --text: #f3f4f6;
      --text-secondary: #9ca3af;
      --border: #374151;
      --user-bg: #2563eb;
      --user-text: #ffffff;
      --assistant-bg: #1f2937;
      --assistant-text: #f3f4f6;
      --sql-bg: #1e2330;
      --sql-border: #2d3748;
      --sql-label: #a0aec0;
      --accent: #60a5fa;
    }}
  }}

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background-color: var(--bg);
    color: var(--text);
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }}

  h1 {{
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--text);
  }}

  .export-meta {{
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }}

  .datasets-section {{
    margin-bottom: 2rem;
    padding: 1rem;
    background: var(--surface);
    border-radius: 8px;
    border: 1px solid var(--border);
  }}

  .datasets-section h2 {{
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }}

  .dataset-item {{
    padding: 0.5rem 0;
    font-size: 0.85rem;
  }}

  .dataset-item + .dataset-item {{
    border-top: 1px solid var(--border);
  }}

  .dataset-meta {{
    color: var(--text-secondary);
    margin-left: 0.5rem;
    font-size: 0.8rem;
  }}

  .dataset-url {{
    color: var(--text-secondary);
    font-size: 0.75rem;
    word-break: break-all;
  }}

  .messages {{
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }}

  .message {{
    display: flex;
    flex-direction: column;
    max-width: 85%;
  }}

  .message.user {{
    align-self: flex-end;
  }}

  .message.assistant {{
    align-self: flex-start;
  }}

  .message-header {{
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
  }}

  .message.user .message-header {{
    justify-content: flex-end;
  }}

  .role {{
    font-weight: 600;
    color: var(--text-secondary);
  }}

  .timestamp {{
    color: var(--text-secondary);
    font-size: 0.7rem;
  }}

  .message-content {{
    padding: 0.75rem 1rem;
    border-radius: 12px;
    font-size: 0.9rem;
    word-wrap: break-word;
  }}

  .message.user .message-content {{
    background-color: var(--user-bg);
    color: var(--user-text);
    border-bottom-right-radius: 4px;
  }}

  .message.assistant .message-content {{
    background-color: var(--assistant-bg);
    color: var(--assistant-text);
    border-bottom-left-radius: 4px;
    border: 1px solid var(--border);
  }}

  .sql-block {{
    margin-top: 0.5rem;
    border: 1px solid var(--sql-border);
    border-radius: 8px;
    overflow: hidden;
  }}

  .sql-label {{
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.75rem;
    background: var(--sql-border);
    color: var(--sql-label);
  }}

  .sql-block pre {{
    margin: 0;
    padding: 0.75rem;
    background: var(--sql-bg);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.5;
  }}

  .sql-block code {{
    font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }}

  .footer {{
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
  }}

  @media print {{
    body {{
      max-width: 100%;
      padding: 1rem;
    }}

    .message {{
      max-width: 100%;
      page-break-inside: avoid;
    }}

    .message.user .message-content {{
      background-color: #e8f0fe !important;
      color: #1a1a1a !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
  }}
</style>
</head>
<body>
  <h1>{escaped_title}</h1>
  <div class="export-meta">Exported from ChatDF</div>

  {datasets_html}

  <div class="messages">
    {messages_html}
  </div>

  <div class="footer">
    Exported from ChatDF
  </div>
</body>
</html>"""

    return html_doc


@router.get("/{conversation_id}/export/html")
async def export_conversation_html(
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> StreamingResponse:
    """Export a conversation as a standalone HTML file.

    Creates a self-contained HTML document with embedded CSS that renders
    the conversation in a clean, printable format with:
    - Conversation title and metadata
    - All messages with role indicators (user/assistant)
    - SQL queries in code blocks
    - Dark/light mode support
    """
    conv_id = conversation["id"]
    title = conversation["title"] or "Untitled Conversation"

    html_content = await _generate_conversation_html(db, conv_id, title)
    html_bytes = html_content.encode("utf-8")

    return StreamingResponse(
        iter([html_bytes]),
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="conversation-{conv_id}.html"',
        },
    )


# ---------------------------------------------------------------------------
# PATCH /conversations/{conversation_id}
# Implements: spec/backend/rest_api/spec.md#patch-conversationsid
# ---------------------------------------------------------------------------


@router.patch("/{conversation_id}")
async def rename_conversation(
    body: RenameConversationRequest,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Rename a conversation."""
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (body.title, now, conversation["id"]),
    )
    await db.commit()

    return {
        "id": conversation["id"],
        "title": body.title,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# PATCH /conversations/{conversation_id}/pin
# ---------------------------------------------------------------------------


@router.patch("/{conversation_id}/pin")
async def pin_conversation(
    body: PinConversationRequest,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Pin or unpin a conversation."""
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "UPDATE conversations SET is_pinned = ?, updated_at = ? WHERE id = ?",
        (int(body.is_pinned), now, conversation["id"]),
    )
    await db.commit()

    return {
        "id": conversation["id"],
        "is_pinned": body.is_pinned,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# DELETE /conversations/{conversation_id}
# Implements: spec/backend/rest_api/spec.md#delete-conversationsid
# ---------------------------------------------------------------------------


@router.delete("/{conversation_id}", response_model=SuccessResponse)
async def delete_conversation(
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> SuccessResponse:
    """Delete a conversation and all associated data (cascade)."""
    await db.execute(
        "DELETE FROM conversations WHERE id = ?",
        (conversation["id"],),
    )
    await db.commit()

    return SuccessResponse(success=True)


# ---------------------------------------------------------------------------
# DELETE /conversations
# Implements: spec/backend/rest_api/spec.md#delete-conversations-1
# ---------------------------------------------------------------------------


@router.delete("", response_model=ClearAllResponse)
async def clear_all_conversations(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> ClearAllResponse:
    """Delete all conversations for the authenticated user."""
    # Count first
    cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM conversations WHERE user_id = ?",
        (user["id"],),
    )
    row = await cursor.fetchone()
    count = row["cnt"]

    # Delete all
    await db.execute(
        "DELETE FROM conversations WHERE user_id = ?",
        (user["id"],),
    )
    await db.commit()

    return ClearAllResponse(success=True, deleted_count=count)


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/messages
# Implements: spec/backend/rest_api/spec.md#post-conversationsidmessages
# ---------------------------------------------------------------------------


_logger = logging.getLogger(__name__)


@router.post("/{conversation_id}/messages", response_model=MessageAckResponse)
async def send_message(
    request: Request,
    body: SendMessageRequest,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> MessageAckResponse:
    """Send a chat message and trigger LLM processing.

    Returns an immediate acknowledgment. The full 14-step orchestration
    runs as a background task, streaming results via WebSocket events.
    """
    conv_id = conversation["id"]

    # Generate a message_id for the acknowledgment response
    msg_id = str(uuid4())

    # Update conversation updated_at
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    await db.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (now, conv_id),
    )
    await db.commit()

    # Get the connection manager for ws_send
    connection_manager = getattr(request.app.state, "connection_manager", None)

    async def ws_send(message: dict) -> None:
        """Send a WebSocket message (already formatted)."""
        if connection_manager is not None:
            await connection_manager.send_to_user(user["id"], message)

    # Get the worker pool
    pool = getattr(request.app.state, "worker_pool", None)

    # Run the full 14-step LLM flow as a background task so the HTTP ack
    # returns immediately.  Results stream back to the client via WebSocket
    # events (chat_token, chat_complete, chat_error).
    async def _background_process() -> None:
        try:
            await chat_service.process_message(
                db=db,
                conversation_id=conv_id,
                user_id=user["id"],
                content=body.content,
                ws_send=ws_send,
                pool=pool,
            )
        except Exception:
            _logger.exception(
                "Background process_message failed for conversation %s", conv_id
            )
            try:
                await ws_send({
                    "type": "chat_error",
                    "conversation_id": conv_id,
                    "error": "An unexpected error occurred while processing your message. Please try again.",
                })
            except Exception:
                _logger.warning("Failed to send chat_error WS event for conversation %s", conv_id)

    asyncio.create_task(_background_process())

    return MessageAckResponse(message_id=msg_id, status="processing")


# ---------------------------------------------------------------------------
# DELETE /conversations/{conversation_id}/messages/{message_id}
# Delete a single message from a conversation
# ---------------------------------------------------------------------------


@router.delete(
    "/{conversation_id}/messages/{message_id}",
    response_model=SuccessResponse,
)
async def delete_message(
    message_id: str,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> SuccessResponse:
    """Delete a single message from a conversation."""
    # Verify the message belongs to this conversation
    cursor = await db.execute(
        "SELECT id FROM messages WHERE id = ? AND conversation_id = ?",
        (message_id, conversation["id"]),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Message not found in this conversation",
        )

    await db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
    await db.commit()

    return SuccessResponse(success=True)


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/stop
# Implements: spec/backend/rest_api/spec.md#post-conversationsidstop
# ---------------------------------------------------------------------------


@router.post("/{conversation_id}/stop", response_model=SuccessResponse)
async def stop_generation(
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> SuccessResponse:
    """Stop in-progress LLM generation for this conversation."""
    chat_service.stop_generation(conversation["id"])
    return SuccessResponse(success=True)


# ---------------------------------------------------------------------------
# GET /conversations/{conversation_id}/token-usage
# ---------------------------------------------------------------------------


@router.get("/{conversation_id}/token-usage")
async def get_token_usage(
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Get aggregated token usage for a conversation."""
    conv_id = conversation["id"]
    cursor = await db.execute(
        "SELECT COALESCE(SUM(input_tokens), 0) AS total_input, "
        "       COALESCE(SUM(output_tokens), 0) AS total_output, "
        "       COALESCE(SUM(cost), 0) AS total_cost, "
        "       COUNT(*) AS request_count "
        "FROM token_usage WHERE conversation_id = ?",
        (conv_id,),
    )
    row = await cursor.fetchone()
    return {
        "total_input_tokens": row["total_input"],
        "total_output_tokens": row["total_output"],
        "total_tokens": row["total_input"] + row["total_output"],
        "total_cost": round(row["total_cost"], 6),
        "request_count": row["request_count"],
    }


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/fork
# ---------------------------------------------------------------------------


@router.post("/{conversation_id}/fork", status_code=201)
async def fork_conversation(
    body: ForkConversationRequest,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Create a new conversation branch from any message in the chat.

    Copies all messages up to and including message_id from the source conversation,
    and copies all datasets from the source conversation.
    """
    conv_id = conversation["id"]

    # Verify message_id belongs to this conversation
    cursor = await db.execute(
        "SELECT id, created_at FROM messages WHERE id = ? AND conversation_id = ?",
        (body.message_id, conv_id),
    )
    message_row = await cursor.fetchone()
    if message_row is None:
        raise HTTPException(
            status_code=404,
            detail="Message not found in this conversation"
        )

    fork_until_timestamp = message_row["created_at"]

    # Create new conversation
    fork_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    fork_title = f"Fork of {conversation['title']}" if conversation["title"] else "Forked conversation"

    await db.execute(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (fork_id, user["id"], fork_title, now, now),
    )

    # Copy messages up to and including message_id (ordered by created_at)
    cursor = await db.execute(
        "SELECT id, role, content, sql_query, reasoning, token_count, created_at "
        "FROM messages WHERE conversation_id = ? AND created_at <= ? "
        "ORDER BY created_at",
        (conv_id, fork_until_timestamp),
    )
    messages_to_copy = await cursor.fetchall()

    for msg in messages_to_copy:
        new_msg_id = str(uuid4())
        await db.execute(
            "INSERT INTO messages (id, conversation_id, role, content, sql_query, reasoning, token_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                new_msg_id,
                fork_id,
                msg["role"],
                msg["content"],
                msg["sql_query"],
                msg["reasoning"],
                msg["token_count"],
                msg["created_at"],
            ),
        )

    # Copy all datasets from source conversation
    cursor = await db.execute(
        "SELECT url, name, row_count, column_count, schema_json, status, error_message, loaded_at, file_size_bytes, column_descriptions "
        "FROM datasets WHERE conversation_id = ?",
        (conv_id,),
    )
    datasets_to_copy = await cursor.fetchall()

    for ds in datasets_to_copy:
        new_ds_id = str(uuid4())
        await db.execute(
            "INSERT INTO datasets (id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at, file_size_bytes, column_descriptions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                new_ds_id,
                fork_id,
                ds["url"],
                ds["name"],
                ds["row_count"],
                ds["column_count"],
                ds["schema_json"],
                ds["status"],
                ds["error_message"],
                ds["loaded_at"],
                ds["file_size_bytes"],
                ds["column_descriptions"] or "{}",
            ),
        )

    await db.commit()

    return {
        "id": fork_id,
        "title": fork_title,
    }


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/share
# ---------------------------------------------------------------------------


@router.post("/{conversation_id}/share", status_code=201, response_model=ShareConversationResponse)
async def share_conversation(
    request: Request,
    conversation_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> ShareConversationResponse:
    """Generate a shareable read-only link for a conversation."""
    # Verify user owns conversation
    cursor = await db.execute(
        "SELECT * FROM conversations WHERE id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = dict(row)
    if conversation["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # If already shared, return existing token
    if conversation.get("share_token"):
        share_url = f"{request.base_url}share/{conversation['share_token']}"
        return ShareConversationResponse(
            share_token=conversation["share_token"],
            share_url=share_url,
        )

    # Generate new share token
    token = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "UPDATE conversations SET share_token = ?, shared_at = ? WHERE id = ?",
        (token, now, conversation_id),
    )
    await db.commit()

    share_url = f"{request.base_url}share/{token}"
    return ShareConversationResponse(
        share_token=token,
        share_url=share_url,
    )


# ---------------------------------------------------------------------------
# DELETE /conversations/{conversation_id}/share
# ---------------------------------------------------------------------------


@router.delete("/{conversation_id}/share")
async def unshare_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Revoke the shareable link for a conversation."""
    # Verify user owns conversation
    cursor = await db.execute(
        "SELECT * FROM conversations WHERE id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = dict(row)
    if conversation["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.execute(
        "UPDATE conversations SET share_token = NULL, shared_at = NULL WHERE id = ?",
        (conversation_id,),
    )
    await db.commit()

    return {"success": True}


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/query
# Execute raw SQL against conversation datasets
# ---------------------------------------------------------------------------


@router.post("/{conversation_id}/query", response_model=RunQueryResponse)
async def run_query(
    request: Request,
    body: RunQueryRequest,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> RunQueryResponse:
    """Execute a SQL query against the conversation's loaded datasets."""
    conv_id = conversation["id"]

    # Fetch datasets for this conversation
    cursor = await db.execute(
        "SELECT url, name FROM datasets WHERE conversation_id = ? AND status = 'ready'",
        (conv_id,),
    )
    rows = await cursor.fetchall()

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No datasets loaded in this conversation",
        )

    datasets_list = [{"url": row["url"], "table_name": row["name"]} for row in rows]

    # Execute via worker pool (includes cache check)
    pool = getattr(request.app.state, "worker_pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Worker pool unavailable")

    import time

    start = time.monotonic()
    result = await pool.run_query(body.sql, datasets_list)
    elapsed_ms = (time.monotonic() - start) * 1000

    if "error_type" in result:
        # Record failed query in history
        try:
            await db.execute(
                """
                INSERT INTO query_history (id, user_id, conversation_id, query, execution_time_ms, row_count, status, error_message, source, created_at)
                VALUES (?, ?, ?, ?, ?, 0, 'error', ?, 'sql_panel', ?)
                """,
                (
                    str(uuid4()),
                    user["id"],
                    conv_id,
                    body.sql,
                    round(elapsed_ms, 2),
                    result.get("message", "Query execution failed"),
                    datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                ),
            )
            await db.commit()
        except Exception:
            pass  # Don't fail the request if history recording fails
        raise HTTPException(
            status_code=400,
            detail=result.get("message", "Query execution failed"),
        )

    # Detect whether this was a cache hit
    is_cached = result.pop("cached", False)
    # Detect whether an auto-LIMIT was injected by the worker
    is_limit_applied = result.pop("limit_applied", False)

    # Convert row dicts to list-of-lists
    columns = result.get("columns", [])
    row_dicts = result.get("rows", [])
    result_rows = [[row.get(col) for col in columns] for row in row_dicts]
    total_rows = result.get("total_rows", len(result_rows))

    # Apply server-side pagination
    page = body.page
    page_size = body.page_size
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_rows = result_rows[start_idx:end_idx]
    total_pages = math.ceil(len(result_rows) / page_size) if result_rows else 1

    # Record successful query in history
    try:
        await db.execute(
            """
            INSERT INTO query_history (id, user_id, conversation_id, query, execution_time_ms, row_count, status, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'success', 'sql_panel', ?)
            """,
            (
                str(uuid4()),
                user["id"],
                conv_id,
                body.sql,
                round(elapsed_ms, 2),
                total_rows,
                datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            ),
        )
        await db.commit()
    except Exception:
        pass  # Don't fail the request if history recording fails

    return RunQueryResponse(
        columns=columns,
        rows=paginated_rows,
        total_rows=total_rows,
        execution_time_ms=round(elapsed_ms, 2),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        cached=is_cached,
        limit_applied=is_limit_applied,
    )


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/explain-sql
# Explain a SQL query in plain English using the LLM
# ---------------------------------------------------------------------------


@router.post(
    "/{conversation_id}/explain-sql",
    response_model=ExplainSqlResponse,
)
async def explain_sql(
    body: ExplainSqlRequest,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
) -> ExplainSqlResponse:
    """Use the LLM to explain a SQL query in plain English."""
    from app.services.llm_service import client, MODEL_ID

    prompt = (
        "Explain this SQL query in plain English. Be concise (2-4 sentences). "
        f"Schema: {body.schema_json}\n"
        f"Query: {body.query}"
    )

    try:
        response = await client.aio.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
        )
        explanation = response.text or "Unable to generate explanation."
    except Exception as exc:
        _logger.exception("Failed to explain SQL for conversation %s", conversation["id"])
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    return ExplainSqlResponse(explanation=explanation)


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/generate-sql
# Generate SQL from a natural language question using the LLM
# ---------------------------------------------------------------------------


@router.post(
    "/{conversation_id}/generate-sql",
    response_model=GenerateSqlResponse,
)
async def generate_sql(
    body: GenerateSqlRequest,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> GenerateSqlResponse:
    """Use the LLM to generate a SQL query from a natural language question."""
    from app.services.llm_service import client, MODEL_ID

    conv_id = conversation["id"]

    # Fetch ready datasets for this conversation
    cursor = await db.execute(
        "SELECT name, schema_json, column_descriptions "
        "FROM datasets WHERE conversation_id = ? AND status = 'ready'",
        (conv_id,),
    )
    rows = await cursor.fetchall()

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No datasets loaded in this conversation",
        )

    # Build schema description for the prompt
    import json

    schema_parts: list[str] = []
    for row in rows:
        table_name = row["name"]
        try:
            schema = json.loads(row["schema_json"]) if row["schema_json"] else []
        except (json.JSONDecodeError, TypeError):
            schema = []

        try:
            col_descs = json.loads(row["column_descriptions"]) if row["column_descriptions"] else {}
        except (json.JSONDecodeError, TypeError):
            col_descs = {}

        cols_info: list[str] = []
        for col in schema:
            col_name = col.get("name", "unknown")
            col_type = col.get("type", "unknown")
            desc = col_descs.get(col_name, "")
            if desc:
                cols_info.append(f"  - {col_name} ({col_type}): {desc}")
            else:
                cols_info.append(f"  - {col_name} ({col_type})")

        schema_parts.append(f"Table: {table_name}\nColumns:\n" + "\n".join(cols_info))

    schemas_text = "\n\n".join(schema_parts)

    prompt = (
        "You are a SQL query generator. Given the following table schemas and a "
        "user's question in natural language, generate a SQL query that answers it.\n\n"
        "Use Polars SQL dialect. Always include LIMIT 1000 unless the user asks for "
        "a specific count or aggregate.\n\n"
        f"Tables:\n{schemas_text}\n\n"
        f"Question: {body.question}\n\n"
        "Respond in this exact format:\n"
        "SQL: <the sql query>\n"
        "EXPLANATION: <1-2 sentence explanation of what the query does>"
    )

    try:
        response = await client.aio.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
        )
        raw_text = response.text or ""
    except Exception as exc:
        _logger.exception(
            "Failed to generate SQL for conversation %s", conv_id
        )
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    # Parse the response to extract SQL and explanation
    generated_sql = raw_text
    explanation_text = ""

    # Try to parse structured response
    if "SQL:" in raw_text and "EXPLANATION:" in raw_text:
        sql_start = raw_text.index("SQL:") + len("SQL:")
        explanation_start = raw_text.index("EXPLANATION:")
        generated_sql = raw_text[sql_start:explanation_start].strip()
        explanation_text = raw_text[explanation_start + len("EXPLANATION:"):].strip()
    elif "SQL:" in raw_text:
        sql_start = raw_text.index("SQL:") + len("SQL:")
        generated_sql = raw_text[sql_start:].strip()

    # Strip markdown code fences if present
    generated_sql = generated_sql.strip()
    if generated_sql.startswith("```sql"):
        generated_sql = generated_sql[len("```sql"):]
    elif generated_sql.startswith("```"):
        generated_sql = generated_sql[len("```"):]
    if generated_sql.endswith("```"):
        generated_sql = generated_sql[:-len("```")]
    generated_sql = generated_sql.strip()

    return GenerateSqlResponse(sql=generated_sql, explanation=explanation_text)


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/prompt-preview
# Build and return the full prompt that would be sent to the LLM
# ---------------------------------------------------------------------------


@router.post(
    "/{conversation_id}/prompt-preview",
    response_model=PromptPreviewResponse,
)
async def prompt_preview(
    body: PromptPreviewRequest,
    conversation: dict = Depends(get_conversation),
    db: aiosqlite.Connection = Depends(get_db),
) -> PromptPreviewResponse:
    """Build the full LLM prompt for a hypothetical user message (without sending it)."""
    conv_id = conversation["id"]

    # Build conversation context (same as process_message steps 5-6)
    cursor = await db.execute(
        "SELECT id, conversation_id, role, content, sql_query, token_count, created_at "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conv_id,),
    )
    rows = await cursor.fetchall()
    messages_raw: list[dict] = [dict(r) for r in rows]
    messages_pruned = llm_service.prune_context(messages_raw)

    # Fetch datasets
    datasets = await dataset_service.get_datasets(db, conv_id)

    # Build system prompt
    system_prompt = llm_service.build_system_prompt(datasets)

    # Build contents list
    contents = llm_service._messages_to_contents(messages_pruned)

    # Format messages for response
    formatted_messages = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in messages_pruned
        if msg.get("role") != "system"
    ]

    # Get tool declaration names
    tool_names = []
    for tool in llm_service.TOOLS:
        if hasattr(tool, "function_declarations") and tool.function_declarations:
            for decl in tool.function_declarations:
                tool_names.append(decl.name)

    # Estimate tokens: total chars // 4
    total_chars = len(system_prompt)
    for msg in formatted_messages:
        total_chars += len(msg.get("content", ""))
    total_chars += len(body.content)
    estimated_tokens = total_chars // 4

    return PromptPreviewResponse(
        system_prompt=system_prompt,
        messages=formatted_messages,
        tools=tool_names,
        new_message=body.content,
        estimated_tokens=estimated_tokens,
    )


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/messages/{message_id}/redo
# Re-send a user message through the LLM flow
# ---------------------------------------------------------------------------


@router.post("/{conversation_id}/messages/{message_id}/redo", response_model=MessageAckResponse)
async def redo_message(
    request: Request,
    message_id: str,
    conversation: dict = Depends(get_conversation),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> MessageAckResponse:
    """Redo an assistant message: delete it and re-process the preceding user message."""
    conv_id = conversation["id"]

    # 1. Verify the message exists and belongs to this conversation
    cursor = await db.execute(
        "SELECT id, role, created_at FROM messages WHERE id = ? AND conversation_id = ?",
        (message_id, conv_id),
    )
    msg_row = await cursor.fetchone()
    if msg_row is None:
        raise HTTPException(status_code=404, detail="Message not found in this conversation")

    # 2. Verify it's an assistant message
    if msg_row["role"] != "assistant":
        raise HTTPException(status_code=400, detail="Can only redo assistant messages")

    # 3. Find the preceding user message
    cursor = await db.execute(
        "SELECT id, content FROM messages "
        "WHERE conversation_id = ? AND role = 'user' AND created_at < ? "
        "ORDER BY created_at DESC LIMIT 1",
        (conv_id, msg_row["created_at"]),
    )
    user_msg_row = await cursor.fetchone()
    if user_msg_row is None:
        raise HTTPException(status_code=400, detail="No preceding user message found")

    user_content = user_msg_row["content"]

    # 4. Delete the assistant message and the preceding user message
    #    (process_message will re-create the user message)
    #    Use a SAVEPOINT so both deletes are atomic.
    await db.execute("SAVEPOINT redo_delete")
    try:
        await db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        await db.execute("DELETE FROM messages WHERE id = ?", (user_msg_row["id"],))
        await db.execute("RELEASE SAVEPOINT redo_delete")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT redo_delete")
        raise HTTPException(status_code=500, detail="Failed to delete messages for redo")

    # 5. Re-send through LLM flow (same pattern as send_message)
    connection_manager = getattr(request.app.state, "connection_manager", None)

    async def ws_send(message: dict) -> None:
        if connection_manager is not None:
            await connection_manager.send_to_user(user["id"], message)

    pool = getattr(request.app.state, "worker_pool", None)

    async def _background_redo() -> None:
        try:
            await chat_service.process_message(
                db=db,
                conversation_id=conv_id,
                user_id=user["id"],
                content=user_content,
                ws_send=ws_send,
                pool=pool,
            )
        except Exception:
            _logger.exception(
                "Background redo failed for conversation %s, message %s",
                conv_id,
                message_id,
            )
            try:
                await ws_send({
                    "type": "chat_error",
                    "conversation_id": conv_id,
                    "error": "An unexpected error occurred while retrying your message. Please try again.",
                })
            except Exception:
                _logger.warning("Failed to send chat_error WS event for redo in conversation %s", conv_id)

    asyncio.create_task(_background_redo())

    return MessageAckResponse(message_id=message_id, status="processing")


# ---------------------------------------------------------------------------
# GET /shared/{share_token} — Public (no auth required)
# ---------------------------------------------------------------------------


@public_router.get("/{share_token}", response_model=PublicConversationResponse)
async def get_public_conversation(
    share_token: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> PublicConversationResponse:
    """Get a shared conversation by its share token (no authentication required)."""
    # Look up conversation by share_token
    cursor = await db.execute(
        "SELECT * FROM conversations WHERE share_token = ?",
        (share_token,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Shared conversation not found")

    conversation = dict(row)

    # Fetch messages
    cursor = await db.execute(
        "SELECT id, role, content, sql_query, reasoning, input_tokens, output_tokens, "
        "tool_call_trace, created_at "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation["id"],),
    )
    message_rows = await cursor.fetchall()
    messages = [
        MessageResponse(
            id=r["id"],
            role=r["role"],
            content=r["content"],
            sql_query=r["sql_query"],
            reasoning=r["reasoning"],
            input_tokens=r["input_tokens"] or 0,
            output_tokens=r["output_tokens"] or 0,
            tool_call_trace=r["tool_call_trace"],
            created_at=datetime.fromisoformat(r["created_at"]),
        )
        for r in message_rows
    ]

    # Fetch datasets
    cursor = await db.execute(
        "SELECT id, name, url, row_count, column_count, status, schema_json, file_size_bytes, column_descriptions "
        "FROM datasets WHERE conversation_id = ?",
        (conversation["id"],),
    )
    dataset_rows = await cursor.fetchall()
    datasets = [
        DatasetResponse(
            id=r["id"],
            name=r["name"],
            url=r["url"],
            row_count=r["row_count"],
            column_count=r["column_count"],
            status=r["status"] or "ready",
            schema_json=r["schema_json"] or "{}",
            file_size_bytes=r["file_size_bytes"],
            column_descriptions=r["column_descriptions"] or "{}",
        )
        for r in dataset_rows
    ]

    return PublicConversationResponse(
        title=conversation["title"],
        messages=messages,
        datasets=datasets,
        shared_at=conversation["shared_at"],
    )
