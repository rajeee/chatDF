# Frontend Specification

## Layout

Three-panel layout (desktop-first):

```
┌─────────────┬────────────────────────┬──────────────┐
│  Left Panel │     Main Chat Area     │ Right Panel  │
│ (collapsible)│                        │ (always on)  │
│             │                        │              │
│ - History   │  - Messages            │ - URL input  │
│ - Settings  │  - Input textarea      │ - Dataset    │
│ - Usage     │  - Onboarding          │   cards      │
│ - Account   │                        │              │
└─────────────┴────────────────────────┴──────────────┘
```

## Left Panel (Collapsible)

### Chat History
- List of previous conversations
- Click to load conversation
- Shows conversation title/first message preview

### Settings
- Theme toggle (light/dark)
- Clear history option
- About/help link

### Usage Stats
- Token usage for current day
- Limits remaining (visual indicator)
- 5M token daily limit

### Account
- User avatar/name, logout option
- Sign-in required (no guest mode)

## Main Chat Area

### Empty State (No Datasets, No Chat)
- Onboarding guide with brief tutorial
- Example prompts user can click to get started
- Prompt to add a dataset via right panel

### Chat Messages
- User messages: right-aligned or distinct styling
- Assistant responses: left-aligned
- Tables: interactive data grid component
  - Sortable columns
  - Resizable columns
  - Sticky headers
  - Pagination for large results
- "Show SQL" button on relevant messages → opens SQL panel

### Loading States
- Step-by-step progress indicators:
  1. "Generating SQL..."
  2. "Executing query..."
  3. "Formatting response..."
- Skeleton/placeholder for incoming message

### SQL Panel
- External panel (slides in from right or bottom)
- Shows the executed SQL query
- Hidden by default
- Syntax highlighted
- Close button to dismiss

### Chat Input
- Multi-line textarea
- Shift+Enter for newlines
- Enter to send
- Always enabled (even without datasets loaded)
- Placeholder text: "Ask a question about your data..."

## Right Panel (Always Visible)

### Dataset Input Section
- URL text field
- "Add" button (explicit action required)
- Fixed limit on datasets (e.g., 5 max)
- Validation feedback for invalid URLs

### Dataset Cards
- Compact display format: `TableName [rows × cols]`
  - Example: `sales [133,433 × 23]`
- States:
  - Loading: progress bar within card
  - Loaded: shows dimensions
  - Error: error indicator with retry option
- Click card → opens schema modal
- Remove button (X) on each card

### Schema Modal
- Triggered by clicking a dataset card
- Contents:
  - Editable table name field
  - Row count, column count
  - Column list with names and data types
  - Close button

## Theme

- Light and dark mode support
- Toggle in settings panel
- Respect system preference as default
- Persist preference in localStorage

## Responsive Behavior

- Desktop-first design (optimized for 1200px+ width)
- Tablet: left panel collapsed by default
- Mobile: horizontal scroll acceptable, no dedicated mobile layout for V1

## Component Summary

| Component | Description |
|-----------|-------------|
| `LeftPanel` | Collapsible sidebar with history, settings, usage, account |
| `ChatArea` | Main message display and input |
| `RightPanel` | Dataset management panel |
| `DatasetCard` | Individual dataset display with loading states |
| `SchemaModal` | Dataset details popup |
| `SQLPanel` | Slide-out panel for viewing executed SQL |
| `DataGrid` | Interactive table for query results |
| `OnboardingGuide` | Empty state tutorial and example prompts |
