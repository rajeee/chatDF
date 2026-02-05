---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Right Panel - Implementation Plan

## Component: `RightPanel.tsx`

Implements: [spec.md#layout](./spec.md#layout), [spec.md#header](./spec.md#header)

File: `frontend/src/components/right-panel/RightPanel.tsx`

### Structure

- Outer container: fixed-width `w-[280px]` div with full height, right border, vertical flex layout.
- Header section: "Datasets" title with count badge rendered as `(current/5)`.
- Body section: `DatasetInput` at top, scrollable `DatasetCardList` below (`overflow-y-auto flex-1`).

### State

- Reads `datasets` array from `datasetStore` (Zustand) for the active conversation.
- Count badge derived: `datasets.length` / `MAX_DATASETS` constant (5).
- Empty state text rendered when `datasets.length === 0`.

### Sorting

Implements: [spec.md#dataset-cards-list](./spec.md#dataset-cards-list)

- Cards sorted alphabetically by `tableName` for loaded datasets.
- Loading datasets (no `tableName` yet) appended at the end.
- Sorting done in a `useMemo` over the datasets array.

### Children

| Child | Props |
|-------|-------|
| `DatasetInput` | `conversationId`, `datasetCount` |
| `DatasetCard` (mapped) | `dataset` object per item |

### Styling

- Background: theme surface color via CSS variable (`bg-surface`).
- Border-left separator using theme border color.
- Padding: `p-4` with `gap-3` between sections.

## Alternatives Considered

- **Resizable panel**: Rejected per spec -- fixed width, not resizable in V1.
- **Collapsible panel**: Rejected per spec -- always visible in V1.
