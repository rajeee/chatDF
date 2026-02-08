# Lessons Learned

Insights accumulated through improvement iterations.

## Iteration Log

### Iteration 1 (2026-02-08)
- **$1 budget is too low** for a full cycle (read files → implement → test → commit). Bumped to $5.
- **ErrorBoundary SVG test**: Don't query SVGs with `role="img"` — they don't have it by default. Use `container.querySelector("svg")` instead.
- **window.location mocking in vitest**: `Object.defineProperty` needs `configurable: true` and a proper setter for `href`.
- **Backend pytest needs uv pip install**: The venv doesn't have pip, use `uv pip install` instead.
- **Backend has pre-existing test failure**: `test_messages_table_structure` fails — not related to frontend changes. Tracked separately.

### Iteration 2 (2026-02-08)
- **Zustand persist middleware**: Use `partialize` option to selectively persist only certain state fields. Perfect for separating persistent UI preferences from ephemeral modal state.
- **localStorage test pattern**: Access persisted data via `JSON.parse(localStorage.getItem("store-name") || "{}").state.fieldName` in tests.
- **uv.lock from previous session**: Found uncommitted `uv.lock` change from prior work. Committed alongside iteration changes per workflow rules.

### Iteration 3 (2026-02-08)
- **CSS animations for polish**: Simple keyframe animations (slide-up fade-in) make the UI feel more responsive without heavyweight dependencies. Keep duration short (0.3s) for snappiness.
- **Animation testing**: Test for class presence rather than actual animation behavior - animations are browser-dependent and hard to test reliably in jsdom.
- **One focused change wins**: Adding animation to message appearance is high impact for minimal effort - users immediately notice and appreciate the polish.

### Iteration 4 (2026-02-08)
- **Smooth pulsing > bouncing**: Replaced basic bouncing dots with smooth pulsing animation (scale + opacity). Feels more modern and polished like Slack/Discord typing indicators.
- **CSS animation stagger**: Use nth-child selectors with animation-delay to create staggered wave effect across multiple dots.
- **Existing tests may cover new implementation**: The streaming-indicator testid was preserved, so existing tests passed. Added specific test for new dot structure.

### Iteration 5 (2026-02-08)
- **requestAnimationFrame for smooth scrolling**: Using requestAnimationFrame to batch scroll updates during streaming prevents jarring jumps and aligns scrolling with browser repaints for smoother UX.
- **CSS scroll-behavior: smooth**: Adding native CSS smooth scrolling to the html element provides browser-optimized scroll behavior that works across all scroll operations.
- **Cancel pending animations**: Track requestAnimationFrame IDs and cancel pending scrolls before scheduling new ones to avoid scroll animation conflicts.
- **Test RAF usage**: Mock requestAnimationFrame in tests to verify the optimization is applied during streaming.

### Iteration 6 (2026-02-08)
- **React.memo for list items**: Wrapping list item components (MessageBubble, DatasetCard) with React.memo prevents unnecessary re-renders when sibling items change or when parent re-renders due to unrelated state.
- **Dynamic import limitations in vitest**: Attempted lazy loading of CodeMirror with dynamic imports, but vitest doesn't handle them well in tests. Lazy loading via dynamic imports needs special test configuration or mocking. Marked as blocked.
- **Test memoization**: Can verify React.memo wrapping by checking `Component.$$typeof.toString()` contains "react.memo" in tests.
- **Performance wins without complexity**: React.memo is zero-cost abstraction - adds no bundle size, no runtime overhead, just prevents wasteful re-renders. High impact for minimal effort.

### Iteration 7 (2026-02-08)
- **content-visibility: auto for off-screen rendering**: Modern CSS property that allows browsers to skip rendering work for elements outside the viewport. Dramatically improves performance for long conversation histories with hundreds of messages.
- **contain-intrinsic-size with content-visibility**: Must set `contain-intrinsic-size` alongside `content-visibility: auto` to provide a placeholder size estimate. This ensures accurate scroll positions even when content is skipped.
- **Zero-JS performance optimization**: Pure CSS solution - no JavaScript overhead, no bundle size increase, works automatically across all browsers that support it. For browsers that don't support it, it gracefully degrades with no negative impact.
- **Testing inline styles**: Can verify inline style properties using `toHaveStyle()` matcher in vitest/testing-library, including camelCase CSS properties like `contentVisibility`.

### Iteration 8 (2026-02-08)
- **CSS transitions for polish**: Adding `transition-all duration-300 ease-in-out` to panels creates smooth width changes during open/close without any JavaScript. Keep duration short (300ms) for responsive feel.
- **Custom keyframe animations in Tailwind**: Extend Tailwind config with custom `keyframes` and `animation` definitions for reusable animations like panel content fade-in. Define both the keyframe and animation in the `extend` section.
- **Staggered animation timing**: Combine width transition (transition-all on container) with content fade-in animation (animate-* on content wrapper) for layered polish effect. Content should animate slightly after container starts transitioning.
- **Testing for CSS classes**: Verify transitions by checking `className.includes()` for Tailwind utility classes. Don't test actual animation behavior (browser-dependent), just test that the right classes are applied.

### Iteration 9 (2026-02-08)
- **Toast notifications for UX feedback**: Implemented lightweight toast system using Zustand store + pure CSS animations. Provides non-intrusive success/error/info feedback that significantly improves user experience without cluttering the UI.
- **Toast positioning**: Fixed bottom-right corner positioning with `pointer-events-none` on container and `pointer-events-auto` on individual toasts allows click-through on empty space while keeping toasts interactive.
- **Auto-removal pattern**: Using setTimeout to auto-remove toasts after configurable duration (default 5s) keeps UI clean without requiring user action. Duration of 0 makes toasts persistent until manually closed.
- **Helper methods on store**: Providing convenience methods (`success()`, `error()`, `info()`) directly on the store makes toast usage simple and consistent across components. No need to call `addToast()` directly.
- **Integration best practices**: Add toast notifications to mutation callbacks (`onSuccess`, `onError`) in TanStack Query for automatic feedback on async operations. Shows both inline validation errors AND toast notifications for comprehensive user feedback.

---

## General Principles

- **Test before commit**: Always run the full test suite after changes.
- **Small, atomic changes**: Each iteration should be one focused improvement, not a grab bag.
- **Measure impact**: Note before/after for any performance changes.
- **User-visible wins**: Prioritize changes that users can see and feel immediately.
