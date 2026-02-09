# Potential Pitfalls

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **Zustand outside React**: WS event handlers run outside React render cycle — use `useStore.getState()` for Zustand access, not hooks.

## Testing
- **CodeMirror in tests**: Mock `useEditableCodeMirror` hook in jsdom tests — CodeMirror needs real DOM.

## Naming Conflicts
- **`settings` module vs `settings` variable**: In `main.py`, `from app.routers import settings` gets shadowed by `settings = get_settings()`. Always alias router imports.
