# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **Theme transitions need transient class**: Don't add global `transition: all` permanently — use a transient class added/removed around the switch to avoid interfering with existing animations.
- **Use `border-transparent` for layout-stable borders**: Apply border class to ALL items with `border-transparent` for inactive ones to prevent layout shifts.
- **Exit animations need delayed removal**: Set CSS class immediately but delay DOM removal with `setTimeout` matching animation duration.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives with the sql_executions array.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM so it continues.
