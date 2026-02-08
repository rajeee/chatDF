# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] Fix per-conversation dataset state: When switching to a new chat, the right-side dataset panel should start empty. When switching back to a previous chat, show the datasets that were loaded in that session. Currently the loaded datasets don't change when switching conversations.
- [ ] Fix preset sources modal checkbox click targets: Clicking directly on the checkbox doesn't toggle it, only clicking on the name works. The entire row (including the checkbox itself) should be clickable.
- [ ] Fix schema viewer in dataset panel: When opening a dataset from the right panel, it only shows number of rows and columns but doesn't list column names and types. Even clicking "Refresh schema" doesn't show columns. The schema viewer must display each column's name and data type.
- [ ] Add result visualization / plots using Plotly.js — when the LLM returns query results, offer a "Visualize" option that renders bar charts, line charts, scatter plots, box plots, histograms etc. Use plotly.js (react-plotly.js wrapper). Auto-detect the best chart type from the data shape, but also let users switch chart types.
