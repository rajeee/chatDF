---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Right Panel Test Plan

## Test Files

| File | Test Spec Scenarios | Component Under Test |
|------|-------------------|---------------------|
| `RightPanel.test.tsx` | RP-* | `RightPanel.tsx` |
| `DatasetInput.test.tsx` | DI-* | `DatasetInput.tsx` |
| `DatasetCard.test.tsx` | DC-* | `DatasetCard.tsx` |
| `SchemaModal.test.tsx` | SM-* | `SchemaModal.tsx` |

## RightPanel Tests (`RightPanel.test.tsx`)

Tests: [test.md#RP-LAYOUT-1 through RP-SCROLL-1](./test.md)

| Scenario | Approach |
|----------|----------|
| RP-LAYOUT-1 | Render `RightPanel`. Assert fixed width (~280px via computed style or CSS class). Assert non-resizable (no drag handles). |
| RP-LAYOUT-2 | Assert `DatasetInput` at top, `DatasetCard` list below. Assert header shows "Datasets" with count badge. |
| RP-COUNT-1 | Set 3 datasets in store. Assert badge shows "3/5". |
| RP-SCROLL-1 | Set 5 datasets (fills panel). Assert card list is scrollable (`overflow-y: auto`). |

## DatasetInput Tests (`DatasetInput.test.tsx`)

Tests: [test.md#DI-INPUT-1 through DI-SERVER-2](./test.md)

| Scenario | Approach |
|----------|----------|
| DI-INPUT-1 | Render. Assert input field with placeholder text. Type a URL. Assert value updates. |
| DI-SUBMIT-1 | Type valid URL, press Enter. Assert `POST /conversations/:id/datasets` called with `{url}`. Assert input cleared on success. |
| DI-VALIDATE-1 | Type empty string, press Enter. Assert error "URL is required" shown below input. Assert no API call. |
| DI-VALIDATE-2 | Type "not-a-url". Assert client-side error "Invalid URL format". |
| DI-VALIDATE-3 | Set dataset store with existing URL. Type same URL. Assert "This dataset is already loaded" error. |
| DI-VALIDATE-4 | Set 5 datasets in store. Assert input disabled with placeholder "Maximum 5 datasets". Press Enter. Assert no API call. |
| DI-SPINNER-1 | Type valid URL, submit. Assert spinner visible while API call pending. Assert input disabled during loading. |
| DI-SERVER-1 | Override MSW to return 400 "Not a valid parquet file". Submit URL. Assert error message displayed below input. |
| DI-SERVER-2 | Override MSW to return 400 "Could not access URL". Assert error displayed. |
| DI-CLEAR-1 | Show error, then start typing a new URL. Assert error clears. |

**Debounced validation**: The component validates with 300ms debounce. Use `vi.useFakeTimers()` and `vi.advanceTimersByTime(300)` to trigger validation in tests.

## DatasetCard Tests (`DatasetCard.test.tsx`)

Tests: [test.md#DC-LOADING-1 through DC-REMOVE-3](./test.md)

| Scenario | Approach |
|----------|----------|
| DC-LOADING-1 | Render card with `status: "loading"`. Assert hostname text shown (extracted from URL). Assert indeterminate progress bar visible. |
| DC-LOADED-1 | Render card with `status: "ready"`, `name: "table1"`, `row_count: 1000`, `column_count: 5`. Assert table name bold, dimensions "1,000 x 5" shown. |
| DC-LOADED-2 | Click on loaded card. Assert `uiStore.schemaModalDatasetId` set to this dataset's ID (modal opens). |
| DC-ERROR-1 | Render card with `status: "error"`, `error_message: "Not a valid parquet file"`. Assert red left border. Assert error text visible. Assert "Retry" button visible. |
| DC-ERROR-2 | Click "Retry" on error card. Assert `POST /conversations/:id/datasets` called (re-add). |
| DC-REMOVE-1 | Hover over loaded card. Assert remove (X) button appears. Click it. Assert confirmation prompt. Confirm. Assert `DELETE` called. |
| DC-REMOVE-2 | Click remove on error card. Assert immediate removal (no confirmation). |
| DC-REMOVE-3 | After removal, assert card disappears from list. Assert dataset count badge updates. |

**Hover interaction**: Use `userEvent.hover(card)` to trigger hover state. Assert remove button visibility.

**WebSocket updates**: Simulate `dataset_loaded` and `dataset_error` events via MSW WebSocket mock. Assert card transitions between states.

```ts
it("DC-WS-1 - transitions from loading to loaded on WebSocket event", async () => {
  // Start with loading card
  setDatasetsLoaded([{ ...createDataset(), status: "loading" }]);
  renderWithProviders(<DatasetCard dataset={...} />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  // Simulate WebSocket dataset_loaded
  chatWs.send(JSON.stringify({ type: "dataset_loaded", dataset_id: "ds-1", name: "table1", ... }));

  await waitFor(() => {
    expect(screen.getByText("table1")).toBeInTheDocument();
  });
});
```

## SchemaModal Tests (`SchemaModal.test.tsx`)

Tests: [test.md#SM-OPEN-1 through SM-REFRESH-2](./test.md)

| Scenario | Approach |
|----------|----------|
| SM-OPEN-1 | Set `uiStore.schemaModalDatasetId` to a dataset ID. Render. Assert modal visible with dataset info. |
| SM-CLOSE-1 | Click X button. Assert modal closes (`schemaModalDatasetId` set to null). |
| SM-CLOSE-2 | Press Escape. Assert modal closes. |
| SM-CLOSE-3 | Click backdrop (outside modal content). Assert modal closes. |
| SM-NAME-1 | Assert table name input field contains current name. Type new name. Assert input updates. (Actual rename via API on blur or Enter — assert API call made.) |
| SM-DIMS-1 | Assert dimensions displayed as read-only text (e.g., "1,000 rows x 5 columns"). |
| SM-COLUMNS-1 | Assert column list table with "Name" and "Type" headers. Assert each column from `schema_json` listed. |
| SM-REFRESH-1 | Click "Refresh Schema" button. Assert `POST /conversations/:id/datasets/:datasetId/refresh` called. Assert spinner during refresh. |
| SM-REFRESH-2 | Mock refresh to return updated schema (different row count). Assert modal updates with new data. |
| SM-FOCUS-1 | Open modal. Assert table name input receives focus automatically. |

**Modal portal**: The modal renders via a portal. Use `screen.getByRole("dialog")` to find it regardless of DOM position.

**Escape key**: Use `userEvent.keyboard("{Escape}")` to test keyboard close.

**Backdrop click**: Find the backdrop element (usually a full-screen overlay behind the modal content) and click it.

## Scope

### In Scope
- All right panel test scenarios from right_panel/test.md
- Component rendering in all states (loading, loaded, error)
- User interactions (submit, click, hover, keyboard)
- Client-side validation logic
- WebSocket-driven state transitions
- Modal behavior (open, close, focus management)

### Out of Scope
- Dataset validation pipeline (backend handles; MSW returns results)
- Worker pool operations (backend concern)
- E2E dataset loading flow (see top-level test_plan.md)
