---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Theme Specification

## Scope

### In Scope
- Theme modes and switching
- Color scheme guidelines
- Persistence and system preference detection
- Transition behavior

### Out of Scope
- Specific CSS values or tokens (plan phase)
- Component-specific styling (each component follows theme)
- Typography details (plan phase)

### Assumptions
- Theme applies globally to all components
- No per-component theme overrides

## Behavior

### Modes
- Three modes available:
  1. **Light**: White/light backgrounds, dark text
  2. **Dark**: Dark gray backgrounds, light text
  3. **System**: Follows OS preference automatically
- Default on first visit: System

### Switching
- Changed via Settings section in the left panel
- Change takes effect immediately (no page reload)
- Smooth color transitions on theme switch (~200ms CSS transition)

### Persistence
- Selected mode persisted in localStorage
- On page load: read localStorage, apply saved mode
- If no saved preference: default to "System"

### System Mode
- Listens to `prefers-color-scheme` media query
- Updates automatically when OS preference changes (no reload needed)
- If user explicitly selects "Light" or "Dark", system changes are ignored

### Color Guidelines

#### Light Mode
- Background: white (#ffffff or similar)
- Surface: light gray for cards, panels
- Text: dark gray/black
- Accent: blue for interactive elements (links, buttons, active states)
- Error: red
- Warning: amber/yellow

#### Dark Mode
- Background: dark gray (#1a1a2e or similar)
- Surface: slightly lighter gray for cards, panels
- Text: light gray/white
- Accent: blue (same hue, adjusted for contrast on dark backgrounds)
- Error: light red
- Warning: amber

### Contrast Requirements
- All text must meet WCAG AA contrast ratio (4.5:1 for normal text)
- Interactive elements must be visually distinguishable in both themes
- Focus indicators visible in both themes

### Component Expectations
- All components must render correctly in both light and dark modes
- No hardcoded colors — all colors derived from theme
- Components should not need to know which theme is active (consume theme tokens)
