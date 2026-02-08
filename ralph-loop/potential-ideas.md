# Potential Ideas

Ideas are scored by **impact** (1-5) and **effort** (1-5, lower=easier). Priority = impact / effort.

## UI Polish & Speed Feel

| ID | Idea | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| U1 | Add CSS transitions/animations for panel open/close, message appear | 4 | 2 | 2.0 | pending |
| U2 | Skeleton loading states instead of spinners | 3 | 2 | 1.5 | pending |
| U3 | Save panel widths + sidebar state to localStorage | 3 | 1 | 3.0 | done |
| U4 | Toast notification system for errors/success | 4 | 2 | 2.0 | pending |
| U5 | Keyboard shortcuts (Cmd+K search, Esc close modals, etc.) | 3 | 3 | 1.0 | pending |
| U6 | Fix hardcoded colors — use Tailwind theme tokens everywhere | 3 | 2 | 1.5 | pending |
| U7 | Message appear animation (slide-up fade-in) | 3 | 1 | 3.0 | pending |
| U8 | Typing indicator animation during streaming | 3 | 1 | 3.0 | pending |
| U9 | Smooth scroll-to-bottom behavior during streaming | 3 | 1 | 3.0 | pending |
| U10 | Add subtle hover/active states to all interactive elements | 3 | 2 | 1.5 | pending |

## Performance & Resource Efficiency

| ID | Idea | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| P1 | Split SQLPanel.tsx (720 lines) into smaller components | 3 | 3 | 1.0 | pending |
| P2 | Virtualize large data tables (react-window or similar) | 4 | 3 | 1.3 | pending |
| P3 | Lazy load CodeMirror (dynamic import) | 3 | 1 | 3.0 | pending |
| P4 | Add React.memo to expensive components (MessageBubble, DatasetCard) | 3 | 1 | 3.0 | pending |
| P5 | Debounce search inputs (ChatHistory search) | 2 | 1 | 2.0 | pending |
| P6 | Optimize re-renders: extract streaming token display to isolated component | 4 | 2 | 2.0 | pending |
| P7 | Backend: connection pool for SQLite (reduce open/close overhead) | 2 | 2 | 1.0 | pending |
| P8 | Compress WS messages (shorter event names, minimal payload) | 2 | 2 | 1.0 | pending |
| P9 | Production build with code splitting (Vite chunks) | 4 | 2 | 2.0 | pending |
| P10 | Use CSS `content-visibility: auto` for off-screen message bubbles | 3 | 1 | 3.0 | pending |

## Completeness & Robustness

| ID | Idea | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| C1 | Global React error boundary with graceful fallback UI | 4 | 1 | 4.0 | done |
| C2 | WebSocket auto-reconnect with exponential backoff | 4 | 2 | 2.0 | pending |
| C3 | Optimistic UI updates for message send | 3 | 2 | 1.5 | pending |
| C4 | Empty states for all lists (no conversations, no datasets) | 3 | 2 | 1.5 | pending |
| C5 | Request timeout handling with user-friendly errors | 3 | 2 | 1.5 | pending |
| C6 | Copy code block button in markdown responses | 4 | 2 | 2.0 | pending |
| C7 | Copy SQL query button in message bubbles | 3 | 1 | 3.0 | done |
| C8 | Confirmation dialogs for destructive actions (delete conversation/dataset) | 3 | 2 | 1.5 | pending |
| C9 | Rate limit warning banner with remaining tokens | 2 | 1 | 2.0 | pending |
| C10 | Favicon and proper meta tags | 2 | 1 | 2.0 | pending |
