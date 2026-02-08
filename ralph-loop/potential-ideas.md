# Potential Ideas

Ideas are scored by **impact** (1-5) and **effort** (1-5, lower=easier). Priority = impact / effort.

## UI Polish & Speed Feel

| ID | Idea | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| U1 | Add CSS transitions/animations for panel open/close, message appear | 4 | 2 | 2.0 | done |
| U2 | Skeleton loading states instead of spinners | 3 | 2 | 1.5 | done |
| U3 | Save panel widths + sidebar state to localStorage | 3 | 1 | 3.0 | done |
| U4 | Toast notification system for errors/success | 4 | 2 | 2.0 | done |
| U5 | Keyboard shortcuts (/, Cmd+B, Cmd+Enter, Esc) | 3 | 3 | 1.0 | done |
| U6 | Fix hardcoded colors — use Tailwind theme tokens everywhere | 3 | 2 | 1.5 | done |
| U7 | Message appear animation (slide-up fade-in) | 3 | 1 | 3.0 | done |
| U8 | Typing indicator animation during streaming | 3 | 1 | 3.0 | done |
| U9 | Smooth scroll-to-bottom behavior during streaming | 3 | 1 | 3.0 | done |
| U10 | Add subtle hover/active states to all interactive elements | 3 | 2 | 1.5 | done |

## Performance & Resource Efficiency

| ID | Idea | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| P1 | Split SQLPanel.tsx (720 lines) into smaller components | 3 | 3 | 1.0 | done |
| P2 | Virtualize large data tables (react-window or similar) | 4 | 3 | 1.3 | done |
| P3 | Lazy load CodeMirror (dynamic import) | 3 | 1 | 3.0 | blocked |
| P4 | Add React.memo to expensive components (MessageBubble, DatasetCard) | 3 | 1 | 3.0 | done |
| P5 | Debounce search inputs (ChatHistory search) | 2 | 1 | 2.0 | blocked (no search feature exists yet) |
| P6 | Optimize re-renders: extract streaming token display to isolated component | 4 | 2 | 2.0 | done |
| P7 | Backend: connection pool for SQLite (reduce open/close overhead) | 2 | 2 | 1.0 | done |
| P8 | Compress WS messages (shorter event names, minimal payload) | 2 | 2 | 1.0 | done |
| P9 | Production build with code splitting (Vite chunks) | 4 | 2 | 2.0 | done |
| P10 | Use CSS `content-visibility: auto` for off-screen message bubbles | 3 | 1 | 3.0 | done |

## Completeness & Robustness

| ID | Idea | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| C1 | Global React error boundary with graceful fallback UI | 4 | 1 | 4.0 | done |
| C2 | WebSocket auto-reconnect with exponential backoff | 4 | 2 | 2.0 | done (pre-existing) |
| C3 | Optimistic UI updates for message send | 3 | 2 | 1.5 | done (pre-existing) |
| C4 | Empty states for all lists (no conversations, no datasets) | 3 | 2 | 1.5 | done |
| C5 | Request timeout handling with user-friendly errors | 3 | 2 | 1.5 | done |
| C6 | Copy code block button in markdown responses | 4 | 2 | 2.0 | done |
| C7 | Copy SQL query button in message bubbles | 3 | 1 | 3.0 | done |
| C8 | Confirmation dialogs for destructive actions (delete conversation/dataset) | 3 | 2 | 1.5 | done (pre-existing) |
| C9 | Rate limit warning banner with remaining tokens | 2 | 1 | 2.0 | blocked (UsageStats component tests broken - pre-existing issue) |
| C10 | Favicon and proper meta tags | 2 | 1 | 2.0 | done |
| C11 | SQL query execution time display | 4 | 1 | 4.0 | done |
| U11 | Toast fade-out animation on dismiss | 3 | 1 | 3.0 | done |
| C12 | SQL query history with quick re-run | 4 | 3 | 1.33 | done |
| U12 | Progressive color warning for character counter (gray→orange→red) | 3 | 1 | 3.0 | done |
| U13 | Add Cmd/Ctrl+K shortcut to focus chat input (industry standard) | 4 | 1 | 4.0 | done |
| U14 | Add sending state visual feedback to send button (pulse animation) | 4 | 1 | 4.0 | done |
| U15 | Add down arrow icon to "Scroll to bottom" button for better visual recognition | 4 | 1 | 4.0 | done |
| U16 | Add keyboard shortcuts hint to chat input placeholder (⏎ to send • ⇧⏎ for new line) | 3 | 1 | 3.0 | done |
| U17 | Add plus icon to "New Chat" button for better visual recognition | 4 | 1 | 4.0 | done |
| U18 | Replace "X" text with trash icon on delete buttons for better visual recognition | 4 | 1 | 4.0 | done |
| U19 | Add loading spinner to delete/remove buttons during API calls | 4 | 1 | 4.0 | done |
| U20 | Add loading spinner to DatasetCard retry button during retry | 4 | 1 | 4.0 | done |
| U21 | Auto-focus chat input when switching conversations | 3 | 1 | 3.0 | done |
| A1 | Add ARIA dialog/log/navigation attributes for screen readers | 5 | 2 | 2.5 | done |
