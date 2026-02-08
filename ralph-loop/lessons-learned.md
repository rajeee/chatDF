# Lessons Learned

## General Principles

- **Check existing code first**: Multiple times, features were already implemented. Always search before building.
- **CSS-only solutions are free wins**: `content-visibility`, transitions, responsive padding — zero JS overhead, no test burden.
- **Perceived performance > actual performance**: Skeleton loading, streaming placeholders, and send-button pulse make the app *feel* faster.
- **Test structure, not browser behavior**: Test for class presence, attribute existence, and DOM structure — jsdom can't compute layout/animations.
- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **$1 budget is too low for a full iteration cycle**: Use $5 minimum for read → implement → test → commit.
