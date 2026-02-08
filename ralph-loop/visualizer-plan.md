# ChatDF Visualizer Plan

Comprehensive plan for adding LLM-driven chart visualization to ChatDF, informed by analysis of 9,277 Plotly chart artifacts from the ResStock postprocessing pipeline.

---

## 1. Catalog of Chart Types Found

The artifacts organize around a **3-axis taxonomy**: `{quantity_type}_{aggregation_type}_{visualization_type}`. Below are the 5 core Plotly visualization types found, each used with different quantity/aggregation semantics.

### 1.1 Horizontal Bar Chart (`bar`)
- **Plotly trace type**: `bar` with `orientation: "h"`
- **Data shape**: Categories on y-axis, numeric values on x-axis
- **Variants found**:
  - `absolute_average_bar` -- average absolute values per category (e.g., avg energy by fuel type)
  - `absolute_total_bar` -- total absolute values (e.g., stock-wide energy by fuel)
  - `savings_average_bar` -- average savings (difference from baseline) per category
  - `savings_total_bar` -- total savings across stock
  - `percent_savings_average_bar` -- average percent savings
  - `model_count_total_bar` -- count of models per group
  - `prevalence_total_bar` -- percentage prevalence of a category per group
- **Key features**: `barmode: "group"` or `barmode: "relative"` (stacked), multiple traces for upgrade scenarios, custom hover text with model counts, legend with "Upgrade Scenario" grouping
- **When faceted by group**: Multiple traces per group value shown together

### 1.2 Choropleth Map (`choropleth`)
- **Plotly trace type**: `choropleth` with `locationmode: "USA-states"`
- **Data shape**: State abbreviations as locations, numeric z-values for color
- **Variants found**:
  - `absolute_average_choropleth` -- avg values by state
  - `absolute_total_choropleth` -- total values by state
  - `savings_average_choropleth` -- avg savings by state
  - `savings_total_choropleth` -- total savings by state
  - `percent_savings_average_choropleth` -- avg percent savings by state
  - `model_count_total_choropleth` -- model counts by state
  - `prevalence_total_choropleth` -- prevalence percentages by state
- **Key features**: Multiple subplots (one per metric or facet) using `geo`, `geo2`, `geo3` etc., `scope: "usa"`, `projection: { type: "albers usa" }`, diverging color scale (red-white-green) centered at zero for savings, annotations as subplot titles, shared `coloraxis`
- **Layout**: Side-by-side small multiples with proportional domain allocation

### 1.3 Heatmap (`heatmap`)
- **Plotly trace type**: `heatmap`
- **Data shape**: x = scenario names (Baseline, Upgrade 1, ...), y = metric names, z = 2D array of values
- **Variants found**:
  - `absolute_average_heatmap` -- avg absolute values in grid
  - `absolute_total_heatmap` -- total absolute values in grid
  - `savings_average_heatmap` -- avg savings in grid
  - `savings_total_heatmap` -- total savings in grid
  - `percent_savings_average_heatmap` -- percent savings in grid
- **Key features**: Custom diverging colorscale (red for increase, green for decrease), shared `coloraxis`, multiple subplots via `xaxis`/`yaxis`/`xaxis2`/`yaxis2` etc. for faceting, annotations for facet labels, binary-encoded z-data (`bdata` format)

### 1.4 Box Plot (`box`)
- **Plotly trace type**: `box` with `orientation: "h"`
- **Data shape**: Pre-computed statistics (q1, median, q3, mean, lowerfence, upperfence) -- not raw data points
- **Variants found**:
  - `absolute_distribution_box` -- distribution of absolute values
  - `savings_distribution_box` -- distribution of savings values
  - `percent_savings_distribution_box` -- distribution of percent savings
- **Key features**: `boxmean: true` (shows mean marker), `boxpoints: "outliers"`, `whiskerwidth: 0.6`, background shading via scatter traces with `fill: "toself"` and `fillcolor: "rgba(240,242,241,0.8)"`, custom hover template showing building ID and value

