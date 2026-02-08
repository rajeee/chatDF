"""Conversations router -- CRUD for conversations plus chat endpoints.

Implements: spec/backend/rest_api/plan.md#routersconversationspy

Endpoints:
- POST /conversations                          -> create_conversation
- GET /conversations                           -> list_conversations
- GET /conversations/{conversation_id}         -> get_conversation_detail
- PATCH /conversations/{conversation_id}       -> rename_conversation
- DELETE /conversations/{conversation_id}      -> delete_conversation
- DELETE /conversations                        -> clear_all_conversations
- POST /conversations/{conversation_id}/messages -> send_message
- POST /conversations/{conversation_id}/stop     -> stop_generation
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from uuid import uuid4

import aiosqlite
from fastapi import APIRouter, Depends, Request

from app.dependencies import get_conversation, get_current_user, get_db
from app.models import (
    ClearAllResponse,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
    DatasetResponse,
    MessageAckResponse,
    MessageResponse,
    PinConversationRequest,
    RenameConversationRequest,
    SendMessageRequest,
    SuccessResponse,
)
from app.services import chat_service

router = APIRouter()


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
    now = datetime.utcnow().isoformat()

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
        "  (SELECT COUNT(*) FROM datasets d WHERE d.conversation_id = c.id) AS dataset_count, "
        "  (SELECT SUBSTR(m.content, 1, 100) FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview "
        "FROM conversations c "
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
            last_message_preview=row["last_message_preview"],
            is_pinned=bool(row["is_pinned"]),
        )
        for row in rows
    ]

    return ConversationListResponse(conversations=conversations)


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
        "SELECT id, role, content, sql_query, reasoning, created_at "
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
            created_at=datetime.fromisoformat(row["created_at"]),
        )
        for row in message_rows
    ]

    # Fetch datasets
    cursor = await db.execute(
        "SELECT id, name, url, row_count, column_count, status, schema_json "
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
    now = datetime.utcnow().isoformat()

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
    now = datetime.utcnow().isoformat()

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
    now = datetime.utcnow().isoformat()
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

    asyncio.create_task(_background_process())

    return MessageAckResponse(message_id=msg_id, status="processing")


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
