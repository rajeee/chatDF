# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Optimistic updates need onSettled invalidation**: When using TanStack Query optimistic updates, always `invalidateQueries` in `onSettled` (not `onSuccess`) to ensure consistency after both success and error paths.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on state that changes often (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **stream_chat pool parameter**: `stream_chat()` takes `pool` as an optional parameter (defaults to `None`). Tests must pass `pool=mock_pool` explicitly — patching the module-level `worker_pool` import does NOT affect the local `pool` parameter.
- **WS message compression breaks test assertions**: Backend uses compressed event type names (`tcs` not `tool_call_start`, `qs` not `query_status`). Tests must match the compressed field names (`tl` not `tool`).
- **AsyncMock vs MagicMock for awaitables**: When mocking `async` functions like `client.aio.models.generate_content_stream`, use `AsyncMock(side_effect=...)` not `MagicMock(side_effect=...)` — the latter can't be `await`ed.