### 1.5 Histogram (`histogram`)
- **Plotly trace type**: `bar` (pre-binned, NOT native Plotly `histogram`)
- **Data shape**: Pre-computed bin edges as x, percentage frequencies as y, variable-width bars
- **Variants found**:
  - `absolute_distribution_histogram` -- distribution of absolute values
  - `savings_distribution_histogram` -- distribution of savings values
  - `percent_savings_distribution_histogram` -- distribution of percent savings
- **Key features**: `barmode: "group"`, `bargap: 0`, `bargroupgap: 0`, custom bin widths via `width` array, `customdata` with bin edge ranges for hover, annotations for overflow/underflow bins and mean/median markers, faceted subplots (one per group value), y-axis shows "Percentage of models in bin" with `ticksuffix: "%"`

### 1.6 Summary of Unique Visualization Patterns

| Viz Type | Plotly Trace | Orientation | Faceting | Color Encoding |
|----------|-------------|-------------|----------|----------------|
| Bar | `bar` | horizontal | by group values | per-scenario colors |
| Choropleth | `choropleth` | map | by metric (small multiples) | diverging colorscale |
| Heatmap | `heatmap` | grid | by group values | diverging colorscale |
| Box | `box` | horizontal | N/A | per-scenario colors |
| Histogram | `bar` (pre-binned) | vertical | by group values (subplots) | per-scenario colors |

---

## 2. Function Call Schema

Design for the LLM to request visualizations via structured tool use. The LLM analyzes query results and emits a `create_chart` function call.

### 2.1 Tool Declaration

```json
{
  "name": "create_chart",
  "description": "Create an interactive chart visualization from query result data. Call this after executing a SQL query when the results would benefit from visual representation.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "chart_type": {
        "type": "STRING",
        "enum": ["bar", "horizontal_bar", "line", "scatter", "histogram", "pie", "box", "heatmap", "choropleth"],
        "description": "The type of chart to create"
      },
      "title": {
        "type": "STRING",
        "description": "Chart title"
      },
      "x_column": {
        "type": "STRING",
        "description": "Column name for x-axis (or categories for bar charts, locations for choropleth)"
      },
      "y_columns": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Column name(s) for y-axis values. Multiple columns create grouped/multi-series charts."
      },
      "color_column": {
        "type": "STRING",
        "description": "Optional column to use for color grouping (creates separate traces per unique value)"
      },
      "z_column": {
        "type": "STRING",
        "description": "Column for z-values (heatmap intensity, choropleth color). Required for heatmap and choropleth."
      },
      "orientation": {
        "type": "STRING",
        "enum": ["vertical", "horizontal"],
        "description": "Bar/box chart orientation. Default: vertical."
      },
      "aggregation": {
        "type": "STRING",
        "enum": ["none", "sum", "avg", "count", "min", "max"],
        "description": "Aggregation to apply if data needs grouping. Default: none (data already aggregated by SQL)."
      },
      "bar_mode": {
        "type": "STRING",
        "enum": ["group", "stack", "relative"],
        "description": "Bar chart grouping mode. Default: group."
      },
      "color_scale": {
        "type": "STRING",
        "enum": ["default", "diverging", "sequential", "categorical"],
        "description": "Color scale type. 'diverging' centers at zero (good for savings/changes). Default: default."
      },
      "x_label": {
        "type": "STRING",
        "description": "Custom x-axis label"
      },
      "y_label": {
        "type": "STRING",
        "description": "Custom y-axis label"
      },
      "show_values": {
        "type": "BOOLEAN",
        "description": "Show value labels on bars/points. Default: false."
      },
      "location_column": {
        "type": "STRING",
        "description": "Column containing location codes for choropleth (e.g., US state abbreviations)"
      },
      "location_mode": {
        "type": "STRING",
        "enum": ["USA-states", "country names", "ISO-3"],
        "description": "How to interpret location codes. Default: USA-states."
      }
    },
    "required": ["chart_type", "title"]
  }
}
```

