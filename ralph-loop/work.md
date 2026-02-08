# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] Fix schema viewer in dataset panel: When opening a dataset from the right panel, it only shows number of rows and columns but doesn't list column names and types. Even clicking "Refresh schema" doesn't show columns. The schema viewer must display each column's name and data type.
- [ ] Add a "Visualize" button/card directly in the chat message response (in MessageBubble) whenever the LLM returns SQL query results. Clicking it should open/navigate to the Plotly visualization screen for the last SQL result. The Visualize option must be prominent and visible inline in the chat — not hidden in a side panel. Use the existing Plotly integration if already added, otherwise add it with react-plotly.js.
