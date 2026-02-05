---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Dataset Input - Implementation Plan

## Component: `DatasetInput.tsx`

File: `frontend/src/components/right-panel/DatasetInput.tsx`

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `conversationId` | `string` | Active conversation for the POST request |
| `datasetCount` | `number` | Current count, used to check 5-dataset limit |

### Internal State

- `url` (string): controlled input value.
- `error` (string | null): current validation error message.
- `isSubmitting` (boolean): true while awaiting server response.

### Validation Logic

Implements: [spec.md#client-side-validation](./spec.md#client-side-validation)

- Validation runs via `useEffect` on `url` with a 300ms debounce (using `setTimeout`/`clearTimeout`).
- Checks in order:
  1. Empty string: clear error, disable Add button.
  2. URL format: regex `/^https?:\/\/[^/]+\.[^/]+/` -- if fail, set error "Invalid URL format".
  3. Duplicate: check `datasetStore.datasets` for matching URL -- if found, set error "This dataset is already loaded".
- At-limit check (`datasetCount >= 5`): input and button both disabled, placeholder replaced with "Maximum 5 datasets".

### Submit Flow

Implements: [spec.md#server-side-validation](./spec.md#server-side-validation), [spec.md#success-flow](./spec.md#success-flow)

1. On Enter key or Add button click, run validation synchronously (skip debounce).
2. If valid: set `isSubmitting = true`, disable input + button, show spinner on button.
3. POST to `/conversations/${conversationId}/datasets` with body `{ url }`.
4. On success (201): clear `url`, `datasetStore.addDataset()` creates a loading-state entry.
5. On error (4xx/5xx): set `error` from response body `detail` field, re-enable input.
6. Set `isSubmitting = false`.

### API Call

- Uses `fetch` directly (not TanStack Query) -- this is a mutation triggered by user action, and the dataset lifecycle is managed by WebSocket events in `datasetStore`, not query cache.

### Error Display

Implements: [spec.md#error-display](./spec.md#error-display)

- Error text rendered below the input in a `<p>` with `text-error text-sm`.
- Error clears on any `url` state change (in the `onChange` handler).

### Layout

- Horizontal flex row: text input (`flex-1`) + Add button.
- Input: `<input type="text">` with placeholder "Paste parquet URL...".
- Button: fixed-width, text "Add", disabled when `url` is empty or `isSubmitting`.

## Alternatives Considered

- **TanStack Query mutation**: Rejected because dataset state flows through WebSocket events into `datasetStore`, making query cache redundant for this write path.
