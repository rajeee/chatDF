---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# LLM Integration Specification

## Scope

### In Scope
- Gemini API interaction
- Tool calling (SQL execution)
- System prompt construction
- Streaming behavior
- Error self-correction
- Token counting

### Out of Scope
- SQL execution mechanics (see worker/spec.md)
- Rate limiting enforcement (see rate_limiting/spec.md)
- WebSocket message delivery (see websocket/spec.md)

### Assumptions
- Google Gemini 2.5 Flash is the only LLM provider (V1)
- Server-side API key only — no user-provided keys

## Behavior

### Provider
- Google Gemini 2.5 Flash
- Server-side API key configured via environment variable (`GEMINI_API_KEY`)
- No fallback provider

### Tool Calling
- Two tools defined:
  1. `execute_sql(query: str) -> str` — Execute SQL against loaded datasets
  2. `load_dataset(url: str) -> str` — Load a parquet dataset from URL (for auto-loading URLs from chat)
- SQL tool flow:
  1. LLM generates a SQL query via tool call
  2. Backend intercepts tool call, sends SQL to worker for execution
  3. Worker returns results (or error)
  4. Results formatted as string and returned to LLM as tool response
  5. LLM uses results to formulate human-readable answer
- LLM can call the tool multiple times per turn (e.g., explore data structure first, then answer)
- Maximum tool calls per turn: 5 (to prevent runaway loops)

### System Prompt
- Constructed dynamically per request, includes:
  - Role: "You are a data analyst assistant. Help users understand and explore their data."
  - All loaded dataset schemas:
    - Table name
    - Columns with user-friendly types
  - Instructions:
    - Use the provided table names as-is in SQL queries
    - Explore data before answering when uncertain (check column values, types)
    - SQL dialect: Polars SQL (note any differences from standard SQL)
    - Always use LIMIT 1000 on result sets
    - Return concise, helpful answers
    - If no datasets loaded: tell user to add a dataset, or use `load_dataset` tool if user provides a URL in their message
    - If user's message contains a parquet URL: automatically load it via `load_dataset` tool before answering
  - Current dataset context only (no datasets from other conversations)

### Conversation Context
- Full message history sent to Gemini each turn
- Maximum 50 messages retained per conversation
- When limit exceeded: oldest messages pruned (keeping system prompt fresh)
- Messages include both user messages and assistant responses

### Streaming
- Use Gemini streaming API for response generation
- Each token forwarded to frontend via WebSocket `chat_token` message
- Stream continues until:
  - Response complete → `chat_complete` sent
  - Tool call detected → stream paused, tool executed, then resumed
  - User cancels → stream aborted, partial response preserved
  - Error occurs → `chat_error` sent

### Error Self-Correction
- If SQL execution fails:
  1. Error message sent back to LLM as tool response
  2. LLM can retry with a modified query
  3. Maximum 3 retry attempts per turn
  4. After 3 failures: LLM instructed to explain the error to the user
- Error types the LLM receives: SQL syntax errors, missing columns, type mismatches

### Token Counting
- Track input tokens + output tokens per request from Gemini response metadata
- Token counts recorded in `token_usage` table after each completed request
- Both successful and failed requests count toward usage
- Token count included in `chat_complete` message to frontend

### Safety
- No user-provided API keys
- No prompt injection mitigation beyond standard Gemini safety settings (V1)
- LLM cannot access filesystem, network, or any resource beyond the provided tool
