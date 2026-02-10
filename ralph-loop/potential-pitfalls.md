# Potential Pitfalls

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.
- **Background task failures are silent**: `asyncio.create_task()` swallows exceptions. Always send a WS error event in the exception handler so the frontend doesn't wait forever.
- **Stale temp files from atomic rename**: When using write-to-temp → `os.replace`, process crashes leave `.download_` prefixed temp files. Add periodic cleanup based on mtime age.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **Zustand outside React**: WS event handlers run outside React render cycle — use `useStore.getState()` for Zustand access, not hooks.
- **Track ALL requestAnimationFrame IDs**: Any RAF callback that calls setState must have its ID stored in a ref so it can be cancelled on unmount. Orphaned RAFs cause errors in tests and memory leaks in production.
