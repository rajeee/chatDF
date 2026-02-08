# Potential Pitfalls

Risks and traps to watch for during improvement iterations.

## Architecture
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never proxy WS through Vite dev server.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.

## Frontend
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully (check existence, add if missing).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **Plotly.js is heavy (~1MB)**: Always lazy-load via `React.lazy()`. Never import directly at top-level. Mock with `vi.mock("react-plotly.js", ...)` in tests.
- **Checkbox + row onClick = double-toggle**: When a `<tr>` has onClick and contains a checkbox with onChange, clicking the checkbox fires both. Fix with `stopPropagation` on the checkbox's `<td>`.

## Testing
- **Fake timers and userEvent don't mix**: `vi.useFakeTimers()` with `userEvent.setup()` causes 5-second timeouts. Test immediate state instead.
- **jsdom ignores layout and media queries**: `offsetParent` is always null; `hidden lg:flex` means always hidden. Test class/attribute presence, not computed styles.
- **jsdom AbortController + MSW**: `fetchWithTimeout` with `AbortController.signal` fails in jsdom. Mock `apiPost`/`apiGet` directly with `vi.spyOn` instead of relying on MSW for tests that go through `fetchWithTimeout`.
