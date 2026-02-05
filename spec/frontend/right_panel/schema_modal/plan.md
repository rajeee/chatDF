---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Schema Modal - Implementation Plan

## Component: `SchemaModal.tsx`

File: `frontend/src/components/right-panel/SchemaModal.tsx`

### Visibility

Implements: [spec.md#trigger](./spec.md#trigger)

- Controlled by `uiStore.schemaModalDatasetId` (string | null).
- When non-null, modal renders; when null, modal unmounts.
- Dataset data read from `datasetStore` by ID.

### Close Behavior

Implements: [spec.md#close](./spec.md#close)

- Three close triggers, all call `uiStore.closeSchemaModal()`:
  1. X button click in top-right corner.
  2. `Escape` key -- `useEffect` registers a `keydown` listener on mount, removes on unmount.
  3. Backdrop click -- `onClick` on the overlay div; inner modal content uses `e.stopPropagation()`.

### Layout

Implements: [spec.md#layout](./spec.md#layout)

- Overlay: fixed position, full viewport, semi-transparent background (`bg-black/50`).
- Modal container: centered with `flex items-center justify-center`, max-width `max-w-[500px]`, max-height `max-h-[80vh]`, overflow-y-auto on the content area.
- Sections stacked vertically: table name, dimensions, column list, refresh button.

### Table Name Editing

Implements: [spec.md#table-name](./spec.md#table-name)

- Rendered as a controlled `<input>` field, pre-filled with `dataset.tableName`.
- Local state `editedName` tracks current value.
- On blur or Enter key: if changed, call `datasetStore.renameDataset(dataset.id, editedName)`.
- The store action sends `PATCH /conversations/:id/datasets/:datasetId` with `{ tableName }` and updates local state.

### Dimensions

Implements: [spec.md#dimensions](./spec.md#dimensions)

- Read-only text: `"{rowCount} rows x {colCount} columns"`.
- Both numbers formatted with `Intl.NumberFormat` for thousands separators.

### Column List

Implements: [spec.md#column-list](./spec.md#column-list)

- Rendered as a `<table>` with two columns: Name, Type.
- Type mapping function (pure utility in `lib/typeMapping.ts`):

| Parquet Type | Display Label |
|-------------|---------------|
| String, Utf8 | Text |
| Int32, Int64 | Integer |
| Float32, Float64 | Decimal |
| Date, DateTime | Date |
| Boolean | Boolean |
| (other) | Raw type name |

- Columns rendered in schema order (array index order from backend).
- Table body scrolls within the modal's max-height constraint.

### Refresh Schema

Implements: [spec.md#refresh-schema](./spec.md#refresh-schema)

- Button at bottom of modal: "Refresh Schema".
- Local `isRefreshing` state controls spinner display.
- Calls `POST /conversations/:id/datasets/:datasetId/refresh`.
- On success: `datasetStore` updates the dataset entry with new schema data.
- On error: display inline error text below the button.

### Focus Management

- On open: focus the table name input field via `useRef` + `useEffect`.
- On close: focus returns naturally (no explicit restore needed for V1).

## Alternatives Considered

- **Headless UI Dialog**: Could use `@headlessui/react` for accessible modal primitives. Deferred -- native implementation sufficient for V1; can adopt later if accessibility audit requires it.
- **Inline rename on card**: Rejected per spec -- rename happens in the modal.
