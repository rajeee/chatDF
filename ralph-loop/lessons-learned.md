# Lessons Learned

## General Principles

- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **CSS custom properties for stagger animations**: Use `--stagger-index` set via inline style + `animation-delay: calc(var(--stagger-index) * Xms)` for cascading entrance effects — no JS timer logic needed.
