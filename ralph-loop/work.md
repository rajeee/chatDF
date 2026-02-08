# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] Add result visualization / plots using Plotly.js — when the LLM returns query results, offer a "Visualize" option that renders bar charts, line charts, scatter plots, box plots, histograms etc. Use plotly.js (react-plotly.js wrapper). This is a key differentiator from vision.md — users should be able to go from question to chart in one click. Start with auto-detecting the best chart type from the data shape, but also let users switch chart types.
