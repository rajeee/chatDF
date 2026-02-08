# Lessons Learned

## General Principles

- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Data shape heuristics work for chart detection**: Sample first 50 rows with a 70% threshold for type classification (numeric, date, categorical) to auto-detect chart types. Keep logic in a pure utility for easy testing.
- **Simplify onboarding by reusing existing features**: Instead of building a new sample-data-loading flow, wire the CTA button to open an existing modal (preset sources). Less code, fewer tests, more consistent UX.
