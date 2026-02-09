# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] **Dev Mode — Full LLM Visibility & Controls (HIGH PRIORITY, MULTI-PART)**: Implement a comprehensive dev mode for ChatDF. This is a large feature — break it into parallel subagents where possible. Read all details carefully before starting.

  **1. Dev Mode Toggle**:
  - Add a toggle in the left sidebar to enable/disable dev mode. ON by default.
  - Store the preference in the database (per-user setting, not just localStorage) so it persists across sessions.
  - When dev mode is on, all the features below are active.

  **2. Pre-Send Prompt Inspector**:
  - Before the user hits Send, they should be able to open a modal (button near the send button, only visible in dev mode) that shows EXACTLY what will be sent to the Gemini API — the full prompt payload including: system prompt, conversation history, tool declarations, and the new user message.
  - Show it in a readable, syntax-highlighted format (JSON or structured view).
  - Show estimated input token count.

  **3. Raw Response Inspector (per message)**:
  - Under every assistant response (in dev mode), show an expandable section with the COMPLETE raw model output including:
    - All intermediate tool calls (function name + full input arguments)
    - All tool call results/outputs
    - Thinking/reasoning tokens if present
    - The final text response
    - Display as a collapsible timeline: User Message → LLM Response → Tool Call 1 → Tool Result 1 → LLM Response 2 → Tool Call 2 → ... → Final Response
  - This requires the backend to SAVE all intermediate tool calls and results. Currently the tool-call loop in `llm_service.py`/`chat_service.py` processes these but may not persist them. Add a new field or table to store the full tool-call trace per message.
  - Send this trace data to the frontend via WS (new event type) or include it in the message data.

  **4. Token Usage Display**:
  - Show input tokens and output tokens for each assistant message (in dev mode), formatted as "X.XXM in / Y.YYM out" or similar compact format.
  - The Gemini API response includes `usage_metadata` with `prompt_token_count` and `candidates_token_count` — capture these and store per message.
  - Show cumulative token usage for the conversation somewhere visible.

  **5. Model Switcher**:
  - Add a model selector (dropdown) in the left sidebar or header (visible in dev mode).
  - Options: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, etc.
  - Save the selected model in the database (per-user or global setting) so it persists.
  - The backend should read this setting and use it for all subsequent LLM calls instead of the hardcoded model.

  **6. Redo Turn**:
  - Add a "Redo" button on each assistant message (visible in dev mode).
  - Clicking it deletes that assistant message and re-sends the preceding user message to the LLM, generating a new response.
  - Combined with the model switcher, this lets the user redo a turn with a different model.
  - Backend needs an endpoint or mechanism to: delete the last assistant message, re-process the user message.

  **Implementation notes**:
  - Backend changes needed in: `llm_service.py` (capture full trace + token usage), `chat_service.py` (persist trace data, support redo), `models.py` or new table (store trace, user settings), new/updated endpoints.
  - Frontend changes: dev mode context/store, sidebar toggle, pre-send modal, raw response viewer component, token badges, model dropdown, redo button.
  - DO NOT PRUNE THIS TASK. It is human-injected and high priority.
