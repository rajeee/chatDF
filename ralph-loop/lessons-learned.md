# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **Reuse existing features for onboarding**: Wire CTAs to open existing modals instead of building new flows. Less code, fewer tests, more consistent UX.
- **Schema data is already available — use it**: Parse `schema_json` column types (numeric/date/categorical) for context-aware prompts instead of generic suggestions.
- **Fragment → div for fade-in transitions**: Replace `<>...</>` with `<div className="animate-fade-in">...</div>` to animate state transitions. When React unmounts old and mounts new, the animation triggers automatically.
