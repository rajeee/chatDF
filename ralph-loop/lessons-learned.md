# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types (numeric/date/categorical) for context-aware prompts instead of generic suggestions.
- **Fragment → div for fade-in transitions**: Replace `<>...</>` with `<div className="animate-fade-in">...</div>` to animate state transitions. When React unmounts old and mounts new, the animation triggers automatically.
- **Theme token hover pattern**: `hover:bg-black/5 dark:hover:bg-white/10` is the best theme-independent hover background.
- **Check for pre-existing features before implementing**: Always search the full codebase before building — features may already exist.
- **Pre-existing test failures happen**: After dependency updates or env changes, always compare against baseline before attributing failures to your changes.