### 2.2 Minimal vs. Full Calls

The LLM can make minimal calls (just `chart_type` + `title`) and the frontend auto-detects columns, or fully specified calls with every parameter. This allows:

- **Minimal**: `{ "chart_type": "bar", "title": "Energy by Fuel Type" }` -- frontend infers x_column and y_columns from data shape
- **Guided**: `{ "chart_type": "bar", "title": "Energy by Fuel", "x_column": "fuel_type", "y_columns": ["avg_kwh"], "orientation": "horizontal" }`
- **Full**: All parameters specified for complex multi-series or faceted charts

### 2.3 Response Format

The frontend receives the function call parameters along with the query result data (columns + rows) and renders the chart. No chart data is passed in the function call itself -- it references the most recent query execution result.

---

## 3. Architecture

### 3.1 End-to-End Flow

```
User asks question
    |
    v
LLM generates SQL --> execute_sql tool call
    |
    v
Backend executes query, returns results (columns + rows) via WS
    |
    v
LLM sees results, decides visualization is appropriate
    |
    v
LLM emits create_chart tool call with chart spec
    |
    v
Backend forwards chart spec to frontend via WS event
    |
    v
Frontend renders Plotly chart inline in chat message
    |
    v
User can tweak chart type, switch axes, open in modal
```

### 3.2 Backend Changes

#### 3.2.1 New Tool Declaration
Add `create_chart` to the `TOOLS` list in `llm_service.py` alongside `execute_sql` and `load_dataset`.

#### 3.2.2 Tool Call Handling
Unlike `execute_sql` which needs backend execution, `create_chart` is a **frontend-only tool**. The backend:
1. Receives the `create_chart` function call from Gemini
2. Sends it to the frontend via WebSocket as a new event type: `chart_spec`
3. Returns a success result to Gemini so it can continue the conversation

```python
# In the tool dispatch loop:
if function_call.name == "create_chart":
    chart_spec = json.loads(function_call.args)
    await ws_manager.send(user_id, ws_messages.chart_spec(
        chat_id=chat_id,
        message_id=message_id,
        execution_id=latest_execution_id,  # links to query results
        spec=chart_spec,
    ))
    # Return success to LLM
    tool_response = {"status": "chart_created", "chart_type": chart_spec["chart_type"]}
```

#### 3.2.3 System Prompt Enhancement
Add to the system prompt:
- When query results would benefit from visualization, call `create_chart`
- Guidelines for when to visualize (comparisons, distributions, trends, geographic data)
- Guidelines for chart type selection (bar for categories, line for time series, etc.)

#### 3.2.4 WS Message Type

```python
def chart_spec(chat_id, message_id, execution_id, spec):
    return {
        "type": "chart_spec",
        "chat_id": chat_id,
        "message_id": message_id,
        "execution_id": execution_id,
        "spec": spec,
    }
```

### 3.3 Frontend Changes

#### 3.3.1 WS Event Handler
In the WebSocket message handler, add a case for `chart_spec`:
- Store the chart spec associated with the execution
- Trigger rendering in the message bubble that contains that execution

#### 3.3.2 Chart Rendering Pipeline
```
chart_spec event received
    |
    v
Look up execution data (columns, rows) by execution_id
    |
    v
Merge LLM chart spec with auto-detection heuristics
    |
    v
Build Plotly config (traces + layout) from spec + data
    |
    v
Render via react-plotly.js (already installed)
```

#### 3.3.3 State Management
Add to the relevant Zustand store:
```typescript
interface ChartSpec {
  chartType: string;
  title: string;
  xColumn?: string;
  yColumns?: string[];
  colorColumn?: string;
  zColumn?: string;
  orientation?: "vertical" | "horizontal";
  aggregation?: string;
  barMode?: string;
  colorScale?: string;
  xLabel?: string;
  yLabel?: string;
  showValues?: boolean;
  locationColumn?: string;
  locationMode?: string;
}

// In execution state:
interface Execution {
  // ... existing fields ...
  chartSpec?: ChartSpec;  // NEW: LLM-requested chart
}
```

