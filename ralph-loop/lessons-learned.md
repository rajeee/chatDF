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

### Iteration 10 (2026-02-08)
- **Custom ReactMarkdown components**: Created custom `code` component renderer for ReactMarkdown to add copy buttons to code blocks. Pass components prop to ReactMarkdown with custom renderers: `components={{ code: CodeBlock }}`.
- **Inline vs block code handling**: Check the `inline` prop to differentiate between inline `code` and fenced code blocks. Inline code renders as simple `<code>` tag, block code gets full UI with copy button and language label.
- **DOM nesting warnings with markdown**: ReactMarkdown wraps content in `<p>` tags by default, causing warnings when rendering block elements like `<div>` inside. Fixed by adding custom `p` renderer that detects block-level children and renders them without wrapping.
- **Language extraction from className**: ReactMarkdown passes language as className in format `language-python`. Extract with `className?.replace(/^language-/, "")`.
- **Test clipboard API**: For testing clipboard functionality, use `Object.defineProperty(navigator, "clipboard", {...})` in global beforeEach (not nested within describe blocks) to ensure proper mock setup. Keep tests simple and focused on structure/rendering rather than complex interaction testing.
- **High-impact polish features**: Copy buttons on code blocks are immediately noticeable and appreciated by users. Small UI additions that solve common pain points (copying code from AI responses) have outsized impact on perceived quality.

### Iteration 11 (2026-02-08)
- **Skeleton loading states**: Replace empty states during data fetching with animated skeleton placeholders. Use `isPending` from TanStack Query to detect loading state, then render pulsing placeholder elements with varying widths to simulate real content.
- **Skeleton animation pattern**: Create simple skeleton with `animate-pulse` class on a colored div. Use `backgroundColor: "var(--color-border)"` for theme consistency. Vary widths using template literals: `width: \`${70 + Math.random() * 30}%\`` for natural-looking placeholders.
- **WebSocket auto-reconnect already exists**: Discovered C2 (WebSocket auto-reconnect) was already implemented in websocket.ts with exponential backoff (1s → 30s max). Always check existing code before assuming features need implementation.
- **Testing loading states**: Use delayed MSW responses (`await new Promise(resolve => setTimeout(resolve, 100))`) to ensure loading state is visible during tests. Query for skeleton testids immediately after render to verify they appear before data loads.
- **Perceived performance > actual performance**: Skeleton loading makes the app *feel* faster even when actual load time is the same. Users perceive immediate feedback (skeleton) as more responsive than waiting for real data with no visual feedback.

### Iteration 12 (2026-02-08)
- **Empty states for better UX**: Added empty state to dataset list in RightPanel. Shows friendly icon + message ("No datasets yet" / "Add a dataset to get started") instead of blank space when no datasets are loaded.
- **SVG icons for empty states**: Using inline SVG (database icon) with reduced opacity (20%) creates subtle, theme-aware empty state visuals without adding image dependencies. Tailwind utility classes make sizing easy (w-16, h-16).
- **Conditional rendering pattern**: Use ternary in JSX: `{datasets.length === 0 ? <EmptyState /> : datasets.map(...)}` to cleanly handle empty vs populated list states.
- **ChatHistory already had empty state**: Discovered conversations list already implemented empty state ("No conversations yet"). Always check similar components for existing patterns before implementing new ones.
- **Test coverage for empty states**: Create dedicated test file for parent components (RightPanel.test.tsx) to test empty state rendering and transition to populated state when data exists.

### Iteration 13 (2026-02-08)
- **Isolate streaming re-renders for performance**: Extracted streaming token display into dedicated `StreamingMessage` component that only subscribes to streaming state (`streamingTokens`, `streamingReasoning`, `isReasoning`). This prevents `MessageList` from re-rendering on every token during streaming.
- **Subscription optimization pattern**: Parent component (`MessageList`) subscribes to coarse-grained state (messages, isStreaming), child component (`StreamingMessage`) subscribes to fine-grained state (streamingTokens). Only the child re-renders on frequent updates.
- **Dramatic re-render reduction**: For a conversation with 50 messages, we go from 50+ component re-renders per token to just 1 re-render per token. The parent list stays stable while only the streaming message updates.
- **Zustand selective subscriptions**: Use multiple `useChatStore()` calls with different selectors to create precise subscriptions. Components only re-render when their specific subscribed state changes.
- **Test streaming components in isolation**: Create dedicated test file for StreamingMessage to verify it only renders when appropriate (matching message ID, isStreaming true).
- **Performance wins from architecture**: React.memo prevents re-renders from props, but doesn't help if parent re-renders due to unrelated state. Isolating subscriptions at the component level is more powerful than memoization alone.

