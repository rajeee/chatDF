# Potential Pitfalls

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.
- **Background task failures are silent**: `asyncio.create_task()` swallows exceptions. Always add `task.add_done_callback()` and send a WS error event so the frontend doesn't wait forever.
- **Polars OOM in tests**: Large SQL expressions (2000+ OR conditions, 2500+ columns) cause 9+ GB allocation → OOM kill on the 11 GB VPS. Cap test SQL at ~100 conditions/columns.
- **SSRF via dataset URLs**: `_validate_url_safety` rejects private/loopback IPs and non-HTTP schemes. Ensure this check stays in `fetch_and_validate`.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **Zustand outside React**: WS event handlers run outside React render cycle — use `useStore.getState()`, not hooks.
- **Track ALL requestAnimationFrame IDs**: Any RAF callback that calls setState must have its ID stored in a ref so it can be cancelled on unmount.
- **Dead exception classes accumulate**: Custom exception classes with registered handlers but no raise sites are noise. Periodically audit `exceptions.py` against actual usage.
