# Potential Pitfalls

Risks and traps to watch for during improvement iterations.

## Architecture Pitfalls
- **Bun WS proxy**: Bun doesn't support http-proxy WebSocket upgrades. Never try to proxy WS through Vite dev server.
- **No node binary**: System uses Bun exclusively. All npm scripts must use `~/.bun/bin/bun`.
- **Worker pool process isolation**: Data workers run in separate processes — can't share in-memory state with FastAPI.
- **SQLite single-writer**: Only one write transaction at a time. Concurrent writes will queue/fail.

## Frontend Pitfalls
- **WS events before HTTP responses**: Backend sends WS events before returning HTTP response. Must handle gracefully.
- **Zustand getState() in callbacks**: Using `store.getState()` inside event handlers is correct pattern (avoids stale closures).
- **Streaming token race**: `chat_token` events arrive before `chat_complete`. Must create placeholder message on first token.
- **CodeMirror + React**: CodeMirror manages its own DOM. Be careful with React re-renders interfering.

## Testing Pitfalls
- **340 tests must pass**: Never commit code that breaks existing tests. Run full suite before committing.
- **Playwright needs running servers**: E2E tests need both backend (8000) and frontend (5173) running.
- **MSW handlers**: API mocks must match current API contract exactly.
- **Dynamic imports in tests**: Vitest doesn't handle dynamic imports well without special config. Prefer static imports or use test mocks for lazy loading.

## Performance Pitfalls
- **Don't add heavy dependencies**: Bundle size matters. Prefer CSS solutions over JS libraries.
- **React re-render cascades**: Zustand store updates trigger re-renders in all subscribers. Keep store slices focused.
- **Large Polars DataFrames**: Some datasets can be 100k+ rows. Always paginate/virtualize.

## Scope Pitfalls
- **Stay focused on polish**: Don't add new major features (auth providers, new data sources, etc.)
- **Don't refactor for the sake of refactoring**: Each change must have measurable user benefit.
- **Preserve existing behavior**: All improvements must be backwards-compatible with current UX.
