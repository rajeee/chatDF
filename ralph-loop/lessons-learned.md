# Lessons Learned

## General Principles

- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Separate tiny stores for cross-cutting concerns**: A dedicated Zustand store keeps decoupled components (e.g., Header + WS hook) connected without prop drilling.
- **Global focus-visible beats per-component focus styles**: A single CSS rule in globals.css (`*:focus-visible { outline: ... }`) gives consistent keyboard focus to every interactive element.
