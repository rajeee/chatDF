# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **Use `border-transparent` for layout-stable borders**: Apply border class to ALL items with `border-transparent` for inactive ones to prevent layout shifts.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Optimistic updates need onSettled invalidation**: When using TanStack Query optimistic updates (`onMutate` → `setQueryData`), always `invalidateQueries` in `onSettled` (not `onSuccess`) to ensure consistency after both success and error paths.
- **useQueryClient in hooks needs test wrapper**: When adding `useQueryClient()` to a custom hook, all tests using `renderHook()` need a `QueryClientProvider` wrapper or they'll fail with a missing context error.
