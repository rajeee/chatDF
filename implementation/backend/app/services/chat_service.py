"""Chat service: full message orchestration.

Implements: spec/backend/plan.md#chat-service-orchestration

Central orchestrator for the message-send flow. Coordinates concurrency
guards, rate limiting, context building, LLM streaming, message persistence,
token recording, and WebSocket event dispatch.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite

import json

from app.exceptions import ConflictError, RateLimitError
from app.services import dataset_service, llm_service, rate_limit_service
from app.services import ws_messages

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# Maps conversation_id -> asyncio.Event used as cancel token.
# Presence in the dict means a generation is active for that conversation.
_active_conversations: dict[str, asyncio.Event] = {}


# ---------------------------------------------------------------------------
# process_message
# Implements: spec/backend/plan.md#full-message-send-flow
# ---------------------------------------------------------------------------


async def process_message(
    db: aiosqlite.Connection,
    conversation_id: str,
    user_id: str,
    content: str,
    ws_send: callable,
    pool: object | None = None,
) -> dict:
    """Execute the full 14-step message-send orchestration.

    Args:
        db: Database connection.
        conversation_id: The conversation to process in.
        user_id: The authenticated user.
        content: The user's message text.
        ws_send: Async callable ``(event_type, data_dict)`` for WS dispatch.
        pool: Optional worker pool for SQL execution.

    Returns:
        Dict representing the persisted assistant message.

    Raises:
        ConflictError: If a generation is already active for this conversation.
        RateLimitError: If the user has exceeded their token limit.
    """

    # -----------------------------------------------------------------------
    # Step 1: Concurrency check
    # -----------------------------------------------------------------------
    if conversation_id in _active_conversations:
        raise ConflictError("Generation already in progress for this conversation")

    # -----------------------------------------------------------------------
    # Step 2: Mark active (create cancel event)
    # -----------------------------------------------------------------------
    cancel_event = asyncio.Event()
    _active_conversations[conversation_id] = cancel_event

    try:
        # -------------------------------------------------------------------
        # Step 3: Persist user message
        # -------------------------------------------------------------------
        user_msg_id = str(uuid4())
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        await db.execute(
            "INSERT INTO messages "
            "(id, conversation_id, role, content, sql_query, token_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_msg_id, conversation_id, "user", content, None, 0, now),
        )
        await db.commit()

        # -------------------------------------------------------------------
        # Step 3b: Auto-generate conversation title from first user message
        # -------------------------------------------------------------------
        cursor = await db.execute(
            "SELECT title FROM conversations WHERE id = ?",
            (conversation_id,),
        )
        conv_row = await cursor.fetchone()
        if conv_row and (not conv_row["title"]):
            auto_title = content[:50].strip()
            if len(content) > 50:
                auto_title += "…"
            await db.execute(
                "UPDATE conversations SET title = ? WHERE id = ?",
                (auto_title, conversation_id),
            )
            await db.commit()
            await ws_send(ws_messages.conversation_title_updated())

        # -------------------------------------------------------------------
        # Step 4: Rate limit check
        # -------------------------------------------------------------------
        status = await rate_limit_service.check_limit(db, user_id)
        if status.warning:
            await ws_send(
                ws_messages.rate_limit_warning(
                    usage_percent=status.usage_percent,
                    remaining_tokens=status.remaining_tokens,
                )
            )
        if not status.allowed:
            resets = status.resets_in_seconds or 0
            await ws_send(ws_messages.rate_limit_exceeded(resets_in_seconds=resets))
            raise RateLimitError(
                "Daily token limit exceeded",
                resets_in_seconds=resets,
            )

        # -------------------------------------------------------------------
        # Step 5: Build conversation context
        # -------------------------------------------------------------------
        cursor = await db.execute(
            "SELECT id, conversation_id, role, content, sql_query, token_count, created_at "
            "FROM messages WHERE conversation_id = ? ORDER BY created_at",
            (conversation_id,),
        )
        rows = await cursor.fetchall()
        messages: list[dict] = [dict(r) for r in rows]

        # Prune to fit context window
        messages = llm_service.prune_context(messages)

        # -------------------------------------------------------------------
        # Step 6: Fetch datasets
        # -------------------------------------------------------------------
        datasets = await dataset_service.get_datasets(db, conversation_id)

        # -------------------------------------------------------------------
        # Step 6b: Read user's selected model from user_settings
        # -------------------------------------------------------------------
        cursor = await db.execute(
            "SELECT selected_model FROM user_settings WHERE user_id = ?",
            (user_id,),
        )
        settings_row = await cursor.fetchone()
        selected_model = settings_row["selected_model"] if settings_row else None

        # -------------------------------------------------------------------
        # Step 7: Send query_status("generating")
        # -------------------------------------------------------------------
        await ws_send(ws_messages.query_status(phase="generating"))

        # -------------------------------------------------------------------
        # Step 8: Call LLM streaming
        # -------------------------------------------------------------------
        result = await llm_service.stream_chat(
            messages,
            datasets,
            ws_send,
            cancel_event=cancel_event,
            pool=pool,
            db=db,
            conversation_id=conversation_id,
            model_id=selected_model,
        )

        # -------------------------------------------------------------------
        # Step 9: Persist assistant message
        # -------------------------------------------------------------------
        asst_msg_id = str(uuid4())
        asst_now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        token_count = result.input_tokens + result.output_tokens
        # Serialize sql_executions for DB storage (full_rows: up to 1000 rows)
        # and WS transmission (rows: capped at 100 rows).
        sql_executions_for_db = [
            {
                "query": ex.query,
                "columns": ex.columns,
                "rows": ex.full_rows if ex.full_rows is not None else ex.rows,
                "total_rows": ex.total_rows,
                "error": ex.error,
                "execution_time_ms": ex.execution_time_ms,
            }
            for ex in result.sql_executions
        ]
        sql_executions_for_ws = [
            {
                "query": ex.query,
                "columns": ex.columns,
                "rows": ex.rows,
                "total_rows": ex.total_rows,
                "error": ex.error,
                "execution_time_ms": ex.execution_time_ms,
            }
            for ex in result.sql_executions
        ]
        sql_query = (
            json.dumps(sql_executions_for_db, default=str)
            if sql_executions_for_db
            else None
        )

        # Serialize tool_call_trace for DB storage
        tool_call_trace_json = (
            json.dumps(result.tool_call_trace, default=str)
            if result.tool_call_trace
            else None
        )

        await db.execute(
            "INSERT INTO messages "
            "(id, conversation_id, role, content, sql_query, token_count, created_at, reasoning, "
            "input_tokens, output_tokens, tool_call_trace) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                asst_msg_id,
                conversation_id,
                "assistant",
                result.assistant_message,
                sql_query,
                token_count,
                asst_now,
                result.reasoning or None,
                result.input_tokens,
                result.output_tokens,
                tool_call_trace_json,
            ),
        )
        await db.commit()

        # -------------------------------------------------------------------
        # Step 10: Record token usage
        # -------------------------------------------------------------------
        await rate_limit_service.record_usage(
            db=db,
            user_id=user_id,
            conversation_id=conversation_id,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )

        # -------------------------------------------------------------------
        # Step 11: Send chat_complete
        # -------------------------------------------------------------------
        await ws_send(
            ws_messages.chat_complete(
                message_id=asst_msg_id,
                sql_query=sql_query,
                token_count=token_count,
                sql_executions=sql_executions_for_ws,
                reasoning=result.reasoning or None,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                tool_call_trace=result.tool_call_trace or None,
            )
        )

        # -------------------------------------------------------------------
        # Step 12: Check if near limit after usage
        # -------------------------------------------------------------------
        post_status = await rate_limit_service.check_limit(db, user_id)
        if post_status.warning:
            await ws_send(
                ws_messages.rate_limit_warning(
                    usage_percent=post_status.usage_percent,
                    remaining_tokens=post_status.remaining_tokens,
                )
            )

        # -------------------------------------------------------------------
        # Build return value
        # -------------------------------------------------------------------
        return {
            "id": asst_msg_id,
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": result.assistant_message,
            "sql_query": sql_query,
            "token_count": token_count,
            "created_at": asst_now,
        }

    except (ConflictError, RateLimitError):
        # Re-raise domain errors without sending chat_error
        raise

    except llm_service.GeminiRateLimitError as exc:
        # -------------------------------------------------------------------
        # Gemini 429: send user-friendly error (no traceback in logs)
        # -------------------------------------------------------------------
        logger.warning("Gemini rate limit for conversation %s: %s", conversation_id, exc)
        try:
            await ws_send(
                ws_messages.chat_error(
                    error=str(exc),
                    details=None,
                )
            )
        except Exception:
            logger.exception("Failed to send chat_error via WebSocket")
        raise

    except Exception as exc:
        # -------------------------------------------------------------------
        # Error handling: send chat_error via WS
        # -------------------------------------------------------------------
        logger.exception("Error processing message for conversation %s", conversation_id)
        try:
            await ws_send(
                ws_messages.chat_error(
                    error=str(exc),
                    details=type(exc).__name__,
                )
            )
        except Exception:
            logger.exception("Failed to send chat_error via WebSocket")
        raise

    finally:
        # -------------------------------------------------------------------
        # Step 13: Mark inactive (always, even on error)
        # -------------------------------------------------------------------
        _active_conversations.pop(conversation_id, None)


# ---------------------------------------------------------------------------
# stop_generation
# Implements: spec/backend/plan.md#stopcancelation
# ---------------------------------------------------------------------------


def stop_generation(conversation_id: str) -> None:
    """Set the cancellation event for an active conversation.

    If the conversation is not currently active, this is a no-op.
    """
    cancel_event = _active_conversations.get(conversation_id)
    if cancel_event is not None:
        cancel_event.set()
