# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] Remove the "Copy SQL" button from chat message bubbles (MessageBubble). The copy button inside the SQL modal is sufficient — having it in the chat is redundant clutter.
- [ ] Fix the Visualize button in chat messages — clicking it does nothing right now. It must actually open the Plotly visualization screen showing a chart of the last SQL query results. Debug why the click handler isn't working and make it functional end-to-end.
