# Lessons Learned

## General Principles

- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **CSS custom properties for stagger animations**: Use `--stagger-index` via inline style + `animation-delay: calc(var(--stagger-index) * Xms)` — no JS timer logic needed.
- **Data shape heuristics work for chart detection**: Sample first 50 rows with a 70% threshold for type classification (numeric, date, categorical) to auto-detect chart types. Keep logic in a pure utility for easy testing.
