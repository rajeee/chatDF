"""WebSocket message factory functions.

Implements: spec/backend/websocket/plan.md#Message-Serialization

Each function returns a plain dict with a ``type`` field plus data fields.
Services call these factories and pass the result to
``connection_manager.send_to_user()`` or ``connection_manager.send_to_websocket()``.
"""

from __future__ import annotations


def chat_token(*, token: str, message_id: str) -> dict:
    """Single streamed token from the LLM response."""
    return {"type": "chat_token", "token": token, "message_id": message_id}


def chat_complete(
    *,
    message_id: str,
    sql_query: str | None,
    token_count: int,
    sql_executions: list[dict] | None = None,
    reasoning: str | None = None,
) -> dict:
    """LLM response finished."""
    return {
        "type": "chat_complete",
        "message_id": message_id,
        "sql_query": sql_query,
        "token_count": token_count,
        "sql_executions": sql_executions or [],
        "reasoning": reasoning,
    }


def chat_error(*, error: str, details: str | None) -> dict:
    """Chat processing error occurred."""
    return {"type": "chat_error", "error": error, "details": details}


def dataset_loading(*, dataset_id: str, url: str) -> dict:
    """Dataset load started."""
    return {
        "type": "dataset_loading",
        "dataset_id": dataset_id,
        "url": url,
        "status": "loading",
    }


def dataset_loaded(
    *,
    dataset_id: str,
    name: str,
    row_count: int,
    column_count: int,
    schema: list,
) -> dict:
    """Dataset successfully loaded and ready for queries."""
    return {
        "type": "dataset_loaded",
        "dataset_id": dataset_id,
        "name": name,
        "row_count": row_count,
        "column_count": column_count,
        "schema": schema,
    }


def dataset_error(*, dataset_id: str, error: str) -> dict:
    """Dataset load failed."""
    return {"type": "dataset_error", "dataset_id": dataset_id, "error": error}


def query_status(*, phase: str) -> dict:
    """Query processing phase update."""
    return {"type": "query_status", "phase": phase}


def rate_limit_warning(*, usage_percent: float, remaining_tokens: int) -> dict:
    """User is approaching their rate limit."""
    return {
        "type": "rate_limit_warning",
        "usage_percent": usage_percent,
        "remaining_tokens": remaining_tokens,
    }


def rate_limit_exceeded(*, resets_in_seconds: int) -> dict:
    """User has exceeded their rate limit."""
    return {"type": "rate_limit_exceeded", "resets_in_seconds": resets_in_seconds}
