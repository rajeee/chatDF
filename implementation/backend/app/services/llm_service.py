"""LLM service: Gemini client, system prompt, streaming, tool calls.

Implements: spec/backend/llm/plan.md

Encapsulates all Gemini SDK interaction: client setup, tool definitions,
streaming iteration, tool call dispatch, token counting, and context pruning.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field

from google.genai import Client
from google.genai import types

from app.config import get_settings
from app.services import worker_pool
from app.services import dataset_service

# ---------------------------------------------------------------------------
# Constants
# Implements: spec/backend/llm/plan.md#gemini-sdk-setup
# ---------------------------------------------------------------------------

MODEL_ID = "gemini-2.5-flash"
MAX_TOOL_CALLS_PER_TURN = 5
MAX_SQL_RETRIES = 3

# ---------------------------------------------------------------------------
# Gemini client (module-level singleton)
# ---------------------------------------------------------------------------

settings = get_settings()
client = Client(api_key=settings.gemini_api_key)

# ---------------------------------------------------------------------------
# Tool Declarations
# Implements: spec/backend/llm/plan.md#tool-definitions
# ---------------------------------------------------------------------------

_execute_sql_decl = types.FunctionDeclaration(
    name="execute_sql",
    description="Execute a SQL query against the loaded datasets. Use Polars SQL dialect.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "query": types.Schema(
                type="STRING",
                description="The SQL query to execute",
            ),
        },
        required=["query"],
    ),
)

_load_dataset_decl = types.FunctionDeclaration(
    name="load_dataset",
    description="Load a parquet dataset from a URL into the conversation.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "url": types.Schema(
                type="STRING",
                description="The URL of the parquet file to load",
            ),
        },
        required=["url"],
    ),
)

TOOLS = [types.Tool(function_declarations=[_execute_sql_decl, _load_dataset_decl])]

# ---------------------------------------------------------------------------
# StreamResult
# Implements: spec/backend/llm/plan.md#streaming-response-handler
# ---------------------------------------------------------------------------


@dataclass
class SqlExecution:
    """Result of a single SQL query execution."""

    query: str = ""
    columns: list[str] | None = None
    rows: list[list] | None = None
    total_rows: int | None = None
    error: str | None = None


@dataclass
class StreamResult:
    """Result of a streaming chat turn."""

    input_tokens: int = 0
    output_tokens: int = 0
    assistant_message: str = ""
    tool_calls_made: int = 0
    sql_queries: list[str] = field(default_factory=list)
    sql_executions: list[SqlExecution] = field(default_factory=list)


# ---------------------------------------------------------------------------
# build_system_prompt
# Implements: spec/backend/llm/plan.md#system-prompt-construction
# ---------------------------------------------------------------------------


def build_system_prompt(datasets: list[dict]) -> str:
    """Assemble table schemas into a system prompt.

    Args:
        datasets: List of dicts with ``name``, ``schema_json``, and optionally
                  ``row_count`` keys.

    Returns:
        The system prompt string for the Gemini API.
    """
    parts: list[str] = []

    # Role statement
    parts.append(
        "You are a data analyst assistant. Help users understand and explore their data."
    )

    if datasets:
        parts.append("\n## Available Datasets\n")
        for ds in datasets:
            name = ds["name"]
            schema_raw = ds.get("schema_json", "[]")
            row_count = ds.get("row_count", 0)

            if isinstance(schema_raw, str):
                columns = json.loads(schema_raw)
            else:
                columns = schema_raw

            parts.append(f"### Table: {name}")
            parts.append(f"Row count: {row_count}")
            parts.append("Columns:")
            for col in columns:
                col_name = col.get("name", "unknown")
                col_type = col.get("type", "unknown")
                parts.append(f"  - {col_name}: {col_type}")
            parts.append("")

        parts.append("## Instructions")
        parts.append("- Use the provided table names as-is in SQL queries.")
        parts.append(
            "- Explore data before answering when uncertain "
            "(check column values, types)."
        )
        parts.append(
            "- SQL dialect: Polars SQL. Note any differences from standard SQL."
        )
        parts.append("- Always use LIMIT 1000 on result sets.")
        parts.append("- Return concise, helpful answers.")
        parts.append(
            "- Use the execute_sql tool to run SQL queries against the datasets."
        )
    else:
        parts.append("\n## No Datasets Loaded\n")
        parts.append(
            "No datasets are currently loaded in this conversation. "
            "Suggest that the user add a dataset using the dataset panel, "
            "or if the user provides a parquet URL in their message, "
            "use the load_dataset tool to load it automatically."
        )

    parts.append(
        "\n- If the user's message contains a parquet URL, "
        "automatically load it via the load_dataset tool before answering."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# prune_context
# Implements: spec/backend/llm/plan.md#conversation-context-management
# ---------------------------------------------------------------------------


def prune_context(
    messages: list[dict],
    max_messages: int = 50,
    max_tokens: int = 800_000,
) -> list[dict]:
    """Prune conversation context to fit within limits.

    Keeps system messages (role="system") always. Then keeps the most recent
    ``max_messages`` user/assistant messages. Finally, if estimated token count
    exceeds ``max_tokens``, removes oldest messages until under budget.

    Args:
        messages: Full list of message dicts with ``role`` and ``content``.
        max_messages: Max user+assistant messages to retain (default 50).
        max_tokens: Token budget estimated as total_chars // 4 (default 800K).

    Returns:
        Pruned list of message dicts.
    """
    if not messages:
        return []

    # Separate system messages from user/assistant messages
    system_msgs = [m for m in messages if m.get("role") == "system"]
    non_system_msgs = [m for m in messages if m.get("role") != "system"]

    # Keep the most recent max_messages non-system messages
    if len(non_system_msgs) > max_messages:
        non_system_msgs = non_system_msgs[-max_messages:]

    # Token budget check: estimate tokens as total_chars // 4
    def _estimate_tokens(msgs: list[dict]) -> int:
        return sum(len(m.get("content", "")) for m in msgs) // 4

    while non_system_msgs and _estimate_tokens(system_msgs + non_system_msgs) > max_tokens:
        non_system_msgs.pop(0)

    return system_msgs + non_system_msgs


# ---------------------------------------------------------------------------
# stream_chat
# Implements: spec/backend/llm/plan.md#streaming-response-handler
# Implements: spec/backend/llm/plan.md#tool-call-execution-flow
# ---------------------------------------------------------------------------


def _messages_to_contents(messages: list[dict]) -> list[types.Content]:
    """Convert message dicts to Gemini Content objects."""
    contents = []
    for msg in messages:
        role = msg["role"]
        # Gemini uses "model" for assistant role
        if role == "assistant":
            role = "model"
        # Skip system messages (handled via system_instruction)
        if role == "system":
            continue
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part(text=msg["content"])],
            )
        )
    return contents


async def stream_chat(
    messages: list[dict],
    datasets: list[dict],
    ws_send: callable,
    cancel_event: asyncio.Event | None = None,
    pool: object | None = None,
    db: object | None = None,
    conversation_id: str | None = None,
) -> StreamResult:
    """Stream a chat response from Gemini, handling tool calls.

    Args:
        messages: Conversation history as list of ``{"role": str, "content": str}``.
        datasets: Dataset dicts for system prompt construction.
        ws_send: Async callable ``(event_type, data)`` for WebSocket dispatch.
        cancel_event: Optional asyncio.Event; when set, streaming stops.
        pool: Optional worker pool for SQL execution.
        db: Optional database connection for dataset loading.
        conversation_id: Optional conversation ID for dataset loading.

    Returns:
        StreamResult with token counts, assistant message, and tool call count.
    """
    result = StreamResult()
    system_prompt = build_system_prompt(datasets)
    contents = _messages_to_contents(messages)

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        tools=TOOLS,
    )

    tool_call_count = 0
    sql_retry_count = 0
    collected_text = ""

    while True:
        # Call Gemini async streaming API (non-blocking for the event loop)
        stream = await client.aio.models.generate_content_stream(
            model=MODEL_ID,
            contents=contents,
            config=config,
        )

        found_tool_call = False
        tool_call_name = None
        tool_call_args = None

        async for chunk in stream:
            # Check for cancellation
            if cancel_event and cancel_event.is_set():
                result.assistant_message = collected_text
                return result

            # Process chunk parts
            if hasattr(chunk, "candidates") and chunk.candidates:
                for candidate in chunk.candidates:
                    if hasattr(candidate, "content") and candidate.content:
                        for part in (candidate.content.parts or []):
                            # Text part
                            if hasattr(part, "text") and part.text is not None and part.text:
                                collected_text += part.text
                                await ws_send("chat_token", {"token": part.text})

                            # Function call part
                            if hasattr(part, "function_call") and part.function_call is not None:
                                found_tool_call = True
                                tool_call_name = part.function_call.name
                                tool_call_args = (
                                    dict(part.function_call.args)
                                    if part.function_call.args
                                    else {}
                                )
                                break
                    if found_tool_call:
                        break
            if found_tool_call:
                break

        # Accumulate token counts from usage_metadata
        if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
            result.input_tokens += chunk.usage_metadata.prompt_token_count or 0
            result.output_tokens += chunk.usage_metadata.candidates_token_count or 0

        if not found_tool_call:
            # No tool call — streaming complete
            break

        # --- Tool call execution ---
        tool_call_count += 1
        result.tool_calls_made = tool_call_count

        # Check max tool calls limit
        if tool_call_count > MAX_TOOL_CALLS_PER_TURN:
            # Force LLM to respond without more tools
            contents.append(
                types.Content(
                    role="model",
                    parts=[types.Part(function_call=types.FunctionCall(
                        name=tool_call_name,
                        args=tool_call_args,
                    ))],
                )
            )
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part(text=(
                        "Maximum tool calls reached. Please respond with "
                        "the information you have gathered so far without "
                        "making any more tool calls."
                    ))],
                )
            )
            # Remove tools from config for the final response
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
            )
            continue

        # Send tool_call_start event
        await ws_send("tool_call_start", {"tool": tool_call_name, "args": tool_call_args})

        # Dispatch tool call
        tool_result_str = ""
        if tool_call_name == "execute_sql":
            # If max SQL retries already reached, refuse to dispatch
            if sql_retry_count >= MAX_SQL_RETRIES:
                tool_result_str = (
                    "Maximum SQL retry attempts reached. "
                    "Please explain the error to the user instead of retrying."
                )
            else:
                query = tool_call_args.get("query", "")
                result.sql_queries.append(query)
                # Map dataset dicts to worker format (execute_query expects "table_name")
                worker_datasets = [
                    {"url": ds["url"], "table_name": ds["name"]}
                    for ds in datasets
                ]
                query_result = await pool.run_query(query, worker_datasets)

                if "error_type" in query_result or "error" in query_result:
                    sql_retry_count += 1
                    error_msg = query_result.get("message", query_result.get("error", "Unknown error"))
                    tool_result_str = f"Error executing SQL: {error_msg}"
                    result.sql_executions.append(SqlExecution(
                        query=query, error=error_msg,
                    ))

                    # Check if max SQL retries reached
                    if sql_retry_count >= MAX_SQL_RETRIES:
                        tool_result_str += (
                            "\n\nMaximum SQL retry attempts reached. "
                            "Please explain the error to the user instead of retrying."
                        )
                else:
                    rows = query_result.get("rows", [])
                    columns = query_result.get("columns", [])
                    total = query_result.get("total_rows", len(rows))
                    # Cap rows at 100 for the frontend payload.
                    # Convert dict rows to arrays (Polars to_dicts() returns
                    # list[dict], but the frontend expects list[list]).
                    capped_rows = [
                        [row.get(c) for c in columns]
                        for row in rows[:100]
                    ]
                    result.sql_executions.append(SqlExecution(
                        query=query,
                        columns=columns,
                        rows=capped_rows,
                        total_rows=total,
                    ))
                    tool_result_str = (
                        f"Query executed successfully.\n"
                        f"Columns: {columns}\n"
                        f"Total rows: {total}\n"
                        f"Results (first {len(rows)} rows): {json.dumps(rows[:20], default=str)}"
                    )

        elif tool_call_name == "load_dataset":
            url = tool_call_args.get("url", "")
            try:
                ds_result = await dataset_service.add_dataset(db, conversation_id, url, pool)
                tool_result_str = (
                    f"Dataset loaded successfully.\n"
                    f"Table name: {ds_result.get('name', 'unknown')}\n"
                    f"Rows: {ds_result.get('row_count', 0)}\n"
                    f"Columns: {ds_result.get('column_count', 0)}"
                )
            except ValueError as exc:
                tool_result_str = f"Error loading dataset: {exc}"
        else:
            tool_result_str = f"Unknown tool: {tool_call_name}"

        # Append tool call and result to contents for next Gemini call
        contents.append(
            types.Content(
                role="model",
                parts=[types.Part(function_call=types.FunctionCall(
                    name=tool_call_name,
                    args=tool_call_args,
                ))],
            )
        )
        contents.append(
            types.Content(
                role="function",
                parts=[types.Part(function_response=types.FunctionResponse(
                    name=tool_call_name,
                    response={"result": tool_result_str},
                ))],
            )
        )

    result.assistant_message = collected_text
    return result
