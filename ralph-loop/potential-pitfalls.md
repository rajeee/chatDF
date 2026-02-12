# Potential Pitfalls

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.
- **Background task failures are silent**: `asyncio.create_task()` swallows exceptions. Always send a WS error event in the exception handler so the frontend doesn't wait forever.
- **Polars OOM in tests**: Large SQL expressions (2000+ OR conditions, 2500+ columns) cause 9+ GB allocation → OOM kill on the 11 GB VPS. Cap test SQL at ~100 conditions/columns.
- **SSRF via dataset URLs**: Users can submit arbitrary URLs. `_validate_url_safety` rejects private/loopback IPs and non-HTTP schemes. Ensure this check stays in `fetch_and_validate`.
- **Playwright config requires explicit declaration**: `globalSetup`/`globalTeardown` files must be referenced via config keys — just having the files exist isn't enough.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **Zustand outside React**: WS event handlers run outside React render cycle — use `useStore.getState()`, not hooks.
- **Track ALL requestAnimationFrame IDs**: Any RAF callback that calls setState must have its ID stored in a ref so it can be cancelled on unmount.