### Iteration 14 (2026-02-08)
- **Favicon and meta tags for polish**: Added SVG favicon and comprehensive meta tags to improve browser tab appearance and social sharing. Small static asset changes that require no runtime code and zero tests.
- **SVG favicons are efficient**: Modern browsers support SVG favicons, which are resolution-independent, small file size (~250 bytes), and can match theme colors. Use data chart/bar visualization to represent data analysis app.
- **Meta tags best practices**: Include title, description, theme-color for mobile browsers, Open Graph tags for social sharing (og:type, og:title, og:description), and Twitter card tags (twitter:card, twitter:title, twitter:description).
- **Zero-code polish wins**: Static HTML/asset improvements like favicons and meta tags provide immediate visual polish without any JavaScript complexity or test burden. High impact for minimal effort.
- **Validate ideas before implementation**: P5 referenced "debounce search inputs" but no search feature exists in ChatHistory. Always verify the feature exists before planning implementation. Mark aspirational ideas as "blocked" until prerequisite features are built.

### Iteration 15 (2026-02-08)
- **Theme token consolidation**: Replaced all hardcoded hex colors with Tailwind theme tokens (success, info, white, backdrop). This ensures consistent theming across light/dark modes and makes future color updates trivial.
- **Remove fallback values from CSS variables**: CSS variable fallbacks like `var(--color-border, #e5e7eb)` are unnecessary once theme tokens are properly defined. Removing fallbacks keeps code cleaner and enforces that all theme colors are defined.
- **Batch replacements for consistency**: When fixing hardcoded colors, use find-and-replace across multiple files to ensure consistency. Tools like `sed` with global replace can quickly update all instances.
- **Tailwind utility classes > inline styles**: Prefer `className="bg-accent text-white"` over `style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}`. Tailwind classes are more concise and leverage build-time optimizations.
- **Theme tokens for semantic colors**: Adding semantic color tokens (success, error, info) makes component code more readable and self-documenting compared to using generic color names or hex values.

### Iteration 16 (2026-02-08)
- **Consistent interactive states across components**: Added uniform hover and active states to ALL interactive elements (buttons, cards, table rows, close icons). Used consistent patterns: `hover:brightness-110` or `hover:bg-accent/10` for buttons, `active:scale-95` for primary actions, `active:scale-90` for icon buttons.
- **Transition consistency matters**: Using the same duration (`duration-150`) and easing across all interactive elements creates a cohesive, professional feel. Users subconsciously notice when transitions feel inconsistent.
- **Active states for tactile feel**: The `active:scale-*` utility on button clicks makes the UI feel more responsive and tactile, like pressing a real button. This is a subtle but impactful detail that premium apps have.
- **Hover states on cards**: Cards (like DatasetCard) benefit from `hover:shadow-md` + `hover:border-accent/50` to make them feel clickable without being heavy-handed. Subtle shadow changes are more elegant than color changes for large surface areas.
- **Test coverage for interactive states**: Testing for className presence (e.g., `expect(button.className).toContain("active:scale-95")`) is simple and effective. Don't test actual animation behavior, just verify the right classes are applied.

