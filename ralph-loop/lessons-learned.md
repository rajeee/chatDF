# Lessons Learned

## General Principles

- **Check existing code first**: Always search before building — features may already exist.
- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeletons, streaming placeholders, and micro-animations make the app *feel* faster.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **$1 budget is too low for a full iteration cycle**: Use $5 minimum for read → implement → test → commit.
- **Separate tiny stores for cross-cutting concerns**: A dedicated Zustand store keeps decoupled components (e.g., Header + WS hook) connected without prop drilling.
