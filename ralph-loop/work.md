# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [x] **Gemini API 429 retry with backoff**: Done in iteration 104. Wrapped `generate_content_stream` with retry loop (3 retries, exponential backoff 2/4/8s). Raises `GeminiRateLimitError` with user-friendly message on exhaustion. 6 tests added.

