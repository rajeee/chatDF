# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## Tasks

- [ ] **Phase 1 — LLM-Driven Chart Visualization MVP**: Implement the visualizer plan from `/home/ubuntu/chatDF/ralph-loop/visualizer-plan.md` Phase 1. READ THAT FILE FIRST for full details. Summary: (1) Add `create_chart` tool declaration to Gemini tools in `llm_service.py` alongside `execute_sql` — schema has: chart_type, title, x_column, y_columns, color_column, z_column, orientation, aggregation, bar_mode, color_scale, x_label, y_label, show_values. (2) Add `chart_spec` WS message type in `ws_messages.py`. (3) Handle `create_chart` tool call in the tool dispatch loop — forward spec to frontend via WS, return success to LLM. (4) Add chart visualization guidelines to the system prompt (see Appendix B in the plan). (5) Frontend: handle `chart_spec` WS event, store chartSpec on execution in Zustand, render Plotly chart inline in message bubble using `buildPlotlyConfigFromSpec()`. Support bar, horizontal_bar, line, scatter, histogram, pie, box. The existing `ChartVisualization.tsx` and `react-plotly.js` are already installed — enhance rather than replace. LLM spec takes priority over auto-detection when present. DO NOT PRUNE THIS TASK — it was added by the human and must stay until completed.

- [ ] **Phase 2 — Heatmap & Choropleth**: After Phase 1 is done and committed, add heatmap and choropleth chart types per the visualizer plan Phase 2. Add heatmap trace builder (pivots x/y categorical + z numeric into 2D matrix), choropleth trace builder (location column + value column, US state map with `albers usa` projection), diverging color scales centered at zero for savings/change data, geographic column detection in `chartDetection.ts`. Update system prompt with guidance for when to use heatmap and choropleth. DO NOT PRUNE THIS TASK.

- [ ] **Phase 3 — Chart User Tweaking & Polish**: After Phase 2 is done, add user controls per visualizer plan Phase 3. Column selector dropdowns (x-axis, y-axis, color-by) above the chart, chart type switcher, orientation toggle, bar mode toggle, color scale selector, smooth transitions when switching, "Expand" button to open in ChartModal, persist chart preferences per execution. DO NOT PRUNE THIS TASK.
