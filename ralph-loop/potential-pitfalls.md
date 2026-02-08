# Potential Pitfalls

Risks and traps to watch for during improvement iterations.

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **No node binary**: System uses Bun exclusively. All scripts must use `~/.bun/bin/bun`.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.
- **SQLite single-writer**: Only one write transaction at a time. Concurrent writes will queue/fail.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **CodeMirror + React**: CodeMirror manages its own DOM. Be careful with React re-renders interfering.
- **Fake timers and userEvent don't mix**: `vi.useFakeTimers()` with `userEvent.setup()` causes 5-second timeouts. Test immediate state instead.
- **jsdom offsetParent is always null**: Don't use `el.offsetParent` to filter hidden elements in tests — jsdom doesn't compute layout.
- **jsdom ignores media queries**: `hidden lg:flex` means always hidden in tests. Use single-element responsive pattern with conditional classes based on state.

## Testing
- **Playwright needs running servers**: E2E tests need both backend (8000) and frontend (5173) running.
- **Dynamic imports in tests**: Vitest doesn't handle dynamic imports well. Prefer static imports or mocks.
- **Pre-existing test failures (~60)**: API client/routing tests broken since iteration 18's timeout/AbortSignal implementation. Don't waste time debugging these unless specifically tasked.

## Loop Stability
- **Claude CLI can hang silently**: Use `timeout` command to cap each claude invocation to ~15 minutes max.
