---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Dataset Card - Implementation Plan

## Component: `DatasetCard.tsx`

File: `frontend/src/components/right-panel/DatasetCard.tsx`

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `dataset` | `Dataset` | Object from `datasetStore` with fields: `id`, `url`, `status`, `tableName`, `rowCount`, `colCount`, `error` |

### Rendering by State

Implements: [spec.md#states](./spec.md#states)

The component renders one of three variants based on `dataset.status`:

#### `"loading"`

- Display: URL hostname extracted via `new URL(dataset.url).hostname`, truncated with ellipsis.
- Indeterminate progress bar: a `<div>` with Tailwind `animate-pulse` or a CSS keyframe shimmer on a colored bar.
- No remove button.

#### `"loaded"`

- Display: **table name** (bold, `font-semibold`) and dimensions `[rowCount x colCount]` (muted, `text-muted`).
- Row count formatted with `Intl.NumberFormat` for thousands separators.
- Entire card clickable -- `onClick` sets `uiStore.openSchemaModal(dataset.id)`.
- Remove button (X): visible on hover via `group-hover:opacity-100` (Tailwind group pattern).

#### `"error"`

- Display: red left border (`border-l-4 border-error`).
- Error message text, truncated to 2 lines with `line-clamp-2`.
- "Retry" button: calls `datasetStore.retryDataset(dataset.id)` which re-POSTs the URL.
- Remove button (X): always visible (not hover-gated).

### Remove Action

Implements: [spec.md#remove-action](./spec.md#remove-action)

- Remove handler: `datasetStore.removeDataset(dataset.id)`.
- For loaded datasets: use `window.confirm()` with the spec-defined message before removing. (V1 simplicity -- no custom modal.)
- For error datasets: remove immediately, no confirmation.
- The store action sends `DELETE /conversations/:id/datasets/:datasetId` and removes the entry from local state.

### State Updates via WebSocket

- `datasetStore` listens to WebSocket events (`dataset_loading`, `dataset_loaded`, `dataset_error`) and updates the `datasets` array entries by `id`.
- `DatasetCard` re-renders automatically via Zustand selector when its `dataset` object changes.

### Styling

- Card: rounded border, theme surface background, padding `p-3`, full width.
- Cursor: `cursor-pointer` on loaded cards, `cursor-default` on loading/error.
- Hover state on loaded cards: subtle background shift.

## Alternatives Considered

- **Custom confirmation modal**: Deferred to post-V1 per spec simplicity principle.
- **Separate components per state**: Rejected -- single component with conditional rendering is simpler and keeps state collocated.
