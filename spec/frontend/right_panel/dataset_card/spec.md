---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Dataset Card Specification

## Scope

### In Scope
- Card display states (loading, loaded, error)
- Card content and layout
- Remove action
- Click to open schema modal

### Out of Scope
- Schema modal details (see schema_modal/spec.md)
- Dataset loading backend (see backend/dataset_handling/spec.md)

### Assumptions
- Cards are compact to fit multiple in the right panel
- No drag-to-reorder in V1 (alphabetical by table name)

## Behavior

### Layout
- Compact card with consistent height per state
- Full width of the right panel (minus padding)

### States

#### Loading State
- Displays: URL hostname (e.g., "data.example.com/...")
- Indeterminate progress bar below the hostname
- No remove button during loading (V1 — keep it simple)

#### Loaded State
- Displays:
  - **Table name** (bold): e.g., "sales"
  - **Dimensions** (muted text): "[133,433 × 23]"
- Format: `TableName [rows × cols]`
- Click anywhere on the card → opens schema modal
- Remove button (X) visible in top-right corner on hover

#### Error State
- Displays:
  - Red left border or red tint
  - Error message (truncated if long): e.g., "Could not access URL"
  - "Retry" button
- Retry: re-attempts loading from the same URL
- Remove button (X) always visible (not just hover)

### Remove Action
- X button in top-right corner of card
- Loaded datasets: confirmation prompt "Remove this dataset? The LLM will no longer have access to it."
- Error datasets: no confirmation needed, removes immediately
- On remove:
  - Card disappears from list
  - Dataset count badge in panel header updates
  - If mid-conversation: backend notifies LLM that dataset is no longer available

### Ordering
- Cards sorted alphabetically by table name
- Loading cards appear at the bottom of the list (no table name yet)
- Error cards maintain their position
