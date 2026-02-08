"""WebSocket message factory functions.

Implements: spec/backend/websocket/plan.md#Message-Serialization

Each function returns a plain dict with a ``type`` field plus data fields.
Services call these factories and pass the result to
``connection_manager.send_to_user()`` or ``connection_manager.send_to_websocket()``.
"""

from __future__ import annotations


def chat_token(*, token: str, message_id: str) -> dict:
    """Single streamed token from the LLM response.

    Compressed format: type=ct, token=t, message_id=mid
    """
    return {"type": "ct", "t": token, "mid": message_id}


def chat_complete(
    *,
    message_id: str,
    sql_query: str | None,
    token_count: int,
    sql_executions: list[dict] | None = None,
    reasoning: str | None = None,
) -> dict:
    """LLM response finished.

    Compressed format: type=cc, message_id=mid, sql_query=sq, token_count=tc,
    sql_executions=se, reasoning=r
    Omit null fields.
    """
    result: dict = {
        "type": "cc",
        "mid": message_id,
        "tc": token_count,
        "se": sql_executions or [],
    }
    if sql_query:
        result["sq"] = sql_query
    if reasoning:
        result["r"] = reasoning
    return result


def chat_error(*, error: str, details: str | None) -> dict:
    """Chat processing error occurred.

    Compressed format: type=ce, error=e, details=d
    Omit null fields.
    """
    result: dict = {"type": "ce", "e": error}
    if details:
        result["d"] = details
    return result


def dataset_loading(*, dataset_id: str, url: str) -> dict:
    """Dataset load started.

    Compressed format: type=dl, dataset_id=did, url=u, status=s
    """
    return {
        "type": "dl",
        "did": dataset_id,
        "u": url,
        "s": "loading",
    }


def dataset_loaded(
    *,
    dataset_id: str,
    name: str,
    row_count: int,
    column_count: int,
    schema: list,
) -> dict:
    """Dataset successfully loaded and ready for queries.

    Compressed format: type=dld, dataset_id=did, name=n, row_count=rc,
    column_count=cc, schema=sc
    """
    return {
        "type": "dld",
        "did": dataset_id,
        "n": name,
        "rc": row_count,
        "cc": column_count,
        "sc": schema,
    }


def dataset_error(*, dataset_id: str, error: str) -> dict:
    """Dataset load failed.

    Compressed format: type=de, dataset_id=did, error=e
    """
    return {"type": "de", "did": dataset_id, "e": error}


def query_status(*, phase: str) -> dict:
    """Query processing phase update.

    Compressed format: type=qs, phase=p
    """
    return {"type": "qs", "p": phase}


def rate_limit_warning(*, usage_percent: float, remaining_tokens: int) -> dict:
    """User is approaching their rate limit.

    Compressed format: type=rlw, usage_percent=up, remaining_tokens=rt
    """
    return {
        "type": "rlw",
        "up": usage_percent,
        "rt": remaining_tokens,
    }


def rate_limit_exceeded(*, resets_in_seconds: int) -> dict:
    """User has exceeded their rate limit.

    Compressed format: type=rle, resets_in_seconds=rs
    """
    return {"type": "rle", "rs": resets_in_seconds}


def reasoning_token(*, token: str) -> dict:
    """Single reasoning/thinking token from the LLM.

    Compressed format: type=rt, token=t
    """
    return {"type": "rt", "t": token}


def reasoning_complete() -> dict:
    """Reasoning phase complete, normal output starting.

    Compressed format: type=rc
    """
    return {"type": "rc"}


def tool_call_start(*, tool: str, args: dict) -> dict:
    """Tool/function call detected and starting.

    Compressed format: type=tcs, tool=tl, args=a
    """
    return {"type": "tcs", "tl": tool, "a": args}


def conversation_title_updated() -> dict:
    """Conversation title was auto-generated.

    Compressed format: type=ctu
    """
    return {"type": "ctu"}


def usage_update() -> dict:
    """Usage statistics changed, client should refetch.

    Compressed format: type=uu
    """
    return {"type": "uu"}
