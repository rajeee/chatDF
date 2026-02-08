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
- **Plotly.js is heavy (~1MB)**: Always lazy-load via `React.lazy()`. Never import it directly at module top-level or the initial bundle will balloon. Mock it in tests with `vi.mock("react-plotly.js", ...)`.
- **Plotly types require @types/react-plotly.js**: The `Plotly.Data` and `Plotly.Layout` types come from `@types/plotly.js` (transitive dep). Don't forget the type package.
