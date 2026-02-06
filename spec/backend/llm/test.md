---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# LLM Integration Test Specification

Tests: [llm/spec.md](./spec.md)

## Scope

### In Scope
- System prompt construction and dynamic updates
- Tool calling (execute_sql, load_dataset)
- Streaming behavior and interruption
- Error self-correction loop
- Token counting and recording
- Conversation context management

### Out of Scope
- Worker SQL execution mechanics (see worker/test.md)
- WebSocket message delivery (see websocket/test.md)
- Rate limit enforcement (see rate_limiting/test.md)

---

## Test Scenarios

### PROMPT-1: System Prompt Includes Dataset Schemas
Tests: [spec.md#system-prompt](./spec.md#system-prompt)

- Scenario: User has two datasets loaded in a conversation
- Expected: System prompt sent to Gemini includes both dataset schemas (table name, columns with types) and instructions for SQL usage

### PROMPT-2: System Prompt Updates on Dataset Added
Tests: [spec.md#system-prompt](./spec.md#system-prompt)

- Scenario: A new dataset is loaded mid-conversation
- Expected: Next LLM request includes the new dataset's schema in the system prompt

### PROMPT-3: System Prompt Updates on Dataset Removed
Tests: [spec.md#system-prompt](./spec.md#system-prompt)

- Scenario: A dataset is removed from the conversation
- Expected: Next LLM request excludes the removed dataset's schema from the system prompt

### PROMPT-4: No Datasets Loaded
Tests: [spec.md#system-prompt](./spec.md#system-prompt)

- Scenario: Conversation has no datasets loaded
- Expected: System prompt instructs LLM to suggest adding a dataset, or to use load_dataset if user provides a URL

---

### TOOL-1: execute_sql Tool Call
Tests: [spec.md#tool-calling](./spec.md#tool-calling)

- Scenario: LLM decides to execute a SQL query via execute_sql tool
- Expected: SQL query sent to worker, worker results returned to LLM as tool response, LLM uses results to formulate answer

### TOOL-2: load_dataset Tool Call
Tests: [spec.md#tool-calling](./spec.md#tool-calling)

- Scenario: LLM detects a parquet URL in user's message and calls load_dataset tool
- Expected: Dataset validation pipeline triggered, dataset added to conversation, confirmation returned to LLM as tool response

### TOOL-3: Multiple Tool Calls Per Turn
Tests: [spec.md#tool-calling](./spec.md#tool-calling)

- Scenario: LLM calls execute_sql multiple times in one turn (e.g., explore schema then query)
- Expected: Each tool call executed sequentially, results returned to LLM, final answer incorporates all results

### TOOL-4: Maximum 5 Tool Calls Per Turn
Tests: [spec.md#tool-calling](./spec.md#tool-calling)

- Scenario: LLM attempts more than 5 tool calls in a single turn
- Expected: After 5th tool call, no more tool calls executed, LLM forced to produce a response with available information

---

### STREAM-1: Tokens Forwarded via WebSocket
Tests: [spec.md#streaming](./spec.md#streaming)

- Scenario: LLM generates a streaming response
- Expected: Each token forwarded to frontend via WebSocket chat_token message in real time

### STREAM-2: Stream Pause on Tool Call
Tests: [spec.md#streaming](./spec.md#streaming)

- Scenario: LLM stream produces a tool call mid-response
- Expected: Token streaming paused, tool executed in worker, results returned to LLM, streaming resumes with tool response incorporated

### STREAM-3: Stream Resume After Tool Execution
Tests: [spec.md#streaming](./spec.md#streaming)

- Scenario: Tool call completes and LLM continues generating
- Expected: Streaming resumes, subsequent tokens forwarded via WebSocket, final chat_complete sent

### STREAM-4: User Cancels Stream
Tests: [spec.md#streaming](./spec.md#streaming)

- Scenario: User sends stop request while LLM is streaming
- Expected: Stream aborted, partial response preserved as assistant message in messages table, chat_complete not sent (stream was cancelled)

---

### ERR-CORRECT-1: SQL Error Sent Back to LLM
Tests: [spec.md#error-self-correction](./spec.md#error-self-correction)

- Scenario: execute_sql returns a SQL syntax error
- Expected: Error message returned to LLM as tool response, LLM retries with a modified query

### ERR-CORRECT-2: Retry Up to 3 Times
Tests: [spec.md#error-self-correction](./spec.md#error-self-correction)

- Scenario: LLM's SQL query fails 3 consecutive times
- Expected: After 3rd failure, LLM instructed to explain the error to the user rather than retry

### ERR-CORRECT-3: Different Error Types
Tests: [spec.md#error-self-correction](./spec.md#error-self-correction)

- Scenario: SQL fails with various error types (missing column, type mismatch, syntax error)
- Expected: Each error type sent to LLM as descriptive tool response, LLM can attempt correction for each

### ERR-CORRECT-4: After 3 Failures LLM Explains
Tests: [spec.md#error-self-correction](./spec.md#error-self-correction)

- Scenario: 3 SQL retries exhausted
- Expected: LLM generates a user-friendly explanation of the error instead of retrying again

---

### TOKEN-1: Token Counting Per Request
Tests: [spec.md#token-counting](./spec.md#token-counting)

- Scenario: LLM request completes successfully
- Expected: Input tokens + output tokens extracted from Gemini response metadata, recorded in token_usage table with user_id, model_name, and timestamp

### TOKEN-2: Failed Requests Count Toward Usage
Tests: [spec.md#token-counting](./spec.md#token-counting)

- Scenario: LLM request fails (API error, timeout)
- Expected: Any tokens consumed before failure still recorded in token_usage table

### TOKEN-3: Token Count in chat_complete
Tests: [spec.md#token-counting](./spec.md#token-counting)

- Scenario: LLM response completes
- Expected: chat_complete WebSocket message includes token_count field

---

### CONTEXT-1: Full History Sent to Gemini
Tests: [spec.md#conversation-context](./spec.md#conversation-context)

- Scenario: Conversation has 10 messages (user + assistant)
- Expected: All 10 messages sent to Gemini as conversation context, in chronological order

### CONTEXT-2: Maximum 50 Messages
Tests: [spec.md#conversation-context](./spec.md#conversation-context)

- Scenario: Conversation has 55 messages
- Expected: Only the most recent 50 messages sent to Gemini, oldest 5 pruned

### CONTEXT-3: System Prompt Always Fresh
Tests: [spec.md#conversation-context](./spec.md#conversation-context)

- Scenario: Messages pruned due to 50-message limit
- Expected: System prompt is regenerated fresh (not pruned), reflects current dataset state

---

### EDGE-1: URL in User Message
Tests: [spec.md#system-prompt](./spec.md#system-prompt)

- Scenario: User message contains a parquet URL like "https://example.com/data.parquet"
- Expected: LLM calls load_dataset tool to load the URL before answering

### EDGE-2: Gemini API Error
Tests: [spec.md#provider](./spec.md#provider)

- Scenario: Gemini API returns a 5xx error or times out
- Expected: chat_error sent via WebSocket with descriptive error, connection maintained

### EDGE-3: Gemini API Timeout
Tests: [spec.md#provider](./spec.md#provider)

- Scenario: Gemini API does not respond within timeout period
- Expected: Request cancelled, chat_error sent to client, tokens consumed up to that point still counted