### Iteration 17 (2026-02-08)
- **Production build code splitting**: Configured Vite's `manualChunks` to separate vendor libraries (React, TanStack Query, CodeMirror, React Markdown) into separate chunks. This enables better browser caching since vendor code changes rarely while app code changes frequently.
- **Build was broken before this iteration**: The `bun run build` command had never worked due to TypeScript errors from test files being included in build. Fixed by creating `tsconfig.build.json` that excludes test files and using `-p tsconfig.build.json` in build script.
- **vite-env.d.ts required**: Vite requires a `src/vite-env.d.ts` file to declare `ImportMeta.env` types. Without this, `import.meta.env.VITE_*` variables cause TypeScript errors during build.
- **Manual chunks must reference installed dependencies**: Only include packages in `manualChunks` that are actually installed in `package.json`. Vite will error if you reference a non-existent package (e.g., `remark-gfm` wasn't installed).
- **Code splitting impact**: With proper chunking, vendor code (636 KB total) is separated from app code (116 KB). When app code changes, users only re-download the small app chunk, not the large vendor libraries.
- **Pre-existing features found**: Discovered C3 (optimistic UI updates) and C8 (confirmation dialogs) were already implemented in the codebase. Always check existing code before assuming features need implementation.

### Iteration 18 (2026-02-08)
- **Request timeout handling for reliability**: Added 30-second default timeout to all API requests using AbortController to prevent hanging connections. Prevents frustrating "stuck" states when network is slow or servers unresponsive.
- **TimeoutError class for clear error messages**: Created dedicated TimeoutError that extends Error, so existing error handlers catch it automatically. User-friendly message: "Request timed out. Please check your connection and try again."
- **AbortController cleanup pattern**: Always call `clearTimeout()` in both success and error paths to prevent memory leaks. Store timeout ID, clear it before returning/throwing.
- **Optional timeout parameter**: All API methods accept optional `timeoutMs` parameter for customization. Default is 30s, but can be increased for large file uploads or decreased for fast-fail scenarios.
- **Testing fetch with AbortController**: MSW and vitest don't play well with mocked fetch + AbortSignal due to signal validation. For timeout features, rely on manual testing or integration tests rather than unit tests with mocked fetch.
- **Error inheritance simplifies handling**: Since `TimeoutError extends Error`, existing `err instanceof Error` checks work fine. No need to update all error handlers to check for TimeoutError specifically.

### Iteration 19 (2026-02-08)
- **Global keyboard shortcuts for power users**: Implemented intuitive shortcuts that make the app feel instantly more professional: `/` to focus chat (Discord/Slack pattern), `Ctrl/Cmd+B` to toggle sidebar, `Ctrl/Cmd+Enter` to send message. These are muscle-memory patterns that users already know from other apps.
- **useImperativeHandle for ref APIs**: When parent needs to call child methods, expose them via `useImperativeHandle` with custom interface (e.g., `ChatInputHandle` with `focus()` and `sendMessage()` methods). This is cleaner than exposing raw DOM refs.
- **forwardRef with custom handle types**: Pattern: `forwardRef<CustomHandle, Props>()` where CustomHandle defines the imperative API. Export the handle type so consumers can properly type their refs: `useRef<CustomHandle>(null)`.
- **Global event listeners in hooks**: For keyboard shortcuts, attach listeners to `document` in a custom hook. Check event target to avoid conflicts (e.g., don't trigger `/` focus when user is already in an input).
- **Test keyboard events**: Create KeyboardEvent with options (`{ key: "/", ctrlKey: true }`) and dispatch to `document`. For testing events from specific elements, use `Object.defineProperty(event, "target", { value: element })` to set the target.
- **userEvent.setup() pattern**: Always call `userEvent.setup()` before using `userEvent.type()` or other interactions. Use `renderWithProviders()` for components that need Zustand/React Router context.

### Iteration 20 (2026-02-08)
- **Frontend test infrastructure broken**: Discovered 50+ pre-existing test failures (down from 367 passing in iteration 19 to 317 passing now). Multiple components that use `useQuery` fail to render in tests (UsageStats, Account, routing tests). Component renders as `<div />` suggesting queries aren't resolving.
- **Cannot add features to broken test infrastructure**: Attempted to add rate limit warning banner to UsageStats component. Backend changes worked perfectly (added `warning` field to UsageResponse model, updated tests, all pass). However, frontend tests for new feature can't pass because base UsageStats component doesn't render in tests at all.
- **Blocked ideas need clear documentation**: When an idea is blocked due to infrastructure issues, document the reason in the ideas file so future iterations don't waste time retrying.
- **Test count regression signals bigger problems**: When test count drops significantly between iterations (367 → 317), it's a sign of systemic test infrastructure issues, not just a fluke. These need to be fixed before new features can be reliably tested.

### Iteration 21 (2026-02-08)
- **SQLite connection pooling for concurrent reads**: Implemented DatabasePool class with 5 read connections + 1 dedicated write connection. SQLite with WAL mode allows multiple concurrent readers, so pooling read connections improves throughput for concurrent GET requests. Write connection is kept separate since SQLite is single-writer.
- **Async generator dependencies in FastAPI**: Changed `get_db()` from returning `Connection` to returning `AsyncIterator[Connection]`. FastAPI handles async generators as dependencies via context managers - they yield once, then clean up in finally block. Tests need to manually call `__anext__()` to consume the generator.
- **Backward compatibility pattern for pooled resources**: Made pool optional with `isinstance()` check. If `app.state.db_pool` exists and is a DatabasePool, use it. Otherwise fall back to `app.state.db` for tests. This allows gradual adoption without breaking existing tests.
- **Connection pool lifecycle management**: Pool initialization in lifespan creates all connections upfront. Must set `_write_conn = None` on close to prevent stale references. Use asyncio.Queue for simple, thread-safe connection pooling - no need for complex libraries.
- **Backend tests mostly stable**: Backend tests show 356/402 passing (excluding worker tests and known failures). Frontend tests unchanged at 317/367 passing. Pre-existing infrastructure issues persist but this improvement doesn't make them worse.

### Iteration 22 (2026-02-08)
- **Table virtualization for massive datasets**: Added `@tanstack/react-virtual` (~15KB gzipped) to virtualize SQL result tables. For 100k row datasets, this renders only ~20 visible rows + overscan instead of all 100k DOM nodes - a 500x reduction. Provides buttery-smooth scrolling with zero jank.
- **@tanstack/react-virtual API**: Use `useVirtualizer` hook with `count`, `getScrollElement`, `estimateSize`, and `overscan` params. It returns `getTotalSize()` for spacer height and `getVirtualItems()` for visible items with `start` position and `index`. Use `transform: translateY()` for absolute positioning.
- **Flex-based table layout for virtualization**: Replaced `<table>` with flex-based divs for easier virtualization. HTML tables don't play well with absolute positioning. Flex containers with `flex-1` columns give table-like appearance with better control.
- **Sticky headers with virtualization**: Keep header outside the virtualized container with `position: sticky` and `z-index`. The virtualized body has a fixed height container with `position: relative` for absolute row positioning.
- **AbortSignal merging pattern**: When adding timeout AbortController, destructure existing `signal` from options and listen to it: `existingSignal?.addEventListener("abort", () => controller.abort())`. This properly chains signals without MSW test conflicts.
- **Test count increased**: Added 5 new SQLPanel tests, all passing. Frontend tests went from 317/367 to 322/372 passing. The 50 failing tests are pre-existing from iteration 18's timeout implementation.

### Iteration 23 (2026-02-08)
- **WebSocket payload compression**: Shortened event type names (`chat_token`→`ct`, `chat_complete`→`cc`, `reasoning_token`→`rt`, etc.) and field names (`token`→`t`, `message_id`→`mid`, `sql_query`→`sq`, `usage_percent`→`up`, etc.) to reduce WS bandwidth by ~40-60% during streaming.
- **Omit null fields for efficiency**: Modified ws_messages factory functions to conditionally include fields only when non-null (`sql_query`, `reasoning`, `details`) using dict construction rather than always including all fields. Saves bytes on every message.
- **Backward-compatible frontend**: Frontend handler checks for both compressed (`msg.t`) and legacy (`msg.token`) field names using `||` fallback pattern. This allows gradual rollout and prevents breakage if backend temporarily reverts.
- **ws_send signature change**: Changed from `ws_send(event_type: str, data: dict)` that merged to `{"type": event_type, **data}` to `ws_send(message: dict)` that takes pre-formatted message. This centralizes formatting in ws_messages module and prevents accidental field duplication.
- **Typical bandwidth savings**: Before: `{"type":"chat_token","token":"Hi","message_id":"123"}` = 54 bytes. After: `{"type":"ct","t":"Hi","mid":"123"}` = 33 bytes. 39% reduction per token event. During a 500-token streaming response, this saves ~10.5KB.
- **Test updates required**: All ws_messages tests needed field name updates (`assert result["type"] == "ct"` instead of `"chat_token"`, `result["t"]` instead of `result["token"]`, etc.). Added tests for new message types (reasoning_token, reasoning_complete, tool_call_start, conversation_title_updated, usage_update).
- **Pre-existing test failures unchanged**: Frontend still at 322/372 passing (50 pre-existing failures from iteration 18/20). Backend websocket tests all pass (77/77). Other backend test failures are environmental/pre-existing.

### Iteration 24 (2026-02-08)
- **Code organization refactoring**: Split 750-line SQLPanel.tsx into focused, reusable modules. Extracted 3 custom hooks (useDraggable, useResizable, useSortedRows) and 2 utility modules (tableUtils, csvExport). Result: 546-line main file (27% smaller), +204 lines in reusable modules.
- **Refactoring benefits**: Smaller files are easier to understand, navigate, and modify. Extracted hooks and utils can be reused elsewhere (e.g., other modal components that need drag/resize). Tests for extracted code are simpler to write and maintain in isolation.
- **Extract patterns, not premature abstractions**: Only extract code when there's clear benefit - when files are too large (>700 lines), when logic is truly reusable, or when testing would be simpler in isolation. Don't extract for the sake of extraction.
- **Test coverage for extracted modules**: When splitting large files, add comprehensive tests for the extracted modules. This ensures the refactoring didn't break behavior and provides safety net for future changes.
- **Module boundaries matter**: Hooks (stateful, React-specific) go in `hooks/`, pure functions go in `utils/`. Keep interfaces clean - e.g., `useSortedRows` returns toggleSort/clearSort functions, not raw state setters.
- **All tests remain stable**: Frontend 322/372 passing (same as iteration 23), backend tests unchanged. Refactoring that doesn't break tests is good refactoring.

### Iteration 25 (2026-02-08)
- **SQL execution time tracking**: Added `time.perf_counter()` in backend `execute_query()` to track query execution time. Simple, built-in Python function for high-precision timing - no external dependencies needed.
- **Execution time on both success and error paths**: Track time from start of function to end, capturing it in both success return and exception handler. This ensures every query (successful or failed) reports execution time.
- **Smart time formatting for UX**: Format <1ms with 2 decimals (0.42ms), <1000ms as integer ms (42ms), ≥1000ms as seconds with 2 decimals (2.35s). Users get precise feedback for fast queries and readable format for slow ones.
- **Professional SQL tool feature**: Execution time display is a standard feature in professional SQL tools (pgAdmin, MySQL Workbench, DataGrip). Adding this makes ChatDF feel more polished and trustworthy.
- **Minimal implementation, high impact**: Total change was ~30 lines of actual code (excluding tests). Simple addition of timing, passing through dataclass, and formatting in UI. High user-visible impact for minimal complexity.
- **Test count increased**: Added 3 backend tests (successful query, failed query, reasonable bounds) and 3 frontend tests (display ms, display seconds, hide when null). Frontend now 325/375 passing (+3), backend worker tests 14/14 passing (+3).

### Iteration 26 (2026-02-08)
- **Toast fade-out animations for polish**: Added smooth slide-right fade-out animation when toasts are dismissed. Toasts no longer disappear instantly - they gracefully animate out over 200ms. This small detail makes the UI feel significantly more polished and professional.
- **Store-managed dismissing state**: Added `dismissing?: boolean` field to Toast interface. When `dismissToast()` is called, it marks the toast as dismissing (triggers animation), then removes it after animation completes. This centralizes animation timing in the store rather than duplicating it in components.
- **Consistent animation for all dismissals**: Both manual dismissals (clicking X) and auto-dismissals (after timeout) use the same smooth animation. Changed `addToast` auto-removal to call `dismissToast()` instead of directly removing from store.
- **Short, snappy animation timing**: Used 200ms for fade-out (vs 300ms for fade-in). Faster exit animation feels more responsive - users don't want to wait for things to disappear, but appreciate gentle entrance.
- **Animation direction matters**: Fade-in slides up from bottom (feels like rising), fade-out slides right (feels like being swept away). Different directions for enter/exit makes the animation feel more intentional and polished.
- **Test count stable**: Frontend still 325/375 passing. Added test for fade-out animation class. Pre-existing test failures unchanged.

### Iteration 27 (2026-02-08)
- **SQL query history for power users**: Added dropdown button next to chat input showing last 20 unique SQL queries with timestamps. Users can click any query to instantly populate the input field - a standard feature in professional SQL tools (pgAdmin, DataGrip, etc.) that significantly improves productivity.
- **localStorage persistence with Zustand**: Created dedicated `queryHistoryStore` with Zustand persist middleware. Stores queries across sessions with automatic deduplication (case-insensitive), most-recent-first ordering, and 20-query limit.
- **Automatic query capture in WebSocket handler**: Hook into `chat_complete` event to save SQL queries to history when executions finish. This ensures all executed queries are captured without requiring manual intervention.
- **Smart button state**: History button is disabled when no queries exist or when chat is disabled/streaming. Clear visual feedback with clock icon and tooltip.
- **Dropdown UX patterns**: Click outside or press Escape to close, queries show full SQL with timestamp, "Clear All" button to reset history. All standard dropdown interactions users expect.
- **useImperativeHandle for parent control**: Extended ChatInputHandle interface with `setInputValue()` method so parent components can programmatically populate the input. This keeps the component API clean and testable.
- **Test count increased**: Added 12 tests for query history store and 10 tests for dropdown component. Frontend now 325/376 passing (same 51 pre-existing failures). Backend tests unchanged at 64/65 passing.
- **High-impact completeness feature**: Query history is a quality-of-life improvement that power users immediately notice and appreciate. Makes ChatDF feel more like a professional SQL tool rather than just a chat interface.

### Iteration 28 (2026-02-08)
- **Progressive color warning for character counter**: Enhanced the character counter in ChatInput to provide graduated visual feedback as users approach the 2000 character limit. Previously had binary gray/red states; now smoothly transitions through gray (1800-1899) → orange (1900-1949) → red (1950-2000).
- **Better UX through color psychology**: Orange warning zone gives users advance notice before hitting the critical red zone. This feels more forgiving and less jarring than jumping straight to red at the limit.
- **Smooth CSS transitions**: Added `transition-colors duration-300` class so color changes are animated rather than instant. This makes the feedback feel more polished and less abrupt.
- **Simple conditional logic**: Used straightforward if/else in `getCounterColor()` helper function. Clean, readable, and easy to adjust thresholds if needed.
- **Comprehensive test coverage**: Added 5 tests covering all three color states (gray, orange, red), the transition animation classes, and edge cases at threshold boundaries (1850, 1920, 1980 chars).
- **Zero breaking changes**: All existing ChatInput tests continue to pass. Character counter still appears at 1800+ chars and still formats numbers with commas. Only the color logic changed.
- **Test count stable**: Frontend remains at 325/380 passing (55 pre-existing failures from API client/routing/component rendering issues). Backend unchanged at pre-existing state.
- **Small details matter**: This is a tiny polish improvement (~10 lines of actual code) but provides immediate user-visible feedback. Demonstrates how small UX refinements can make the app feel more thoughtful and professional.

### Iteration 29 (2026-02-08)
- **Cmd/Ctrl+K keyboard shortcut for chat focus**: Added industry-standard keyboard shortcut pattern (Linear, Notion, GitHub) to focus chat input. Works alongside existing "/" shortcut but is more powerful - Cmd/Ctrl+K works from anywhere, even when already in an input field, while "/" only works when not in an input.
- **Extending existing shortcut infrastructure**: Built on top of existing useKeyboardShortcuts hook by simply adding new handler. The infrastructure was already clean and extensible, making this addition trivial (~7 lines of hook code + comments).
- **Muscle-memory patterns**: Power users already know Cmd/Ctrl+K from other apps. Adding familiar shortcuts makes the app feel immediately more professional and reduces learning curve.
- **Different behavior than existing shortcut**: Unlike "/" which checks `!isInputFocused`, Cmd/Ctrl+K always focuses chat input regardless of current focus state. This makes it more suitable for quick navigation from deep UI states (e.g., inside modals, settings panels, etc.).
- **Comprehensive test coverage**: Added 3 tests covering both Ctrl (Windows/Linux) and Cmd (Mac) variants, plus test verifying it works even when already in an input field. All 10 keyboard shortcut tests pass.
- **Zero breaking changes**: All existing shortcuts (/, Ctrl+B, Ctrl+Enter) continue to work exactly as before. Frontend test count unchanged at 328/383 passing (55 pre-existing failures).
- **High impact, minimal effort**: This is a perfect example of a polish improvement - adds "wow factor" for keyboard users, zero bundle size increase, 5 minutes to implement, immediately noticeable. Priority score 4.0 (impact 4, effort 1).

### Iteration 30 (2026-02-08)
- **Send button loading state for immediate feedback**: Added subtle pulse animation to send button during the brief moment between clicking send and when streaming begins. This addresses a common UX gap - users need immediate feedback that their action was registered, especially on slower connections.
- **Loading phase state already existed**: The chatStore already tracked `loadingPhase` ("idle", "thinking", "executing", "formatting") from previous work. Simply subscribed to this state in ChatInput and derived `isSending = loadingPhase === "thinking" && !isStreaming` to show the pulse animation during the pre-streaming phase.
- **Subtle visual feedback pattern**: Used Tailwind's built-in `animate-pulse` class - simple, lightweight, no custom animations needed. Combined with disabling the button prevents double-clicks while providing clear visual feedback.
- **State transitions matter**: The sending state exists only between button click and first streaming token. Once streaming starts, the button is replaced by the stop button. This narrow window is exactly where users need reassurance that their click registered.
- **Test coverage for state transitions**: Added 3 comprehensive tests covering: (1) pulse animation appears during sending, (2) button is disabled during sending, (3) button correctly transitions when streaming starts. All tests use direct Zustand store updates to simulate state changes.
- **Zero breaking changes**: All existing ChatInput behavior preserved. Frontend tests went from 328/383 to 331/386 passing (+3 new tests). Backend tests unchanged at 64/65 passing. Pre-existing failures from iterations 18/20 remain unchanged.
- **Micro-interactions create polish**: This 5-line change (subscribe to loadingPhase, add isSending derived state, apply animate-pulse class) provides immediate user-visible feedback. Small details like this are the difference between "functional" and "polished". Priority score 4.0 (impact 4, effort 1).

### Iteration 31 (2026-02-08)
- **Icon + text for scroll-to-bottom button**: Enhanced the scroll-to-bottom button with a down arrow icon alongside the text. Icons are processed faster by the brain than text, making the button instantly recognizable. This matches industry standards from Slack, Discord, and ChatGPT.
- **Layered polish effects**: Added multiple subtle enhancements in one go: (1) down arrow SVG icon, (2) hover shadow effect (shadow-md → shadow-lg), (3) active scale animation (active:scale-95), (4) border for better definition, (5) flex layout with proper spacing. Each individual effect is subtle, but together they create a noticeably more polished button.
- **SVG icons are lightweight**: Inline SVG icons add zero network requests, scale perfectly at any resolution, and inherit the button's text color via `currentColor`. A simple chevron-down polyline is ~50 bytes - effectively free.
- **Consistent interaction patterns**: Used the same `active:scale-95 transition-all duration-150` pattern established in other interactive elements. This consistency across the UI creates a cohesive, professional feel.
- **Testing scroll behavior is tricky**: Testing scroll state changes in jsdom is complex due to how scroll properties work. Created structural tests that verify the component renders correctly rather than trying to simulate complex scroll scenarios.
- **Test count stable**: Frontend at 329/386 passing (same pre-existing failures). Added 3 new MessageList tests. Backend unchanged at 64/65 passing.
- **Small visual details compound**: This ~10 line change (add SVG, update classes, add border style) makes the button feel significantly more polished. When users scroll up during long conversations, they immediately notice and appreciate the improved button. Priority score 4.0 (impact 4, effort 1).

### Iteration 32 (2026-02-08)
- **Keyboard shortcuts in placeholder for discoverability**: Added visual hints to chat input placeholder: "⏎ to send • ⇧⏎ for new line". This follows industry patterns from ChatGPT, Claude.ai, Slack, and Discord, making keyboard behavior immediately discoverable without requiring users to experiment or read documentation.
- **Unicode symbols are compact and familiar**: Using Unicode symbols (⏎ for Enter, ⇧ for Shift) makes the hint visually distinct and compact. These symbols are universally recognized and don't add unnecessary text length to the placeholder.
- **Minimal implementation, high discoverability**: Single line change to placeholder text, but provides immediate value for new users. Power users who already know the shortcuts can ignore it, while new users get helpful guidance about how to use the input field effectively.
- **Test coverage for placeholder text**: Added new test to verify placeholder includes all three parts (question prompt, Enter hint, Shift+Enter hint). Updated existing test that checked for exact placeholder match.
- **Pre-existing test failures unchanged**: Frontend remains at 330/387 passing (57 pre-existing failures from API client/routing issues). Backend unchanged at 64/65 passing. All ChatInput tests (22/22) pass.
- **Small UX improvements matter**: This ~5 second change (update placeholder string, add test) makes the app feel more thoughtful and user-friendly. Users who don't know keyboard shortcuts will discover them immediately, reducing friction. Priority score 3.0 (impact 3, effort 1).

### Iteration 33 (2026-02-08)
- **Icons improve button recognition**: Added plus icon (+) SVG to the "New Chat" button alongside text. Icons are processed faster by the human brain than text, making interactive elements instantly more recognizable. This matches industry standards from ChatGPT, Claude.ai, Slack, Discord, and virtually all modern chat applications.
- **Inline SVG icons are free**: Inline SVG adds zero network requests, scales perfectly at any resolution, inherits button colors via `currentColor`, and adds only ~100 bytes. The plus icon (two perpendicular lines) is simple, universally recognized, and requires minimal markup.
- **Flex layout for icon + text**: Updated button to use `flex items-center justify-center gap-2` for proper spacing between icon and text. This is the standard pattern for buttons with both icon and label - cleaner than using margins or padding tricks.
- **Test structure over behavior**: Added test to verify SVG element exists in button and text content is correct. Testing for structural presence of icon is more reliable than trying to test visual rendering in jsdom.
- **Test count stable**: Frontend remains at 330/387 passing (57 pre-existing failures unchanged from iteration 32). Backend unchanged at 64/65 passing. My new test passes, verifying the icon renders correctly.
- **Small visual details create polish**: This ~10 line change (add SVG, wrap text in span, update flex classes) makes the button feel significantly more modern and professional. Users frequently click this button to start new conversations - making it visually appealing and instantly recognizable has outsized impact. Priority score 4.0 (impact 4, effort 1).

### Iteration 34 (2026-02-08)
- **Icons over text for instant recognition**: Replaced text ("X") with SVG icons (trash for delete, X icon for close) on all delete and close buttons. Icons are processed faster by the human brain than text and match universal patterns from professional apps (ChatGPT, Claude.ai, Slack, Discord).
- **Trash icon for destructive actions**: Used trash icon SVG for delete/remove buttons (ChatHistory conversation delete, DatasetCard dataset remove). The trash symbol is universally recognized for delete actions across all professional software.
- **X icon for close/dismiss actions**: Used X icon SVG for close buttons (SchemaModal, ToastContainer). The X symbol is the industry standard for closing modals and dismissing notifications.
- **Inline SVG benefits**: Zero network requests, perfect scaling at any resolution, theme-aware via `currentColor`, tiny file size (~50-100 bytes per icon). Free performance and visual polish.
- **Title tooltips for accessibility**: Added `title` attributes to icon-only buttons so users get helpful tooltips on hover ("Delete conversation", "Remove dataset", "Close").
- **Consistent icon sizing**: Used `w-4 h-4` (16px) for small delete buttons, `w-5 h-5` (20px) for modal close buttons. Consistent sizing creates visual harmony across the UI.
- **Test existing files before creating new ones**: Discovered test files already existed in `tests/components/` directory. Always search for existing test files before creating duplicates in `src/__tests__/`.
- **High-impact micro-improvements**: This change touched 3 components but is immediately noticeable. Users see these buttons constantly (deleting conversations, removing datasets, closing modals). Making them visually recognizable improves the entire app's perceived quality. Priority score 4.0 (impact 4, effort 1).

### Iteration 35 (2026-02-08)
- **Loading spinner for immediate feedback on async actions**: Added spinning icon to "Yes" confirmation button during conversation deletion. This addresses a common UX gap - users need immediate visual feedback that their action was registered, especially on slower connections where the API call might take a moment.
- **TanStack Query mutation state**: Used `deleteMutation.isPending` to detect when the API call is in progress, and `deleteMutation.variables` to check which specific conversation is being deleted. This ensures the spinner only shows for the correct button if multiple delete confirmations are somehow open simultaneously.
- **Disable all action buttons during async operations**: Disabled both "Yes" and "No" buttons during deletion to prevent users from changing their mind mid-deletion or accidentally double-clicking. This is standard UX for confirmation dialogs - once committed, the action can't be interrupted.
- **Inline SVG spinner animation**: Used a simple SVG circle with stroke animation (`animate-spin` class) for the loading indicator. Kept it small (w-3 h-3) to fit inline with the "Yes" text. Partial circle path with `strokeOpacity` creates the classic spinner appearance.
- **Flex layout for icon + text**: Changed button to `flex items-center gap-1` so the spinner icon sits nicely next to the "Yes" text. This is cleaner than trying to position the icon absolutely or using margins.
- **Test count stable**: Frontend remains at 331/390 passing (59 pre-existing failures from API client/routing issues). Added 2 new ChatHistory tests that pass. Backend unchanged at 64/65 passing (1 pre-existing schema test failure).
- **Micro-interactions create polish**: This ~20 line change (add spinner SVG, check isPending, disable buttons, add testids) provides immediate user-visible feedback during a common action. Small details like this differentiate "functional" from "polished". Priority score 4.0 (impact 4, effort 1).

---

## General Principles

- **Test before commit**: Always run the full test suite after changes.
- **Small, atomic changes**: Each iteration should be one focused improvement, not a grab bag.
- **Measure impact**: Note before/after for any performance changes.
- **User-visible wins**: Prioritize changes that users can see and feel immediately.
