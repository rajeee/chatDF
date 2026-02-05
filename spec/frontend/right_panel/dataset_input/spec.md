---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Dataset Input Specification

## Scope

### In Scope
- URL text input field
- Validation rules and error messages
- Submit behavior

### Out of Scope
- URL validation implementation (see backend/dataset_handling/spec.md)
- Dataset card display (see dataset_card/spec.md)

### Assumptions
- Only HTTP/HTTPS URLs accepted
- Server-side validation provides the definitive check

## Behavior

### Input Field
- Single-line text input
- Placeholder: "Paste parquet URL..."
- "Add" button adjacent to the input (to the right)
- Enter key submits (same as clicking Add)
- Input clears on successful submit

### Client-Side Validation

| Condition | Behavior | Error Message |
|-----------|----------|---------------|
| Empty URL | Add button disabled | (none — button just disabled) |
| Invalid URL format | Inline error below input | "Invalid URL format" |
| Duplicate URL | Inline error below input | "This dataset is already loaded" |
| At limit (5 datasets) | Input disabled | "Maximum 5 datasets" |

- Validation runs on input change (debounced ~300ms) and on submit
- URL format check: must start with http:// or https://, must contain at least one dot in hostname

### Server-Side Validation
- After client-side checks pass, URL is sent to backend
- Backend validates parquet format → may return:
  - "Not a valid parquet file" (inline error below input)
  - Network errors: "Could not access URL" (inline error below input)
- During server validation: Add button shows spinner, input remains disabled

### Success Flow
1. User pastes URL and clicks Add (or presses Enter)
2. Client-side validation passes
3. Input clears, new dataset card appears in loading state below
4. Backend validates and loads schema
5. Dataset card transitions to loaded state

### Error Display
- Inline error text below the input field
- Red/error color styling
- Error clears when user modifies the input text
- Only one error shown at a time (most recent)
