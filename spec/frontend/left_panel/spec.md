---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Left Panel Specification

## Scope

### In Scope
- Panel container behavior (expand/collapse)
- Section layout and ordering
- Responsive behavior

### Out of Scope
- Individual section content (see child specs)
- Theme colors (see theme/spec.md)

### Assumptions
- Panel state (expanded/collapsed) persisted in localStorage

## Behavior

### Layout
- Collapsible sidebar on the left side of the application
- Width: ~260px when expanded
- When collapsed: hidden entirely (no icon strip in V1)
- Sections stacked vertically in fixed order:
  1. "New Chat" button (top)
  2. Chat History list
  3. Settings
  4. Usage Stats
  5. Account (bottom)

### Collapse/Expand
- Toggle via hamburger icon in the application header (not within the panel itself)
- Smooth slide animation (~200ms)
- Chat area expands to fill freed space when panel collapses

### Responsive Behavior
- Desktop (≥1024px): expanded by default
- Tablet (<1024px): collapsed by default
- Mobile: collapsed by default, overlays content when expanded (no push behavior)
- User can manually toggle regardless of viewport size

### New Chat Button
- Prominent button at the top of the panel
- Starts a fresh conversation (clears chat area, keeps datasets)
- Always visible when panel is expanded

## Child Specs
- [Chat History](./chat_history/spec.md)
- [Settings](./settings/spec.md)
- [Usage Stats](./usage_stats/spec.md)
- [Account](./account/spec.md)
