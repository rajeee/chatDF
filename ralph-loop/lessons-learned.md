# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **Polars SQLContext supports cross-table JOINs natively**: No need for DuckDB — Polars registers multiple lazy frames and handles JOINs, UNIONs, and subqueries in its SQL execution engine.
- **Consolidate duplicate endpoints early**: The /branch and /fork endpoints did the same thing with slightly different naming. Removing duplicates reduces test burden and confusion.
- **Dead code from removed features lingers**: After removing a feature (correlations), check worker functions, system prompt references, and frontend API functions for leftover code.
- **Test coverage gaps hide in plain sight**: Settings and share endpoints had zero test coverage despite being fully implemented. Audit test files against router endpoints regularly.
