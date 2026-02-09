# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Correlated COUNT subqueries → pre-aggregated LEFT JOIN**: For list endpoints with counts, use `LEFT JOIN (SELECT id, COUNT(*) ... GROUP BY id)` instead of correlated subqueries per row.
- **Use `border-transparent` for layout-stable borders**: Apply border class to ALL items with `border-transparent` for inactive ones to prevent layout shifts.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Test mocks must export all used symbols**: When `vi.mock()` overrides a module, use `importOriginal` or manually include all imported symbols in the mock.
- **Stagger animations via CSS custom properties**: Use `--stagger-index` inline style + `animation-delay: calc(var(--stagger-index) * Xms)` for cascade effects. Cap stagger count to keep total animation time under 500ms.
- **Loading phase state exists but is underused**: `chatStore.loadingPhase` only gets set to "thinking" — backend doesn't send phase changes via WS. UI indicators should work with what's available rather than assuming multi-phase support.
