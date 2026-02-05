---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Settings Specification

## Scope

### In Scope
- Theme toggle
- Clear conversations action
- About and Help links

### Out of Scope
- Theme implementation details (see theme/spec.md)
- Account management (see account/spec.md)

### Assumptions
- Settings section is always visible in the left panel (not collapsible independently)

## Behavior

### Theme Toggle
- Three-way toggle: Light / Dark / System
- Current selection visually indicated
- Change takes effect immediately
- Persisted in localStorage
- "System" follows OS preference via `prefers-color-scheme` media query

### Clear All Conversations
- Button labeled "Clear all conversations"
- Triggers confirmation dialog: "This will permanently delete all your conversations. This action cannot be undone."
- Two buttons: "Cancel" (closes dialog) and "Delete All" (destructive, red styling)
- On confirm: all conversations deleted from server, chat area returns to onboarding state

### About ChatDF
- Link or button labeled "About ChatDF"
- Opens a simple modal overlay with:
  - App name and version
  - Brief description: "Chat with your data using natural language"
  - Link to source/docs (if applicable)
  - Close button (X, Escape, or click outside)

### Help
- Link or button labeled "Help"
- Opens a modal overlay with:
  - Keyboard shortcuts list:
    - Enter: Send message
    - Shift+Enter: New line
    - Escape: Close panels/modals
  - Tips:
    - "Load a parquet file URL to get started"
    - "Ask follow-up questions for deeper analysis"
    - "Click 'Show SQL' to see the generated queries"
  - Close button (X, Escape, or click outside)

### Layout
- Settings items stacked vertically
- Compact styling — each item is a single row
- Visually separated from Chat History above and Usage Stats below
