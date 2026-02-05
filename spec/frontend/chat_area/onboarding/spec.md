---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Onboarding Specification

## Scope

### In Scope
- Empty state display when no datasets loaded
- Sample data loading
- Example prompt chips

### Out of Scope
- Dataset loading mechanics (see right_panel/dataset_input/spec.md)
- Chat message display (see message_list/spec.md)

### Assumptions
- A publicly accessible sample parquet URL is preconfigured (e.g., NREL building stock or similar public dataset)

## Behavior

### Display Condition
- Shown when no datasets are loaded in the current conversation
- Replaces the message list area
- Disappears once the user sends their first message (replaced by message list)

### Content Layout (centered vertically and horizontally)
1. **App logo/title**: ChatDF branding
2. **Description**: "Chat with your data using natural language"
3. **Step-by-step guide**:
   - Step 1: "Add a parquet URL" → arrow pointing to right panel
   - Step 2: "Ask a question"
   - Step 3: "Get answers with SQL transparency"
4. **"Try with sample data" button**:
   - Prominent call-to-action button
   - On click: loads a pre-configured demo parquet URL into the right panel
   - Dataset loads in background (dataset card appears in right panel with loading state)
   - Once loaded, onboarding transitions to show example prompts
5. **Example prompt chips** (visible after sample data loads):
   - 3-4 clickable chips with example questions relevant to the sample dataset
   - Examples: "How many buildings are in the dataset?", "What are the average energy costs by state?"
   - Clicking a chip sends it as a user message

### Transitions
- When "Try with sample data" is clicked: button disables, shows loading spinner briefly
- Once sample data loaded: step-by-step guide fades, example chips appear
- Once user sends first message (via chip or typing): entire onboarding disappears, message list takes over

### Visual Style
- Muted, welcoming tone
- Generous whitespace
- Icons or illustrations for each step (simple, not elaborate)
