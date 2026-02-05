---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Theme System - Implementation Plan

## Strategy

Implements: [spec.md#modes](./spec.md#modes), [spec.md#component-expectations](./spec.md#component-expectations)

Tailwind `darkMode: "class"` strategy. The `dark` class on `<html>` toggles all `dark:` variant utilities. CSS custom properties (variables) provide semantic color tokens consumed by Tailwind via `theme.extend.colors`.

## Files

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useTheme.ts` | Hook: reads/writes mode, applies `dark` class |
| `frontend/src/styles/globals.css` | CSS variable definitions for light and dark tokens |
| `frontend/tailwind.config.ts` | Maps CSS variables to Tailwind color names |

## CSS Custom Properties

Defined in `globals.css` under `:root` (light) and `.dark` (dark) selectors.

### Token Set

| Token | Light Value | Dark Value | Usage |
|-------|------------|------------|-------|
| `--color-bg` | `#ffffff` | `#1a1a2e` | Page background |
| `--color-surface` | `#f3f4f6` | `#252540` | Cards, panels |
| `--color-surface-hover` | `#e5e7eb` | `#2d2d4a` | Hovered surfaces |
| `--color-text` | `#111827` | `#e5e7eb` | Primary text |
| `--color-text-muted` | `#6b7280` | `#9ca3af` | Secondary text |
| `--color-border` | `#d1d5db` | `#374151` | Borders, dividers |
| `--color-accent` | `#2563eb` | `#3b82f6` | Interactive elements |
| `--color-accent-hover` | `#1d4ed8` | `#60a5fa` | Hovered interactive |
| `--color-error` | `#dc2626` | `#f87171` | Error text, borders |
| `--color-warning` | `#d97706` | `#fbbf24` | Warning indicators |

All pairs meet WCAG AA contrast (4.5:1) against their respective backgrounds.

### Tailwind Config Mapping

In `tailwind.config.ts`, extend `theme.colors` to reference the CSS variables:

```
bg: "var(--color-bg)"
surface: "var(--color-surface)"
...
```

This allows usage like `bg-surface`, `text-muted`, `border-border` in component classes.

## `useTheme` Hook

Implements: [spec.md#switching](./spec.md#switching), [spec.md#persistence](./spec.md#persistence), [spec.md#system-mode](./spec.md#system-mode)

File: `frontend/src/hooks/useTheme.ts`

### Interface

- `mode`: `"light" | "dark" | "system"` -- the user's chosen preference.
- `resolved`: `"light" | "dark"` -- the effective theme after resolving "system".
- `setMode(mode)`: updates preference, persists, and applies.

### Initialization

1. Read `localStorage.getItem("theme-mode")`.
2. If absent, default to `"system"`.
3. Resolve effective theme: if `"system"`, query `window.matchMedia("(prefers-color-scheme: dark)")`.
4. Apply `dark` class to `document.documentElement` if resolved is `"dark"`, remove otherwise.

### System Preference Listener

- `useEffect` registers `matchMedia.addEventListener("change", handler)`.
- Handler only acts when `mode === "system"` -- re-resolves and applies.
- Cleanup removes listener on unmount.

### Transition

Implements: [spec.md#switching](./spec.md#switching)

- `globals.css` includes a transition rule on `<html>`: `transition: color 200ms, background-color 200ms` scoped via a utility class `theme-transition` added during switches and removed after 200ms to avoid transitions on page load.

## Alternatives Considered

- **Tailwind `media` strategy**: Rejected -- does not support explicit light/dark/system toggle; only follows OS preference.
- **CSS-only with `color-scheme`**: Rejected -- insufficient control over custom tokens and three-mode switching.
- **Zustand store for theme**: Rejected -- theme is a global singleton with localStorage persistence; a standalone hook is simpler and avoids unnecessary store coupling.