#### 3.3.4 User Overrides
After the LLM renders a chart, the user can:
1. Switch chart type via the existing type switcher buttons
2. Open in modal for full-screen view (existing ChartModal)
3. Change x/y axis column mapping via a dropdown
4. Toggle between LLM-suggested and auto-detected charts

### 3.4 Integration with Existing Code

The existing code already has:
- `ChartVisualization.tsx` -- renders Plotly charts with type switching (bar, line, scatter, histogram, pie, box)
- `ChartModal.tsx` -- modal for full-screen charts
- `chartDetection.ts` -- auto-detection heuristics
- `react-plotly.js` -- already lazy-loaded

The new system enhances rather than replaces:
- **Auto-detection** remains the fallback when the LLM does not emit `create_chart`
- **LLM spec** takes priority when provided, populating the chart with more semantic awareness
- The `ChartVisualization` component gains a new prop: `llmSpec?: ChartSpec` which overrides auto-detection when present

---

## 4. Plotly.js Mapping

For each chart type the LLM can request, the exact Plotly trace type and key configuration:

### 4.1 Bar Chart (`bar` / `horizontal_bar`)

```typescript
// Trace
{
  type: "bar",
  x: orientation === "horizontal" ? values : categories,
  y: orientation === "horizontal" ? categories : values,
  orientation: orientation === "horizontal" ? "h" : "v",
  name: seriesName,
  marker: { color: colorFromPalette },
}
// Layout
{
  barmode: barMode ?? "group",  // "group", "stack", "relative"
  xaxis: { title: { text: xLabel } },
  yaxis: { title: { text: yLabel }, type: "category" },
}
```

### 4.2 Line Chart (`line`)

```typescript
// Trace
{
  type: "scatter",
  mode: "lines+markers",
  x: xValues,
  y: yValues,
  name: seriesName,
  line: { color: colorFromPalette, width: 2 },
  marker: { size: 4 },
}
// Layout
{
  xaxis: { title: { text: xLabel } },
  yaxis: { title: { text: yLabel } },
}
```

### 4.3 Scatter Plot (`scatter`)

```typescript
// Trace
{
  type: "scatter",
  mode: "markers",
  x: xValues,
  y: yValues,
  name: seriesName,
  marker: { color: colorFromPalette, size: 6, opacity: 0.7 },
}
// Layout
{
  xaxis: { title: { text: xLabel } },
  yaxis: { title: { text: yLabel } },
}
```

### 4.4 Histogram (`histogram`)

```typescript
// For raw data (let Plotly bin):
{
  type: "histogram",
  x: values,
  name: seriesName,
  marker: { color: colorFromPalette },
}
// Layout
{
  barmode: "overlay",  // or "group" for comparing distributions
  xaxis: { title: { text: xLabel } },
  yaxis: { title: { text: "Count" } },
}

// For pre-binned data (like the artifacts):
{
  type: "bar",
  x: binCenters,
  y: frequencies,
  width: binWidths,
  name: seriesName,
}
```

### 4.5 Pie Chart (`pie`)

```typescript
// Trace
{
  type: "pie",
  labels: categories,
  values: numericValues,
  marker: { colors: palette },
  textinfo: "percent+label",
}
// Layout -- no axes needed
{
  // remove xaxis/yaxis
}
```

### 4.6 Box Plot (`box`)

```typescript
// From raw data:
{
  type: "box",
  y: values,  // or x for horizontal
  name: seriesName,
  orientation: orientation === "horizontal" ? "h" : "v",
  boxmean: true,
  boxpoints: "outliers",
  marker: { color: colorFromPalette },
}
// Layout
{
  yaxis: { title: { text: yLabel } },
}
```

