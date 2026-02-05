---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# LLM Integration Plan

## Module Structure

### `backend/app/services/llm_service.py`

Encapsulates all Gemini SDK interaction: client setup, tool definitions, streaming, token counting.

### `backend/app/services/chat_service.py`

Orchestrates the full chat turn: rate limit check, system prompt assembly, LLM call, tool execution loop, usage recording, WebSocket events. (chat_service already specified in the overall plan; this plan covers the llm_service it delegates to.)

## Gemini SDK Setup

Implements: [spec.md#provider](./spec.md#provider)

- Initialize `google.genai.Client(api_key=config.GEMINI_API_KEY)` once at module level in `llm_service.py`.
- Model ID: `"gemini-2.5-flash"` stored as constant `MODEL_ID`.
- Safety settings: use Gemini defaults (no custom overrides for V1).

## Tool Definitions

Implements: [spec.md#tool-calling](./spec.md#tool-calling)

Two tools declared as `google.genai.types.FunctionDeclaration` objects:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `execute_sql` | `query: str` | Execute SQL against loaded datasets |
| `load_dataset` | `url: str` | Load a parquet dataset from URL |

Tools are assembled into a `google.genai.types.Tool` and passed to every `generate_content` call.

## System Prompt Construction

Implements: [spec.md#system-prompt](./spec.md#system-prompt)

`build_system_prompt(datasets: list[dict]) -> str`

- Takes the list of datasets for the current conversation (each with `name`, `schema_json`).
- Assembles a prompt string containing:
  1. Role statement (fixed text).
  2. Per-dataset schema block: table name, columns with types.
  3. SQL dialect notes for Polars SQL.
  4. Behavioral instructions (explore before answering, LIMIT 1000, etc.).
  5. No-dataset fallback instructions (suggest adding a dataset or auto-load if URL detected).

## Streaming Response Handler

Implements: [spec.md#streaming](./spec.md#streaming)

`async stream_chat(messages, datasets, ws_send) -> StreamResult`

Parameters:
- `messages`: list of `{"role": str, "content": str}` dicts (full conversation history).
- `datasets`: list of dataset dicts for system prompt.
- `ws_send`: async callable `(event_type: str, data: dict) -> None` for WebSocket dispatch.

Returns `StreamResult` (a dataclass): `input_tokens: int`, `output_tokens: int`, `assistant_message: str`, `tool_calls_made: int`.

Flow:
1. Build system prompt via `build_system_prompt(datasets)`.
2. Call `client.models.generate_content_stream(model=MODEL_ID, contents=contents, tools=tools, config=generation_config)`.
3. Iterate over stream chunks:
   - Text chunk: call `ws_send("chat_token", {"token": chunk_text})`.
   - Tool call chunk: break out of stream iteration, enter tool execution flow (below).
4. After stream completes, extract token counts from `response.usage_metadata`.

## Tool Call Execution Flow

Implements: [spec.md#tool-calling](./spec.md#tool-calling), [spec.md#error-self-correction](./spec.md#error-self-correction)

When a tool call is detected in the stream:

1. Send `ws_send("tool_call_start", {"tool": tool_name, "args": args})`.
2. Dispatch to handler:
   - `execute_sql`: call `worker_pool.run_query(pool, sql, datasets)`.
   - `load_dataset`: call `dataset_service.add_dataset(conversation_id, url)`.
3. Format result as string for the LLM tool response.
4. If `execute_sql` returned an error, increment `retry_count`.
5. Send tool response back to Gemini (append to contents as tool response part).
6. Resume streaming from the new Gemini response.
7. Repeat if LLM issues another tool call.

### Enforcement Limits

| Limit | Value | Tracked By |
|-------|-------|-----------|
| Max tool calls per turn | 5 | `tool_call_count` counter in `stream_chat` |
| Max SQL retries per turn | 3 | `sql_retry_count` counter in `stream_chat` |

When max tool calls reached: append a system message instructing the LLM to respond without further tool calls. When max SQL retries reached: append a message telling the LLM to explain the error to the user.

## Token Counting

Implements: [spec.md#token-counting](./spec.md#token-counting)

- Extracted from `response.usage_metadata.prompt_token_count` and `response.usage_metadata.candidates_token_count` after the final streaming response completes.
- If multiple Gemini calls occur in one turn (due to tool calls), tokens are summed across all calls.
- Returned as part of `StreamResult` for the caller (`chat_service`) to persist and include in the `chat_complete` event.

## Conversation Context Management

Implements: [spec.md#conversation-context](./spec.md#conversation-context)

- `stream_chat` receives the full message history (up to 50 messages).
- Messages converted to Gemini `Content` objects: `role="user"` or `role="model"`.
- System prompt passed via `config=GenerateContentConfig(system_instruction=system_prompt)`.
- Pruning to 50 messages happens in `chat_service` before calling `stream_chat`.

## Scope

### In Scope
- Gemini SDK client setup and configuration
- Tool declaration and execution dispatch
- Streaming iteration and WebSocket event emission
- Token counting aggregation
- Retry/limit enforcement within a single turn

### Out of Scope
- Rate limit checks (see rate_limiting/plan.md -- called by chat_service before this)
- Worker pool operations (see worker/plan.md -- called by tool execution handlers)
- Message persistence (see database/plan.md -- handled by chat_service after)

### Assumptions
- `google-genai` SDK supports `generate_content_stream` with tool calling and returns `usage_metadata`.
- Tool call detection is available in stream chunk inspection via the SDK's response parts.
