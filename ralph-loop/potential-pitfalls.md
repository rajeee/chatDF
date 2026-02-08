# Potential Pitfalls

Risks and traps to watch for during improvement iterations.

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **No node binary**: System uses Bun exclusively. All scripts must use `~/.bun/bin/bun`.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **CodeMirror + React**: CodeMirror manages its own DOM. Be careful with React re-renders interfering.

## Testing
- **Fake timers and userEvent don't mix**: `vi.useFakeTimers()` with `userEvent.setup()` causes 5-second timeouts. Test immediate state instead.
- **jsdom ignores layout and media queries**: `offsetParent` is always null; `hidden lg:flex` means always hidden. Test class/attribute presence, not computed styles.
- **Pre-existing test failures (~60)**: API client/routing tests broken since iteration 18. Don't debug unless specifically tasked.

## Loop Stability
- **Claude CLI can hang silently**: Use `timeout` command to cap each invocation to ~15 minutes max.