### 4.7 Heatmap (`heatmap`)

```typescript
// Trace
{
  type: "heatmap",
  x: xCategories,
  y: yCategories,
  z: zMatrix,  // 2D array
  colorscale: colorScale === "diverging"
    ? [[0, "#d73027"], [0.5, "#ffffff"], [1, "#1a9850"]]
    : "Viridis",
  zmid: colorScale === "diverging" ? 0 : undefined,
  showscale: true,
}
// Layout
{
  xaxis: { title: { text: xLabel } },
  yaxis: { title: { text: yLabel }, type: "category" },
}
```

### 4.8 Choropleth (`choropleth`)

```typescript
// Trace
{
  type: "choropleth",
  locationmode: locationMode ?? "USA-states",
  locations: locationCodes,
  z: values,
  colorscale: colorScale === "diverging"
    ? [[0, "#944D54"], [0.5, "#FFFFFF"], [1, "#7DA544"]]
    : "Viridis",
  zmid: colorScale === "diverging" ? 0 : undefined,
  marker: { line: { color: "rgba(0,0,0,0.25)", width: 0.5 } },
  hovertemplate: "%{text}<br>%{z:,.2f}<extra></extra>",
  text: locationLabels,
}
// Layout
{
  geo: {
    scope: "usa",
    projection: { type: "albers usa" },
    showlakes: true,
    lakecolor: "white",
    bgcolor: "rgba(0,0,0,0)",
  },
}
```

### 4.9 Common Layout Settings (All Types)

```typescript
{
  paper_bgcolor: "rgba(0,0,0,0)",  // transparent, inherits from theme
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: isDark ? "#f9fafb" : "#111827", family: "Arial", size: 12 },
  margin: { t: 40, r: 24, b: 48, l: 56 },
  autosize: true,
  title: { text: chartTitle },
}
```

---

## 5. Auto-Detection Heuristics

When the LLM does not specify a chart type, or for the "suggest" mode, use these data-shape heuristics. These enhance the existing `chartDetection.ts` rules.

### 5.1 Column Classification

| Classification | Detection Rule |
|----------------|---------------|
| Numeric | >70% of sampled values parse as numbers |
| Date/Time | Matches ISO date, YYYY-MM-DD, or year-only (1900-2100) |
| Categorical | Non-numeric, non-date |
| Geographic | Column name contains "state", "country", "location", "region", or values match 2-letter state codes |
| Boolean | Only 2 unique values (true/false, yes/no, 0/1) |

### 5.2 Chart Type Selection Rules (Priority Order)

```
1. Geographic + Numeric --> Choropleth
   IF any column is geographic AND there is a numeric column
   THEN suggest choropleth (locationColumn=geo, zColumn=numeric)

2. Date/Time + Numeric(s) --> Line Chart
   IF one date column AND one or more numeric columns
   THEN suggest line chart (x=date, y=numerics)

3. 1 Categorical + 1 Numeric (small cardinality <=20) --> Bar Chart
   IF one categorical column with <=20 unique values AND one numeric column
   THEN suggest bar chart (x=categorical, y=numeric)

4. 1 Categorical (<=8 unique) + 1 Numeric --> also Pie Chart
   Secondary recommendation alongside bar

5. 2 Categorical + 1 Numeric --> Heatmap
   IF two categorical columns AND one numeric column
   THEN suggest heatmap (x=cat1, y=cat2, z=numeric)

6. 2+ Numeric columns (no categorical) --> Scatter Plot
   IF two or more numeric columns with no obvious category
   THEN suggest scatter (x=numeric1, y=numeric2)

7. 1 Numeric column only --> Histogram
   IF only one numeric column
   THEN suggest histogram

8. Multiple Numeric columns --> Box Plot
   Secondary recommendation for comparing distributions

9. 1 Categorical + Multiple Numeric --> Grouped Bar
   IF one categorical AND 2+ numeric columns
   THEN suggest grouped bar chart
```

