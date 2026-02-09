# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Optimistic updates need onSettled invalidation**: When using TanStack Query optimistic updates, always `invalidateQueries` in `onSettled` (not `onSuccess`) to ensure consistency after both success and error paths.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **File export via backend keeps frontend lean**: For binary format exports (XLSX), POST data to a backend endpoint that returns `StreamingResponse` with proper Content-Disposition headers, rather than adding heavy JS libraries to the frontend bundle.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. The SDK's built-in retry isn't surfaced through exceptions — implement your own retry loop.
- **"Last mile" integrations are high ROI**: When backend endpoints exist but lack frontend UI, wiring them up is low-effort/high-impact. Always check for unused backend capabilities before building new ones.
