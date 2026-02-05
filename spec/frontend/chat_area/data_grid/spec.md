---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Data Grid Specification

## Scope

### In Scope
- Table display within assistant messages
- Column sorting and resizing
- Pagination
- Cell content handling
- Copy functionality

### Out of Scope
- Data fetching (data provided by message content)
- SQL execution (see backend/worker/spec.md)

### Assumptions
- Data grid is embedded inline within assistant messages, not a modal
- Maximum 1000 rows per result set (enforced by backend)

## Behavior

### Display
- Rendered inline within assistant message bubbles
- Visually distinct from message text (bordered container)
- Max height: ~400px, then vertical scroll within the grid
- Horizontal scroll for tables wider than the message area

### Headers
- Sticky first header row (remains visible while scrolling vertically)
- Column names displayed as-is from query results
- Click header to sort:
  - First click: ascending (↑ indicator)
  - Second click: descending (↓ indicator)
  - Third click: remove sort (return to original order)
- Only single-column sort (no multi-column)

### Column Resizing
- Drag column border (right edge of header cell) to resize
- Minimum column width: ~50px
- No maximum width (can stretch beyond container, triggers horizontal scroll)
- Double-click column border: auto-fit to content width

### Pagination
- 50 rows per page
- Navigation: "Previous" and "Next" buttons below the grid
- Page indicator: "Page 1 of 17"
- Total row count: "Showing 1–50 of 847 rows"
- Buttons disabled at first/last page respectively

### Cell Content
- Text truncated with ellipsis if wider than column
- Full cell text shown on hover (tooltip) or click (popover)
- Null values displayed as italic "null" in muted color
- Numbers right-aligned, text left-aligned
- No cell editing (read-only grid)

### Copy Table
- "Copy table" button above or below the grid
- Copies all rows (current page only) as TSV (tab-separated values) to clipboard
- Includes header row in copied content
- Brief confirmation: "Copied!" tooltip on button after click

### Empty Results
- When query returns 0 rows: grid shows "No results" message
- Header row still visible with column names