### 5.3 Semantic Column Name Heuristics

Additionally, column names provide hints:

| Pattern in Column Name | Suggested Chart Modifier |
|----------------------|--------------------------|
| "percent", "%", "pct", "ratio" | Use percentage formatting, consider 0-100 range |
| "savings", "change", "delta", "diff" | Use diverging color scale (centered at 0) |
| "count", "total", "sum" | Use integer formatting |
| "date", "time", "year", "month" | Treat as time axis, suggest line chart |
| "state", "country", "region" | Treat as geographic, suggest choropleth |
| "category", "type", "group", "class" | Treat as categorical |
| "price", "cost", "usd", "$" | Use currency formatting |
| "kwh", "energy", "power" | Use appropriate unit in axis labels |

### 5.4 Data Volume Heuristics

| Row Count | Recommendation |
|-----------|---------------|
| 1-5 rows | Prefer bar chart or table; pie for proportions |
| 5-50 rows | Bar, line, scatter all viable |
| 50-500 rows | Scatter, histogram, box plot preferred over bar |
| 500+ rows | Histogram, box plot, heatmap (aggregate first via SQL) |

---

## 6. Implementation Phases

### Phase 1: MVP -- LLM-Driven Chart Spec (1-2 days)

**Goal**: LLM can request a chart, frontend renders it inline.

**Backend**:
- [ ] Add `create_chart` tool declaration to `llm_service.py`
- [ ] Add `chart_spec` WS message type to `ws_messages.py`
- [ ] Handle `create_chart` tool call in the tool dispatch loop (forward spec to frontend, return success to LLM)
- [ ] Add chart guidance to the system prompt (when to visualize, chart type selection tips)

**Frontend**:
- [ ] Add `chartSpec` field to execution state in Zustand store
- [ ] Handle `chart_spec` WS event in the WS message handler
- [ ] Modify `MessageBubble` to render chart inline when `chartSpec` is present on an execution
- [ ] Add `buildPlotlyConfigFromSpec()` function that converts LLM spec + data into Plotly config
- [ ] Support chart types: bar, horizontal_bar, line, scatter, histogram, pie, box (already in `ChartVisualization.tsx`)

**Scope**: bar, line, scatter, histogram, pie, box only. No heatmap/choropleth yet.

### Phase 2: Enhanced Chart Types (1-2 days)

**Goal**: Add heatmap and choropleth support.

**Frontend**:
- [ ] Add heatmap trace builder -- takes x/y categorical columns + z numeric column, pivots into 2D matrix
- [ ] Add choropleth trace builder -- takes location column + value column, renders US state map
- [ ] Add `heatmap` and `choropleth` to the chart type switcher
- [ ] Handle diverging color scales (centered at zero) for savings/change data
- [ ] Add geographic column detection to `chartDetection.ts`

**Backend**:
- [ ] Update system prompt with guidance for heatmap (2 categories + 1 value) and choropleth (geographic data)

### Phase 3: User Tweaking and Polish (1-2 days)

**Goal**: Users can modify the LLM's chart after rendering.

**Frontend**:
- [ ] Add column selector dropdowns (x-axis, y-axis, color-by) that appear above the chart
- [ ] Allow switching between LLM-suggested and auto-detected chart configurations
- [ ] Add "Chart Settings" popover: orientation toggle, bar mode toggle, color scale selector
- [ ] Smooth transitions when switching chart type or axes
- [ ] Chart appears inline in the chat message, with an "Expand" button to open in ChartModal
- [ ] Persist chart preferences per execution in state

### Phase 4: Advanced Features (2-3 days)

**Goal**: Rich visualizations matching the quality of the ResStock artifacts.

