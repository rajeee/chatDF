---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Data Grid — Implementation Plan

## Component: `DataGrid.tsx`

Implements: [spec.md#display](./spec.md#display), [spec.md#headers](./spec.md#headers), [spec.md#pagination](./spec.md#pagination)

### File Location

`frontend/src/components/chat-area/DataGrid.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `columns` | `string[]` | Column names from query result |
| `rows` | `any[][]` | Row data (array of arrays), max 1000 rows |

### Dependencies

- `@tanstack/react-table` — headless table logic (sorting, pagination, column sizing).

### TanStack Table Setup

- Define `columnDefs` from `columns` prop: map each column name to a `ColumnDef` with `accessorFn: (row) => row[index]`.
- Create table instance via `useReactTable` with:
  - `data`: `rows` mapped to objects or used as-is with index-based accessors.
  - `columns`: generated `columnDefs`.
  - `getCoreRowModel()`, `getSortedRowModel()`, `getPaginationRowModel()`.
  - `enableColumnResizing: true`, `columnResizeMode: 'onChange'`.
  - `initialState.pagination.pageSize: 50`.

### Column Sorting

Implements: [spec.md#headers](./spec.md#headers)

- Single-column sort only: `enableMultiSort: false`.
- Click header to cycle: ascending, descending, none. TanStack Table handles this via `getSortedRowModel`.
- Sort indicator: render up/down arrow icon in header cell based on `column.getIsSorted()`.

### Column Resizing

Implements: [spec.md#column-resizing](./spec.md#column-resizing)

- TanStack Table's built-in column resizing via `column.getResizeHandler()`.
- Resize handle rendered as a draggable `<div>` on the right edge of each header cell.
- Minimum column width: set `minSize: 50` on each column def.
- Double-click resize handle: reset column to auto-fit. Implement by setting column size to `undefined` (TanStack recalculates).

### Sticky Header

Implements: [spec.md#headers](./spec.md#headers)

- Table rendered inside a `<div>` with `max-h-[400px] overflow-auto`.
- `<thead>` styled with `sticky top-0 z-10` and a background color to prevent content bleeding through.

### Pagination

Implements: [spec.md#pagination](./spec.md#pagination)

- Footer row below the table with:
  - "Previous" button: `table.previousPage()`, disabled when `!table.getCanPreviousPage()`.
  - "Next" button: `table.nextPage()`, disabled when `!table.getCanNextPage()`.
  - Page indicator: `Page {currentPage} of {pageCount}`.
  - Row indicator: `Showing {start}--{end} of {total} rows`.

### Cell Rendering

Implements: [spec.md#cell-content](./spec.md#cell-content)

- Text cells: `truncate` (Tailwind) for ellipsis. Full text on hover via `title` attribute.
- Null values: render as `<span class="italic text-gray-400">null</span>`.
- Number alignment: detect numeric columns (check first non-null value), apply `text-right` to those cells/headers.
- All cells read-only.

### Copy Table

Implements: [spec.md#copy-table](./spec.md#copy-table)

- "Copy table" button above the grid.
- Copies current page rows as TSV: header row + data rows, tab-separated, newline-delimited.
- Uses `navigator.clipboard.writeText()`.
- "Copied!" feedback via local `useState` toggle for 1.5 seconds.

### Empty Results

Implements: [spec.md#empty-results](./spec.md#empty-results)

- When `rows.length === 0`: render header row with column names, then a single row spanning all columns with "No results" centered text.

## Scope

### In Scope
- TanStack Table integration, sorting, resizing, pagination, cell rendering, copy

### Out of Scope
- Data fetching (data arrives via props from message)
- CSV/Excel export (not in V1 spec)
