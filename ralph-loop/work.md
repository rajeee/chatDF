# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [x] Add a "Visualize" button/card directly in the chat message response (in MessageBubble) whenever the LLM returns SQL query results. Clicking it should open/navigate to the Plotly visualization screen for the last SQL result. The Visualize option must be prominent and visible inline in the chat — not hidden in a side panel. Use the existing Plotly integration if already added, otherwise add it with react-plotly.js. — Done in iteration 56: green "Visualize" button with chart icon appears inline in MessageBubble when results have chartable data. Opens SQL result modal directly in chart view via new `openSqlChartModal` uiStore action.