**Frontend**:
- [ ] Faceted subplots -- render small multiples when color_column has many values (use Plotly subplots)
- [ ] Annotations -- mean/median markers on histograms, value labels on bars
- [ ] Pre-binned histogram support (for when LLM pre-computes bins in SQL)
- [ ] Box plot with pre-computed statistics (q1, q3, median, mean, fences)
- [ ] Diverging colorscale with red-white-green for savings data
- [ ] Custom hover templates with formatted values and units
- [ ] Chart download as SVG/PNG button
- [ ] Dark mode aware color palettes

**Backend**:
- [ ] Add `format_for_chart` tool that reshapes data for specific chart types (e.g., pivot for heatmap)
- [ ] Add unit detection from column names (kwh, usd, %, hours) and pass to frontend for axis formatting

### Phase 5: Auto-Visualization (1 day)

**Goal**: Charts appear automatically when appropriate, without LLM explicitly requesting them.

**Frontend**:
- [ ] Enhanced `chartDetection.ts` with all heuristics from Section 5
- [ ] After every query execution, auto-detect if a chart would be valuable
- [ ] Show a collapsed "Suggested Chart" section that the user can expand
- [ ] If the LLM explicitly requests `create_chart`, show chart expanded by default
- [ ] If auto-detected only, show chart collapsed with a "View Chart" button

**Backend**:
- [ ] The LLM can choose NOT to call `create_chart` if the data does not warrant visualization
- [ ] System prompt guidance: "Only call create_chart when visual representation adds value beyond the table"

---

## Appendix A: Color Palettes

From the artifacts, the standard palettes used:

**Categorical (per-scenario)**:
```
#0079C2 (blue - Baseline)
#7DA544 (green - Upgrade)
#EF553B (red)
#ab63fa (purple)
#FFA15A (orange)
#19d3f3 (cyan)
```

**Diverging (for savings/changes, centered at 0)**:
```
Red end:  #944D54
Center:   #FFFFFF
Green end: #7DA544
```

**Sequential (for absolute values)**:
```
rgb(103,0,13) -> rgb(239,59,44) -> rgb(252,187,161) -> lightgray -> rgb(199,233,192) -> rgb(0,109,44) -> rgb(0,68,27)
```

## Appendix B: System Prompt Addition

```
## Visualization Guidelines

After executing a SQL query, consider whether the results would benefit from a chart.
Call create_chart when:
- Comparing values across categories (use bar chart)
- Showing trends over time (use line chart)
- Showing relationships between two numeric variables (use scatter plot)
- Showing distributions (use histogram or box plot)
- Showing geographic patterns (use choropleth)
- Showing a matrix of values (use heatmap)
- Showing proportions of a whole (use pie chart, only for <=8 categories)

Do NOT call create_chart when:
- The result is a single value or a very small table (1-2 rows)
- The user explicitly asked for just the data/table
- The query returned an error

Chart type selection:
- Bar: categorical comparison (horizontal for long labels)
- Line: time series or ordered sequences
- Scatter: correlation between two numeric columns
- Histogram: distribution of a single numeric column
- Box: comparing distributions across groups
- Pie: proportions (only <=8 categories)
- Heatmap: two categorical dimensions + one numeric value
- Choropleth: geographic data with state/country codes

Use diverging color_scale when data represents change, savings, or difference from a baseline.
Set show_values to true for bar charts with <=15 bars.
Set orientation to "horizontal" when category labels are long strings.
```

## Appendix C: File Inventory from Artifacts

- **Total files**: 9,277
- **HTML files**: 3,162 (interactive Plotly charts)
- **JSON files**: 2,953 (Plotly figure JSON specs)
- **SVG files**: 210 (static rendered charts)
- **Parquet files**: ~2,952 (source data for each chart)
- **Other**: 1 (workflow_snapshot.json)

The artifact directory structure encodes the full parameter space:
```
{Included Buildings} x {Vacancy} x {Plot Type} x {Grouped By} x {Quantity Group}
```

With 25 distinct plot types (5 viz types x 5 quantity types x varying aggregation types), 6 grouping options, 5 quantity groups, 4 building inclusion filters, and 2 vacancy filters.
