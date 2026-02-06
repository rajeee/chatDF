---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# LLM Integration Test Plan

## Fixtures (`tests/llm/conftest.py`)

### `mock_gemini_client` — Mocked Google GenAI client

```python
@pytest.fixture
def mock_gemini_client(monkeypatch):
    mock_client = MagicMock()
    # Mock streaming response with text chunks
    mock_stream = AsyncMock()
    mock_stream.__aiter__ = MagicMock(return_value=iter([
        MockChunk(text="Hello "),
        MockChunk(text="world"),
    ]))
    mock_stream.usage_metadata = MockUsage(prompt_token_count=50, candidates_token_count=10)
    mock_client.models.generate_content_stream = MagicMock(return_value=mock_stream)
    monkeypatch.setattr("app.services.llm_service.client", mock_client)
    return mock_client
```

### `MockChunk` helper — Simulates Gemini stream chunks

```python
@dataclass
class MockChunk:
    text: str | None = None
    tool_call: dict | None = None
    # Simulates either a text part or a function_call part
```

### `mock_ws_send` — Captures WebSocket events

```python
@pytest.fixture
def mock_ws_send():
    sent = []
    async def send(event_type, data):
        sent.append({"type": event_type, **data})
    send.messages = sent
    return send
```

### `sample_datasets` — Datasets for system prompt

```python
@pytest.fixture
def sample_datasets():
    return [
        {"name": "table1", "schema_json": '[{"name": "id", "type": "Int64"}, {"name": "city", "type": "Utf8"}]'},
        {"name": "table2", "schema_json": '[{"name": "id", "type": "Int64"}, {"name": "sales", "type": "Float64"}]'},
    ]
```

## Test Implementation by Scenario

### System Prompt Tests (`test_system_prompt.py`)

Tests: [test.md#PROMPT-1 through PROMPT-4](./test.md)

| Scenario | Approach |
|----------|----------|
| PROMPT-1 | Call `build_system_prompt(sample_datasets)`. Assert output contains both table names and their column schemas. |
| PROMPT-2 | Build prompt with 1 dataset, then with 2. Assert second prompt includes both schemas. |
| PROMPT-3 | Build prompt with 2 datasets, then with 1 (simulating removal). Assert removed dataset absent. |
| PROMPT-4 | Call `build_system_prompt([])`. Assert prompt contains instructions to suggest adding a dataset. |

These tests call `build_system_prompt` directly — no Gemini mock needed.

### Tool Call Tests (`test_tool_calls.py`)

Tests: [test.md#TOOL-1 through TOOL-4](./test.md)

**TOOL-1** (`execute_sql`):
- Configure `mock_gemini_client` to return a stream with a `function_call` chunk for `execute_sql(query="SELECT * FROM table1")`.
- Mock `worker_pool.run_query` to return rows.
- Call `stream_chat`. Assert `run_query` called with the SQL string. Assert tool result sent back to Gemini.

**TOOL-2** (`load_dataset`):
- Configure stream with `function_call` for `load_dataset(url="https://example.com/data.parquet")`.
- Mock `dataset_service.add_dataset` to return success.
- Assert `add_dataset` called. Assert tool result sent back to Gemini.

**TOOL-3** (multiple tool calls):
- Configure stream to produce two sequential `function_call` chunks (e.g., `execute_sql` twice).
- Assert both executed in order. Assert final response incorporates both results.

**TOOL-4** (max 5 tool calls):
- Configure stream to produce 6 tool calls.
- Assert only first 5 executed. Assert 6th not dispatched. Assert LLM forced to respond without more tools.
- Verify by checking call count on `worker_pool.run_query`.

### Streaming Tests (`test_streaming.py`)

Tests: [test.md#STREAM-1 through STREAM-4](./test.md)

| Scenario | Approach |
|----------|----------|
| STREAM-1 | Configure mock to return 3 text chunks. Call `stream_chat`. Assert `mock_ws_send.messages` contains 3 `chat_token` events with matching text. |
| STREAM-2 | Configure mock: text chunk, then tool call chunk. Assert streaming pauses (no more `chat_token` events until tool completes). |
| STREAM-3 | After tool call, configure second mock response with more text. Assert streaming resumes with new `chat_token` events. Assert `chat_complete` sent at end. |
| STREAM-4 | Call `stream_chat`, then trigger cancellation (simulate stop). Assert partial response saved. Assert `chat_complete` NOT in `mock_ws_send.messages`. |

For STREAM-4, use an `asyncio.Event` to simulate cancellation mid-stream. The `stream_chat` function should check a cancellation flag between chunks.

### Error Self-Correction Tests (`test_error_correction.py`)

Tests: [test.md#ERR-CORRECT-1 through ERR-CORRECT-4](./test.md)

| Scenario | Approach |
|----------|----------|
| ERR-CORRECT-1 | Mock `execute_sql` tool call, mock worker to return SQL error. Assert error sent back to Gemini as tool response (check the contents list passed to the second `generate_content_stream` call). |
| ERR-CORRECT-2 | Mock worker to fail 3 times consecutively. Assert `stream_chat` stops retrying after 3rd failure. Check `sql_retry_count` or verify only 3 calls to `run_query`. |
| ERR-CORRECT-3 | Parameterize with different error types (missing column, type mismatch, syntax error). Assert each error forwarded to Gemini with descriptive message. |
| ERR-CORRECT-4 | After 3 failures, assert the final Gemini call includes a system message instructing it to explain the error. Assert response is user-facing text (not another tool call). |

### Token Counting Tests (`test_token_counting.py`)

Tests: [test.md#TOKEN-1 through TOKEN-3](./test.md)

| Scenario | Approach |
|----------|----------|
| TOKEN-1 | Call `stream_chat` with mocked response. Assert returned `StreamResult` has correct `input_tokens` and `output_tokens` matching mock's `usage_metadata`. |
| TOKEN-2 | Mock Gemini to raise an exception after partial streaming. Assert tokens consumed before failure are still counted in the result. |
| TOKEN-3 | Verify `mock_ws_send.messages` includes a `chat_complete` event with `token_count` field matching the sum. |

For multi-call scenarios (tool calls cause multiple Gemini API calls), assert tokens are summed across all calls.

### Context Management Tests (`test_context.py`)

Tests: [test.md#CONTEXT-1 through CONTEXT-3, EDGE-1 through EDGE-3](./test.md)

| Scenario | Approach |
|----------|----------|
| CONTEXT-1 | Pass 10 messages. Inspect the `contents` argument to `generate_content_stream`. Assert all 10 messages present in order. |
| CONTEXT-2 | Pass 55 messages. Assert only the most recent 50 passed to Gemini. |
| CONTEXT-3 | Pass 55 messages. Assert system prompt (via `system_instruction` config) reflects current datasets, not affected by pruning. |
| EDGE-1 | Include a parquet URL in a user message. Assert `load_dataset` tool call dispatched. |
| EDGE-2 | Mock Gemini to raise a 500 error. Assert `chat_error` sent via WebSocket. |
| EDGE-3 | Mock Gemini to timeout. Assert `chat_error` sent, tokens up to timeout counted. |

## Scope

### In Scope
- All LLM test scenarios from llm/test.md
- Testing `llm_service.py` and `chat_service.py` orchestration
- Mock Gemini client at SDK boundary
- WebSocket event verification via captured messages

### Out of Scope
- Worker pool execution (mocked; see worker/test_plan.md)
- Rate limit enforcement (tested separately; see rate_limiting/test_plan.md)
- Real Gemini API calls (always mocked in unit/integration tests)
