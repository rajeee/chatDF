# Lessons Learned

## General Principles

- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Data shape heuristics work for chart detection**: Sample first 50 rows with a 70% threshold for type classification (numeric, date, categorical) to auto-detect chart types. Keep logic in a pure utility for easy testing.
- **Simplify onboarding by reusing existing features**: Instead of building a new flow, wire CTAs to open existing modals. Less code, fewer tests, more consistent UX.
- **Backend response model != frontend type assumption**: When a Pydantic model wraps data (e.g., `_parse_schema_json` wrapping array in `{"columns": [...]}`), the frontend must match the actual serialized structure (`result.schema.columns`), not what the DB stores. Always verify the actual JSON response shape.
- **jsdom AbortController signal incompatibility**: `fetchWithTimeout` using `AbortController.signal` fails in jsdom with "signal is not of type AbortSignal". For tests that need to mock API calls through `fetchWithTimeout`, spy on `apiPost`/`apiGet` directly instead of using MSW.
