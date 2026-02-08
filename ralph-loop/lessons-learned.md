# Lessons Learned

## General Principles

- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **CSS custom properties for stagger animations**: Use `--stagger-index` set via inline style + `animation-delay: calc(var(--stagger-index) * Xms)` for cascading entrance effects — no JS timer logic needed.
- **Lazy-load heavy libraries**: Use `React.lazy()` + `Suspense` for large deps like Plotly.js (~1MB). Keeps initial bundle small while still providing rich functionality on demand.
- **Data shape heuristics work well for chart detection**: Sampling first 50 rows with a 70% threshold for type classification (numeric, date, categorical) reliably auto-detects appropriate chart types. Keep the logic in a pure utility for easy testing.
- **Mock heavy chart libraries in tests**: `vi.mock("react-plotly.js", ...)` with a simple div avoids loading the full Plotly bundle during unit tests.
