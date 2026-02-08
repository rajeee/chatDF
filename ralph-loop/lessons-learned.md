# Lessons Learned

## General Principles

- **Small, atomic changes**: Each iteration should be one focused improvement, not a grab bag.
- **User-visible wins**: Prioritize changes that users can see and feel immediately.
- **Check existing code first**: Multiple times, features were already implemented (WS auto-reconnect, optimistic updates, confirmation dialogs, empty states). Always search before building.
- **CSS-only solutions are free wins**: `content-visibility`, smooth scrolling, transitions, and responsive padding carry zero JS overhead and no test burden.
- **Perceived performance > actual performance**: Skeleton loading, send-button pulse, and streaming placeholders make the app *feel* faster even when actual timing is unchanged.
- **Inline SVG icons are effectively free**: Zero network requests, resolution-independent, theme-aware via `currentColor`, ~50-100 bytes each.
- **Extract patterns only when justified**: Only extract code when files are >700 lines, logic is truly reusable, or testing would be simpler in isolation.
- **Test structure, not browser behavior**: Test for class presence, attribute existence, and DOM structure rather than actual animations/scrolling/layout (jsdom can't compute these).
- **Zero-dependency accessibility**: Custom `useFocusTrap` hook is ~30 lines vs react-focus-lock at 10KB+ gzipped. Prefer lightweight custom implementations for simple a11y patterns.
- **Zustand selective subscriptions beat React.memo**: Isolating fine-grained state subscriptions at the component level is more powerful than memoization for preventing re-renders.
- **$1 budget is too low for a full iteration cycle**: Use $5 minimum for read → implement → test → commit.
