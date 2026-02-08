# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [x] Fix per-conversation dataset state: When switching to a new chat, the right-side dataset panel should start empty. When switching back to a previous chat, show the datasets that were loaded in that session. Currently the loaded datasets don't change when switching conversations. *(Done: datasets tagged with conversation_id, filtered per conversation — e2ce521)*
- [x] Fix preset sources modal checkbox click targets: Clicking directly on the checkbox doesn't toggle it, only clicking on the name works. The entire row (including the checkbox itself) should be clickable. *(Done: stopPropagation on checkbox td prevents double-toggle — 314b8fd)*
- [ ] Fix schema viewer in dataset panel: When opening a dataset from the right panel, it only shows number of rows and columns but doesn't list column names and types. Even clicking "Refresh schema" doesn't show columns. The schema viewer must display each column's name and data type.
- [ ] Add a "Visualize" button/card directly in the chat message response (in MessageBubble) whenever the LLM returns SQL query results. Clicking it should open/navigate to the Plotly visualization screen for the last SQL result. The Visualize option must be prominent and visible inline in the chat — not hidden in a side panel. Use the existing Plotly integration if already added, otherwise add it with react-plotly.js.
