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

---

## General Principles

- **Test before commit**: Always run the full test suite after changes.
- **Small, atomic changes**: Each iteration should be one focused improvement, not a grab bag.
- **Measure impact**: Note before/after for any performance changes.
- **User-visible wins**: Prioritize changes that users can see and feel immediately.
