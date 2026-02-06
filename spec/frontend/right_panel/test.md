---
status: draft
last_updated: 2026-02-05
tests:
  - ./spec.md
  - ./dataset_input/spec.md
  - ./dataset_card/spec.md
  - ./schema_modal/spec.md
  - ../theme/spec.md
---

# Right Panel Test Specification

## Scope

### In Scope
- Right panel container (layout, header, empty state)
- Dataset input (URL field, validation, submit flow)
- Dataset card (loading, loaded, error states; remove; ordering)
- Schema modal (content, table name editing, refresh, close)
- Theme behavior (light/dark/system, persistence, contrast)

### Out of Scope
- Backend URL validation and parquet parsing (see backend tests)
- WebSocket protocol (see backend tests)
- Dataset loading mechanics on server side (see backend tests)

---

## 1. Right Panel Container

Tests: [spec.md#behavior](./spec.md#behavior)

### 1.1 Layout

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| RP-01 | Always visible | Right panel visible on all viewports, no collapse toggle |
| RP-02 | Fixed width | Panel renders at ~280px, not resizable |
| RP-03 | Sections stacked | Dataset input at top, dataset cards list below |
| RP-04 | Cards scrollable | If cards exceed panel height, list scrolls independently |

### 1.2 Header

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| RP-05 | Title displays "Datasets" | Panel header shows "Datasets" |
| RP-06 | Count badge | Badge shows current/max count: e.g., "Datasets (3/5)" |
| RP-07 | Badge updates on add | Badge count increments when a dataset is added |
| RP-08 | Badge updates on remove | Badge count decrements when a dataset is removed |

### 1.3 Empty State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| RP-09 | No datasets message | When no datasets loaded, shows "No datasets loaded" text |

### 1.4 Card Ordering

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| RP-10 | Alphabetical sort | Loaded cards sorted alphabetically by table name |
| RP-11 | Loading cards at bottom | Cards in loading state appear below loaded cards |

---

## 2. Dataset Input

Tests: [dataset_input/spec.md](./dataset_input/spec.md)

### 2.1 Input Field

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DI-01 | URL field present | Single-line text input with placeholder "Paste parquet URL..." |
| DI-02 | Add button adjacent | "Add" button to the right of the input field |
| DI-03 | Enter key submits | Pressing Enter in the field triggers submit (same as clicking Add) |
| DI-04 | Input clears on success | After successful submit, input text clears |

### 2.2 Client-Side Validation

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DI-05 | Empty URL disables button | Add button disabled when input is empty |
| DI-06 | Invalid URL error | Non-URL text shows inline error: "Invalid URL format" |
| DI-07 | URL must have protocol | URL without http:// or https:// triggers invalid URL error |
| DI-08 | URL must have hostname dot | URL without a dot in hostname triggers invalid URL error |
| DI-09 | Duplicate URL error | Already-loaded URL shows: "This dataset is already loaded" |
| DI-10 | At limit (5 datasets) | Input disabled with message "Maximum 5 datasets" |
| DI-11 | Validation debounced | Validation runs on input change with ~300ms debounce |

### 2.3 Server-Side Validation

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DI-12 | Not parquet error | Backend rejects non-parquet URL: "Not a valid parquet file" |
| DI-13 | Network error | URL unreachable: "Could not access URL" |
| DI-14 | Spinner during validation | Add button shows spinner while server validates |
| DI-15 | Input disabled during validation | Input field disabled while server-side check runs |

### 2.4 Success Flow

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DI-16 | Input clears | Input clears after client-side validation passes |
| DI-17 | Card appears in loading | New dataset card appears in loading state in the card list |
| DI-18 | Card transitions to loaded | After backend loads schema, card transitions to loaded state |

### 2.5 Error Display

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DI-19 | Inline error below input | Error text displayed below the input field in red |
| DI-20 | Error clears on edit | Modifying the input text clears the displayed error |
| DI-21 | One error at a time | Only the most recent error is shown |

---

## 3. Dataset Card

Tests: [dataset_card/spec.md](./dataset_card/spec.md)

### 3.1 Loading State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DC-01 | Hostname displayed | Card shows URL hostname (e.g., "data.example.com/...") |
| DC-02 | Progress bar | Indeterminate progress bar displayed below hostname |
| DC-03 | No remove button | Remove button not shown during loading (V1) |

### 3.2 Loaded State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DC-04 | Table name shown (bold) | Table name displayed in bold (e.g., "sales") |
| DC-05 | Dimensions shown | Dimensions in muted text: "[133,433 x 23]" |
| DC-06 | Format: TableName [rows x cols] | Display follows `TableName [rows x cols]` format |
| DC-07 | Click opens schema modal | Clicking anywhere on the card opens the schema modal |
| DC-08 | X button on hover | Remove button (X) appears in top-right corner on hover |

### 3.3 Error State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DC-09 | Red border/tint | Card has red left border or red tint styling |
| DC-10 | Error message shown | Truncated error message displayed (e.g., "Could not access URL") |
| DC-11 | Retry button | "Retry" button present; clicking re-attempts loading from same URL |
| DC-12 | Remove always visible | Remove button (X) always visible on error cards (not hover-only) |

### 3.4 Remove Action

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DC-13 | Loaded: confirmation required | Removing a loaded dataset shows confirmation prompt |
| DC-14 | Confirmation message | Prompt: "Remove this dataset? The LLM will no longer have access to it." |
| DC-15 | Confirm removes card | Confirming removes the card from the list |
| DC-16 | Cancel preserves card | Canceling keeps the card in place |
| DC-17 | Error: no confirmation | Removing an error card removes immediately (no dialog) |
| DC-18 | Badge updates on remove | Dataset count badge in header decrements |

### 3.5 Card Ordering

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DC-19 | Alphabetical by table name | Loaded cards sorted alphabetically by table name |
| DC-20 | Loading cards at bottom | Cards still loading appear below sorted loaded cards |
| DC-21 | Error cards keep position | Error cards maintain their alphabetical position |

---

## 4. Schema Modal

Tests: [schema_modal/spec.md](./schema_modal/spec.md)

### 4.1 Trigger

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SM-01 | Opens on card click | Clicking a loaded dataset card opens the schema modal |
| SM-02 | Only one modal at a time | Opening a new modal closes any existing one |
| SM-03 | Modal overlay | Background dimmed with semi-transparent backdrop |
| SM-04 | Modal centered | Modal centered on screen, ~500px width |

### 4.2 Table Name

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SM-05 | Editable table name | Table name displayed as an inline editable text field |
| SM-06 | Pre-filled with current name | Field pre-populated with current table name |
| SM-07 | Save on blur | Clicking away from the field saves the new name |
| SM-08 | Save on Enter | Pressing Enter saves the new name |
| SM-09 | Name updates card | After rename, the dataset card display updates |
| SM-10 | Name updates LLM context | Table name change reflected in SQL query context |

### 4.3 Dimensions

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SM-11 | Dimensions displayed | Shows "133,433 rows x 23 columns" with thousands separators |
| SM-12 | Read-only | Dimensions text is not editable |

### 4.4 Column List

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SM-13 | Two-column table | Scrollable table with "Name" and "Type" columns |
| SM-14 | Schema order preserved | Columns listed in original parquet column order |
| SM-15 | Type: String/Utf8 -> "Text" | String types mapped to "Text" |
| SM-16 | Type: Int32/Int64 -> "Integer" | Integer types mapped to "Integer" |
| SM-17 | Type: Float32/Float64 -> "Decimal" | Float types mapped to "Decimal" |
| SM-18 | Type: Date/DateTime -> "Date" | Date types mapped to "Date" |
| SM-19 | Type: Boolean -> "Boolean" | Boolean types mapped to "Boolean" |
| SM-20 | Type: Other -> raw name | Unrecognized types shown as-is |
| SM-21 | Columns are read-only | Column names and types cannot be edited |

### 4.5 Refresh Schema

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SM-22 | Refresh button present | "Refresh Schema" button visible in the modal |
| SM-23 | Spinner while refreshing | Button shows spinner during refresh |
| SM-24 | Updates on success | Column list and dimensions update on successful refresh |
| SM-25 | Error on failure | Inline error shown if URL is no longer accessible |

### 4.6 Close

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SM-26 | Close via X button | X button in top-right corner closes the modal |
| SM-27 | Close via Escape | Pressing Escape closes the modal |
| SM-28 | Close via backdrop click | Clicking outside the modal (on backdrop) closes it |
| SM-29 | All close methods identical | All three close methods produce the same result |

---

## 5. Theme (Cross-Cutting)

Tests: [../theme/spec.md](../theme/spec.md)

### 5.1 Mode Switching

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| TH-01 | Light mode | Light backgrounds, dark text across all right panel components |
| TH-02 | Dark mode | Dark backgrounds, light text across all right panel components |
| TH-03 | System mode follows OS | When set to System, theme matches OS `prefers-color-scheme` |
| TH-04 | Default is System | First-time visitors see theme matching their OS preference |

### 5.2 Immediate Switching

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| TH-05 | No reload on switch | Theme changes apply immediately without page reload |
| TH-06 | Smooth transition | Color changes transition smoothly (~200ms CSS transition) |
| TH-07 | All components update | Dataset cards, schema modal, input field all reflect new theme |

### 5.3 Persistence

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| TH-08 | Saved in localStorage | Selected theme mode persisted to localStorage |
| TH-09 | Restored on load | Theme restored from localStorage on page load |
| TH-10 | Missing preference defaults | If localStorage has no theme, defaults to "System" |

### 5.4 Accessibility

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| TH-11 | WCAG AA in light mode | All text meets 4.5:1 contrast ratio in light mode |
| TH-12 | WCAG AA in dark mode | All text meets 4.5:1 contrast ratio in dark mode |
| TH-13 | Focus indicators visible | Focus outlines visible in both light and dark modes |
| TH-14 | Interactive elements distinguishable | Buttons, links, inputs visually distinct in both themes |
