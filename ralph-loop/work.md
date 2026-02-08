# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [x] Add result visualization / plots using Plotly.js — Done (iteration 51). Added ChartVisualization component with auto-detect (bar, line, scatter, histogram, pie, box), Table/Chart toggle in result modal, "Visualize" shortcut button on query blocks, lazy-loaded Plotly.js. 20 unit tests for chart detection + 2 integration tests for SQLPanel.
