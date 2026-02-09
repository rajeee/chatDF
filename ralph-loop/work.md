# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] **Phase 2 — Heatmap & Choropleth**: After Phase 1 is done and committed, add heatmap and choropleth chart types per the visualizer plan Phase 2. Add heatmap trace builder (pivots x/y categorical + z numeric into 2D matrix), choropleth trace builder (location column + value column, US state map with `albers usa` projection), diverging color scales centered at zero for savings/change data, geographic column detection in `chartDetection.ts`. Update system prompt with guidance for when to use heatmap and choropleth. DO NOT PRUNE THIS TASK.

- [ ] **Phase 3 — Chart User Tweaking & Polish**: After Phase 2 is done, add user controls per visualizer plan Phase 3. Column selector dropdowns (x-axis, y-axis, color-by) above the chart, chart type switcher, orientation toggle, bar mode toggle, color scale selector, smooth transitions when switching, "Expand" button to open in ChartModal, persist chart preferences per execution. DO NOT PRUNE THIS TASK.
