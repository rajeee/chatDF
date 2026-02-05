---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Schema Modal Specification

## Scope

### In Scope
- Modal display and content
- Table name editing
- Column list display
- Schema refresh
- Close behavior

### Out of Scope
- Schema extraction (see backend/dataset_handling/spec.md)
- Dataset card behavior (see dataset_card/spec.md)

### Assumptions
- Schema data comes from the backend (already loaded and cached)
- Column types mapped to user-friendly labels

## Behavior

### Trigger
- Opened by clicking on a loaded dataset card in the right panel
- Only one modal open at a time

### Layout
- Modal overlay: dims background with semi-transparent backdrop
- Modal centered on screen
- Width: ~500px (responsive, narrower on small screens)
- Max height: 80vh, content scrolls if needed

### Content

#### Table Name
- Editable inline text field
- Pre-filled with current table name (e.g., "sales")
- Saves on blur (clicking away) or pressing Enter
- Name change updates:
  - Dataset card display
  - LLM context (the table name used in SQL queries)

#### Dimensions
- Read-only text: "133,433 rows × 23 columns"
- Formatted with thousands separators

#### Column List
- Scrollable table with two columns:

| Column Header | Content |
|---------------|---------|
| Name | Column name from parquet schema |
| Type | User-friendly type label |

- Type mapping:
  - String/Utf8 → "Text"
  - Int32/Int64 → "Integer"
  - Float32/Float64 → "Decimal"
  - Date/DateTime → "Date"
  - Boolean → "Boolean"
  - Other → raw type name as-is

- Columns listed in schema order (original parquet column order)
- No editing of column names or types (read-only)

### Actions

#### Refresh Schema
- Button labeled "Refresh Schema"
- Re-fetches schema from the original URL
- Shows spinner while refreshing
- Updates column list and dimensions on success
- Shows inline error if URL is no longer accessible

#### Close
- X button in top-right corner of modal
- Escape key
- Click outside the modal (on backdrop)
- All three methods close the modal identically
