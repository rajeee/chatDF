---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Right Panel Specification

## Scope

### In Scope
- Panel container layout
- Section ordering
- Dataset count display

### Out of Scope
- Individual section behavior (see child specs)
- Dataset loading mechanics (see backend/dataset_handling/spec.md)

### Assumptions
- Right panel is always visible and not collapsible (V1)
- Maximum 5 datasets per conversation

## Behavior

### Layout
- Fixed-width panel on the right side of the application
- Width: ~280px, not resizable
- Always visible — no collapse/expand toggle (V1)
- Sections stacked vertically:
  1. Dataset URL input (top)
  2. Dataset cards list (below)

### Header
- Panel title: "Datasets"
- Count badge next to title showing current/max: e.g., "Datasets (3/5)"
- Badge updates in real-time as datasets are added or removed

### Dataset Cards List
- Vertically stacked below the input section
- Scrollable if cards exceed panel height
- Cards ordered alphabetically by table name
- Empty state: subtle text "No datasets loaded"

### Interaction with Chat Area
- Adding a dataset: triggers loading in background, card appears immediately
- Removing a dataset: updates LLM context, notifies user in chat if mid-conversation
- Dataset schema available to chat after loading completes

## Child Specs
- [Dataset Input](./dataset_input/spec.md)
- [Dataset Card](./dataset_card/spec.md)
- [Schema Modal](./schema_modal/spec.md)
