# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Optimistic updates need onSettled invalidation**: When using TanStack Query optimistic updates, always `invalidateQueries` in `onSettled` (not `onSuccess`) to ensure consistency after both success and error paths.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **Textarea onBlur vs dropdown mouseDown timing**: When a textarea blur dismisses a dropdown, use `mouseDown` (not `click`) on dropdown items, or delay blur dismiss with setTimeout to let the click fire first.
- **Mock async store actions in beforeEach for all tests**: If a component auto-triggers async store actions (like `profileDataset`) via useEffect, mock those actions in the global `beforeEach` — not just in specific tests. Otherwise tests that don't mock will hang waiting for real API calls.
- **Subagent tool call cascading errors**: When launching subagents, file path typos in parallel Read calls cause "sibling tool call errored" cascades that waste all turns. For complex tasks, implement directly instead of delegating to subagents.
- **navigator.clipboard is readonly in jsdom**: Use `vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn() } })` instead of `Object.assign(navigator, ...)` for clipboard mocking in tests.
