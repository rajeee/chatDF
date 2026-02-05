---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# SQL Panel — Implementation Plan

## Component: `SQLPanel.tsx`

Implements: [spec.md#layout](./spec.md#layout), [spec.md#open-close](./spec.md#open-close)

### File Location

`frontend/src/components/chat-area/SQLPanel.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `sql` | `string` | SQL query text to display |
| `onClose` | `() => void` | Callback to close the panel |

### State Dependencies

- None directly. Visibility controlled by parent `ChatArea` based on `uiStore.sqlPanelOpen`.

### CodeMirror 6 Integration

Implements: [spec.md#content](./spec.md#content)

- Dependencies: `@codemirror/lang-sql`, `@codemirror/view`, `@codemirror/state`.
- Create a CodeMirror `EditorView` inside a `useEffect`, attached to a container `<div>` via `useRef`.
- Configuration:
  - `sql()` language extension for syntax highlighting.
  - `EditorState.readOnly.of(true)` — read-only mode.
  - `EditorView.editable.of(false)` — non-editable.
  - Theme extension matching the app's light/dark mode (use `oneDark` for dark, default light theme for light).
- When `sql` prop changes: replace the editor's document via `view.dispatch({ changes })`.
- Cleanup: `view.destroy()` in `useEffect` cleanup function.

### Layout

Implements: [spec.md#layout](./spec.md#layout)

- Panel container: fixed height (~40% of chat area), `border-t` for visual separation.
- Header row: "SQL Query" label on left, copy button and close button (X icon) on right.
- CodeMirror container: fills remaining panel height with `overflow-y-auto`.

### Slide Animation

Implements: [spec.md#open-close](./spec.md#open-close)

- CSS transition on `transform: translateY(100%)` (closed) to `translateY(0)` (open).
- Transition duration: 200ms, `ease-out`.
- Panel always rendered in the DOM when open; unmounted after close animation completes (use `onTransitionEnd` or a short timeout to defer unmount).

### Copy Button

- Copies raw `sql` string to clipboard via `navigator.clipboard.writeText(sql)`.
- Brief "Copied!" feedback: toggle button text/icon for 1.5 seconds using a local `useState`.

### Close Actions

Implements: [spec.md#open-close](./spec.md#open-close)

- Close (X) button: calls `onClose()`.
- Escape key: `useEffect` with `keydown` listener when panel is mounted, calls `onClose()` on Escape.
- Toggle behavior (clicking same "Show SQL" again) handled by parent `ChatArea`.

## Scope

### In Scope
- CodeMirror read-only SQL display, slide animation, copy, close

### Out of Scope
- SQL execution (view-only panel)
- Determining which SQL to show (parent provides via props)
