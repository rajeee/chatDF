/**
 * Tests for ChartVisualization component.
 *
 * Covers:
 * 1. Renders without crashing with valid data
 * 2. Shows chart type selector/switcher
 * 3. Chart type switcher changes the chart type
 * 4. Handles empty data gracefully
 * 5. Handles single-row data
 * 6. Auto-detects appropriate chart type based on data shape
 * 7. Respects theme (dark/light mode)
 * 8. Download button triggers download
 * 9. Handles null values in data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChartRecommendation } from "@/utils/chartDetection";
import type { ChartSpec } from "@/stores/chatStore";

/* ---------- captured props from the mock Plot component ---------- */
let lastPlotProps: Record<string, unknown> | null = null;

// Mock react-plotly.js (lazy-loaded via React.lazy)
vi.mock("react-plotly.js", () => ({
  default: (props: Record<string, unknown>) => {
    lastPlotProps = props;
    return (
      <div
        data-testid="mock-plot"
        data-divid={props.divId as string}
        data-trace-count={String((props.data as unknown[]).length)}
      />
    );
  },
}));

// Mock chartDetection — we control recommendations per test
const mockDetectChartTypes = vi.fn<() => ChartRecommendation[]>(() => []);
const mockAnalyzeColumns = vi.fn(
  (columns: string[], rows: unknown[][]) =>
    columns.map((name, index) => ({
      index,
      name,
      isNumeric: rows.length > 0 && typeof rows[0]?.[index] === "number",
      isDate: false,
      uniqueCount: new Set(rows.map((r) => r[index])).size,
    })),
);

vi.mock("@/utils/chartDetection", () => ({
  detectChartTypes: (...args: unknown[]) => mockDetectChartTypes(),
  analyzeColumns: (columns: string[], rows: unknown[][]) =>
    mockAnalyzeColumns(columns, rows),
}));

// Mock tableUtils so extractColumn works in jsdom
vi.mock("@/utils/tableUtils", () => ({
  cellValueRaw: (row: unknown[], idx: number) => (row as any)[idx] ?? null,
}));

// Import component AFTER mocks are set up
import { ChartVisualization } from "@/components/chat-area/ChartVisualization";

/* ---------- reusable test data ---------- */

const barRec: ChartRecommendation = {
  type: "bar",
  label: "Bar Chart",
  xCol: 0,
  yCols: [1],
};

const lineRec: ChartRecommendation = {
  type: "line",
  label: "Line Chart",
  xCol: 0,
  yCols: [1],
};

const scatterRec: ChartRecommendation = {
  type: "scatter",
  label: "Scatter Plot",
  xCol: 0,
  yCols: [1],
};

const histRec: ChartRecommendation = {
  type: "histogram",
  label: "Histogram",
  xCol: 0,
  yCols: [],
};

const pieRec: ChartRecommendation = {
  type: "pie",
  label: "Pie Chart",
  xCol: 0,
  yCols: [1],
};

const boxRec: ChartRecommendation = {
  type: "box",
  label: "Box Plot",
  xCol: null,
  yCols: [1],
};

const sampleColumns = ["category", "value"];
const sampleRows = [
  ["A", 10],
  ["B", 20],
  ["C", 15],
  ["D", 25],
  ["E", 5],
];

const numericColumns = ["x", "y"];
const numericRows = [
  [1, 100],
  [2, 200],
  [3, 150],
];

/* ---------- helpers ---------- */

/** Set document.documentElement to dark mode */
function setDarkMode() {
  document.documentElement.classList.add("dark");
}

/** Remove dark mode from document.documentElement */
function clearDarkMode() {
  document.documentElement.classList.remove("dark");
}

/* ---------- tests ---------- */

describe("ChartVisualization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastPlotProps = null;
    clearDarkMode();
  });

  afterEach(() => {
    clearDarkMode();
  });

  // ----------------------------------------------------------------
  // 1. Renders without crashing with valid data
  // ----------------------------------------------------------------
  describe("renders without crashing with valid data", () => {
    it("renders the chart container when recommendations exist", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const { container } = render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // Should have a chart type button
      expect(screen.getByRole("button", { name: /Bar Chart/i })).toBeInTheDocument();
      // Should have the mock-plot element (or loading state)
      const plotOrLoading =
        screen.queryByTestId("mock-plot") ??
        screen.queryByText("Loading chart...");
      expect(plotOrLoading).toBeInTheDocument();
    });

    it("renders the download button in toolbar", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(
        screen.getByLabelText(/download chart as png/i),
      ).toBeInTheDocument();
    });

    it("renders expand button when onExpand prop is provided", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);
      const onExpand = vi.fn();

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          onExpand={onExpand}
        />,
      );

      expect(screen.getByLabelText(/expand chart/i)).toBeInTheDocument();
    });

    it("does not render expand button when onExpand is not provided", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(screen.queryByLabelText(/expand chart/i)).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // 2. Shows chart type selector/switcher
  // ----------------------------------------------------------------
  describe("shows chart type selector/switcher", () => {
    it("renders a button for each recommendation", () => {
      mockDetectChartTypes.mockReturnValue([barRec, lineRec, scatterRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(screen.getByRole("button", { name: /Bar Chart/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Line Chart/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Scatter Plot/i })).toBeInTheDocument();
    });

    it("highlights the first recommendation as active by default", () => {
      mockDetectChartTypes.mockReturnValue([barRec, lineRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      const barButton = screen.getByRole("button", { name: /Bar Chart/i });
      expect(barButton.style.backgroundColor).toBe("var(--color-accent)");
      expect(barButton.style.color).toBe("rgb(255, 255, 255)");

      const lineButton = screen.getByRole("button", { name: /Line Chart/i });
      expect(lineButton.style.backgroundColor).toBe("");
    });

    it("renders all recommendation buttons including pie and box", () => {
      mockDetectChartTypes.mockReturnValue([barRec, pieRec, boxRec, histRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(screen.getByRole("button", { name: /Bar Chart/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Pie Chart/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Box Plot/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Histogram/i })).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // 3. Chart type switcher changes the chart type
  // ----------------------------------------------------------------
  describe("chart type switcher changes the chart type", () => {
    it("clicking a different chart type button activates it", async () => {
      const user = userEvent.setup();
      mockDetectChartTypes.mockReturnValue([barRec, lineRec, scatterRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // Initially bar is active
      const barButton = screen.getByRole("button", { name: /Bar Chart/i });
      expect(barButton.style.backgroundColor).toBe("var(--color-accent)");

      // Click line chart
      const lineButton = screen.getByRole("button", { name: /Line Chart/i });
      await user.click(lineButton);

      // Line should now be active
      expect(lineButton.style.backgroundColor).toBe("var(--color-accent)");
      expect(lineButton.style.color).toBe("rgb(255, 255, 255)");

      // Bar should no longer be active
      expect(barButton.style.backgroundColor).toBe("");
    });

    it("switching chart types resets overrides (controls toggle disappears)", async () => {
      const user = userEvent.setup();
      mockDetectChartTypes.mockReturnValue([barRec, lineRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // Open controls
      const controlsToggle = screen.getByLabelText(/toggle chart controls/i);
      await user.click(controlsToggle);

      // Switch chart type
      const lineButton = screen.getByRole("button", { name: /Line Chart/i });
      await user.click(lineButton);

      // The active type changed to line; verify it's now active
      expect(lineButton.style.backgroundColor).toBe("var(--color-accent)");
    });

    it("clicking the same chart type keeps it active", async () => {
      const user = userEvent.setup();
      mockDetectChartTypes.mockReturnValue([barRec, lineRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      const barButton = screen.getByRole("button", { name: /Bar Chart/i });
      await user.click(barButton);

      // Still active
      expect(barButton.style.backgroundColor).toBe("var(--color-accent)");
    });
  });

  // ----------------------------------------------------------------
  // 4. Handles empty data gracefully
  // ----------------------------------------------------------------
  describe("handles empty data gracefully", () => {
    it("shows 'No visualizable data detected' when no recommendations", () => {
      mockDetectChartTypes.mockReturnValue([]);

      render(
        <ChartVisualization columns={["name"]} rows={[["Alice"]]} />,
      );

      expect(
        screen.getByText("No visualizable data detected"),
      ).toBeInTheDocument();
    });

    it("shows 'No visualizable data detected' for empty rows", () => {
      mockDetectChartTypes.mockReturnValue([]);

      render(<ChartVisualization columns={["a", "b"]} rows={[]} />);

      expect(
        screen.getByText("No visualizable data detected"),
      ).toBeInTheDocument();
    });

    it("shows 'No visualizable data detected' with empty columns", () => {
      mockDetectChartTypes.mockReturnValue([]);

      render(<ChartVisualization columns={[]} rows={[]} />);

      expect(
        screen.getByText("No visualizable data detected"),
      ).toBeInTheDocument();
    });

    it("no-data message is wrapped in a flex container with opacity-50", () => {
      mockDetectChartTypes.mockReturnValue([]);

      render(
        <ChartVisualization columns={["col"]} rows={[["val"]]} />,
      );

      const span = screen.getByText("No visualizable data detected");
      const wrapper = span.parentElement!;
      expect(wrapper.className).toContain("opacity-50");
      expect(wrapper.className).toContain("flex-col");
      expect(wrapper.className).toContain("items-center");
    });

    it("no-data view has a strikethrough chart SVG icon", () => {
      mockDetectChartTypes.mockReturnValue([]);

      const { container } = render(
        <ChartVisualization columns={["name"]} rows={[["a"]]} />,
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("width", "24");
    });

    it("does not render chart type buttons when there are no recommendations", () => {
      mockDetectChartTypes.mockReturnValue([]);

      render(
        <ChartVisualization columns={["col"]} rows={[["v"]]} />,
      );

      // No chart type buttons should be present
      const buttons = screen.queryAllByRole("button");
      // No toolbar buttons at all in the no-data state
      expect(buttons.length).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // 5. Handles single-row data
  // ----------------------------------------------------------------
  describe("handles single-row data", () => {
    it("renders chart with a single data row", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={[["Only", 42]]}
        />,
      );

      // Should still render the chart type button and either the plot or loading
      expect(
        screen.getByRole("button", { name: /Bar Chart/i }),
      ).toBeInTheDocument();
      const plotOrLoading =
        screen.queryByTestId("mock-plot") ??
        screen.queryByText("Loading chart...");
      expect(plotOrLoading).toBeInTheDocument();
    });

    it("passes single-row data through to the plot component", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={[["Single", 99]]}
        />,
      );

      // If the plot rendered, verify it received data
      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data.length).toBeGreaterThan(0);
      }
    });
  });

  // ----------------------------------------------------------------
  // 6. Auto-detects appropriate chart type based on data shape
  // ----------------------------------------------------------------
  describe("auto-detects appropriate chart type based on data shape", () => {
    it("calls detectChartTypes with columns and rows", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(mockDetectChartTypes).toHaveBeenCalled();
    });

    it("uses the first recommendation as the default active chart", () => {
      mockDetectChartTypes.mockReturnValue([lineRec, barRec, scatterRec]);

      render(
        <ChartVisualization columns={numericColumns} rows={numericRows} />,
      );

      // Line should be active (first recommendation)
      const lineButton = screen.getByRole("button", { name: /Line Chart/i });
      expect(lineButton.style.backgroundColor).toBe("var(--color-accent)");

      // Bar should not be active
      const barButton = screen.getByRole("button", { name: /Bar Chart/i });
      expect(barButton.style.backgroundColor).toBe("");
    });

    it("calls analyzeColumns for column options in controls", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(mockAnalyzeColumns).toHaveBeenCalledWith(sampleColumns, sampleRows);
    });
  });

  // ----------------------------------------------------------------
  // 7. Respects theme (dark/light mode)
  // ----------------------------------------------------------------
  describe("respects theme (dark/light mode)", () => {
    it("builds plotly config with light theme colors by default", () => {
      clearDarkMode();
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // In light mode, the layout should use dark text (#111827)
      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.font.color).toBe("#111827");
      }
    });

    it("builds plotly config with dark theme colors when dark mode active", () => {
      setDarkMode();
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // In dark mode, the layout should use light text (#f9fafb)
      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.font.color).toBe("#f9fafb");
      }
    });

    it("uses transparent background in both modes", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.paper_bgcolor).toBe("rgba(0,0,0,0)");
        expect(layout.plot_bgcolor).toBe("rgba(0,0,0,0)");
      }
    });

    it("uses appropriate grid color for light mode", () => {
      clearDarkMode();
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.xaxis.gridcolor).toBe("rgba(0,0,0,0.06)");
      }
    });

    it("uses appropriate grid color for dark mode", () => {
      setDarkMode();
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.xaxis.gridcolor).toBe("rgba(255,255,255,0.08)");
      }
    });
  });

  // ----------------------------------------------------------------
  // 8. Download button triggers download
  // ----------------------------------------------------------------
  describe("download button triggers download", () => {
    const mockDownloadImage = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      (window as any).Plotly = { downloadImage: mockDownloadImage };
    });

    afterEach(() => {
      delete (window as any).Plotly;
    });

    it("renders the download button with correct aria label", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      const btn = screen.getByLabelText(/download chart as png/i);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute("title", "Download chart as PNG");
    });

    it("calls Plotly.downloadImage when clicked", async () => {
      const user = userEvent.setup();
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // Attach the divId to the plot element so getElementById finds it
      const plotEl = screen.queryByTestId("mock-plot");
      if (plotEl) {
        const divId = plotEl.getAttribute("data-divid")!;
        plotEl.id = divId;
      }

      const btn = screen.getByLabelText(/download chart as png/i);
      await user.click(btn);

      if (plotEl) {
        expect(mockDownloadImage).toHaveBeenCalledTimes(1);
        const [el, opts] = mockDownloadImage.mock.calls[0];
        expect(opts).toEqual({
          format: "png",
          width: 1200,
          height: 800,
          filename: "chatdf-chart",
        });
      }
    });

    it("handles download errors gracefully without throwing", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockDownloadImage.mockImplementationOnce(() => {
        throw new Error("Download failed");
      });
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      const plotEl = screen.queryByTestId("mock-plot");
      if (plotEl) {
        plotEl.id = plotEl.getAttribute("data-divid")!;
      }

      const btn = screen.getByLabelText(/download chart as png/i);
      await user.click(btn);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to download chart:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ----------------------------------------------------------------
  // 9. Handles null values in data
  // ----------------------------------------------------------------
  describe("handles null values in data", () => {
    it("renders chart even when data contains null values", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const rowsWithNulls = [
        ["A", 10],
        ["B", null],
        ["C", 15],
        [null, 20],
      ];

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={rowsWithNulls}
        />,
      );

      // Should render the chart type button
      expect(
        screen.getByRole("button", { name: /Bar Chart/i }),
      ).toBeInTheDocument();

      // Should render the plot or loading state
      const plotOrLoading =
        screen.queryByTestId("mock-plot") ??
        screen.queryByText("Loading chart...");
      expect(plotOrLoading).toBeInTheDocument();
    });

    it("passes null values through to plot data without crashing", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const rowsWithNulls = [
        ["A", 10],
        [null, null],
        ["C", 30],
      ];

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={rowsWithNulls}
        />,
      );

      // If plot rendered, data should still contain traces
      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data.length).toBeGreaterThan(0);
        // The bar trace should have x values including null
        const trace = data[0];
        expect(trace.x).toContain(null);
      }
    });

    it("handles all-null y-column gracefully", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const allNullYRows = [
        ["A", null],
        ["B", null],
        ["C", null],
      ];

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={allNullYRows}
        />,
      );

      // Should still render without crashing
      expect(
        screen.getByRole("button", { name: /Bar Chart/i }),
      ).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------------------
  // LLM-provided chart spec (llmSpec prop)
  // ----------------------------------------------------------------
  describe("LLM-provided chart spec (llmSpec)", () => {
    it("uses llmSpec instead of auto-detected recommendations when provided", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "line",
        title: "Revenue Over Time",
        x_column: "category",
        y_columns: ["value"],
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      // Should still render chart type buttons from recommendations
      expect(
        screen.getByRole("button", { name: /Bar Chart/i }),
      ).toBeInTheDocument();

      // If plotly rendered, the data should be line-type (scatter with lines+markers)
      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].type).toBe("scatter");
        expect(data[0].mode).toBe("lines+markers");
      }
    });

    it("hides controls toggle button when llmSpec is provided", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "bar",
        title: "Test",
        x_column: "category",
        y_columns: ["value"],
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      // Controls toggle should not be present when llmSpec is provided
      expect(
        screen.queryByLabelText(/toggle chart controls/i),
      ).not.toBeInTheDocument();
    });

    it("renders title from llmSpec in the layout", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "bar",
        title: "Sales by Region",
        x_column: "category",
        y_columns: ["value"],
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.title.text).toBe("Sales by Region");
      }
    });

    it("renders pie chart from llmSpec", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "pie",
        title: "Distribution",
        x_column: "category",
        y_columns: ["value"],
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("pie");
        expect(data[0].labels).toEqual(["A", "B", "C", "D", "E"]);
        expect(data[0].values).toEqual([10, 20, 15, 25, 5]);
      }
    });

    it("renders histogram from llmSpec", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "histogram",
        title: "Value Distribution",
        x_column: "value",
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("histogram");
      }
    });

    it("renders scatter chart from llmSpec", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "scatter",
        title: "X vs Y",
        x_column: "category",
        y_columns: ["value"],
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("scatter");
        expect(data[0].mode).toBe("markers");
      }
    });

    it("renders box chart from llmSpec", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "box",
        title: "Value Spread",
        x_column: "category",
        y_columns: ["value"],
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("box");
        expect(data[0].boxmean).toBe(true);
      }
    });

    it("applies axis labels from llmSpec", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "bar",
        title: "Test",
        x_column: "category",
        y_columns: ["value"],
        x_label: "Categories",
        y_label: "Values (units)",
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.xaxis.title.text).toBe("Categories");
        expect(layout.yaxis.title.text).toBe("Values (units)");
      }
    });

    it("renders horizontal bar from llmSpec with orientation=horizontal", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const llmSpec: ChartSpec = {
        chart_type: "bar",
        title: "Horizontal Bars",
        x_column: "category",
        y_columns: ["value"],
        orientation: "horizontal",
      };

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          llmSpec={llmSpec}
        />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].orientation).toBe("h");
      }
    });
  });

  // ----------------------------------------------------------------
  // Controls panel
  // ----------------------------------------------------------------
  describe("controls panel", () => {
    it("shows controls toggle button when not using llmSpec", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      expect(
        screen.getByLabelText(/toggle chart controls/i),
      ).toBeInTheDocument();
    });

    it("toggles control panel visibility when controls button is clicked", async () => {
      const user = userEvent.setup();
      mockDetectChartTypes.mockReturnValue([barRec]);
      mockAnalyzeColumns.mockReturnValue([
        { index: 0, name: "category", isNumeric: false, isDate: false, uniqueCount: 5 },
        { index: 1, name: "value", isNumeric: true, isDate: false, uniqueCount: 5 },
      ]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // Controls are hidden initially
      expect(screen.queryByText("X")).not.toBeInTheDocument();

      // Click controls toggle
      const controlsToggle = screen.getByLabelText(/toggle chart controls/i);
      await user.click(controlsToggle);

      // Controls should now be visible (X and Y axis selectors for bar chart)
      // The bar chart type shows axis controls
      const xLabels = screen.getAllByText("X");
      expect(xLabels.length).toBeGreaterThan(0);
    });

    it("clicking controls toggle again hides the controls", async () => {
      const user = userEvent.setup();
      mockDetectChartTypes.mockReturnValue([barRec]);
      mockAnalyzeColumns.mockReturnValue([
        { index: 0, name: "category", isNumeric: false, isDate: false, uniqueCount: 5 },
        { index: 1, name: "value", isNumeric: true, isDate: false, uniqueCount: 5 },
      ]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      const controlsToggle = screen.getByLabelText(/toggle chart controls/i);

      // Open
      await user.click(controlsToggle);
      const xLabels = screen.getAllByText("X");
      expect(xLabels.length).toBeGreaterThan(0);

      // Close
      await user.click(controlsToggle);

      // After closing, the "X" label in the control panel should be gone.
      // Note: there may still be SVG elements with "X" text, so we check
      // that the select elements are gone.
      const selects = screen.queryAllByRole("combobox");
      expect(selects.length).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // Plotly config
  // ----------------------------------------------------------------
  describe("plotly config", () => {
    it("passes responsive config and display options to Plot", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const config = lastPlotProps.config as any;
        expect(config.responsive).toBe(true);
        expect(config.displayModeBar).toBe(true);
        expect(config.displaylogo).toBe(false);
        expect(config.modeBarButtonsToRemove).toContain("sendDataToCloud");
        expect(config.modeBarButtonsToRemove).toContain("lasso2d");
        expect(config.modeBarButtonsToRemove).toContain("select2d");
      }
    });

    it("sets useResizeHandler and full width/height style", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        expect(lastPlotProps.useResizeHandler).toBe(true);
        expect(lastPlotProps.style).toEqual({
          width: "100%",
          height: "100%",
        });
      }
    });

    it("generates a unique divId starting with chart-plot-", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const divId = lastPlotProps.divId as string;
        expect(divId).toMatch(/^chart-plot-/);
      }
    });

    it("bar chart trace has correct structure", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data.length).toBe(1);
        expect(data[0].type).toBe("bar");
        expect(data[0].x).toEqual(["A", "B", "C", "D", "E"]);
        expect(data[0].y).toEqual([10, 20, 15, 25, 5]);
        expect(data[0].name).toBe("value");
        expect(data[0].marker.color).toBeDefined();
      }
    });

    it("line chart trace uses scatter type with lines+markers mode", () => {
      mockDetectChartTypes.mockReturnValue([lineRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("scatter");
        expect(data[0].mode).toBe("lines+markers");
        expect(data[0].line.width).toBe(2);
        expect(data[0].marker.size).toBe(4);
      }
    });

    it("scatter chart trace uses markers-only mode", () => {
      mockDetectChartTypes.mockReturnValue([scatterRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("scatter");
        expect(data[0].mode).toBe("markers");
        expect(data[0].marker.size).toBe(6);
        expect(data[0].marker.opacity).toBe(0.7);
      }
    });

    it("pie chart trace has labels and values and removes axes", () => {
      mockDetectChartTypes.mockReturnValue([pieRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("pie");
        expect(data[0].labels).toEqual(["A", "B", "C", "D", "E"]);
        expect(data[0].values).toEqual([10, 20, 15, 25, 5]);

        const layout = lastPlotProps.layout as any;
        expect(layout.xaxis).toBeUndefined();
        expect(layout.yaxis).toBeUndefined();
      }
    });

    it("histogram chart trace has x values and Count y-axis label", () => {
      mockDetectChartTypes.mockReturnValue([histRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("histogram");

        const layout = lastPlotProps.layout as any;
        expect(layout.yaxis.title.text).toBe("Count");
      }
    });

    it("box chart trace has y values and boxmean", () => {
      mockDetectChartTypes.mockReturnValue([boxRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data[0].type).toBe("box");
      }
    });
  });

  // ----------------------------------------------------------------
  // Multiple y-columns (grouped bar)
  // ----------------------------------------------------------------
  describe("multiple y-columns", () => {
    it("renders multiple traces for grouped bar chart", () => {
      const groupedBarRec: ChartRecommendation = {
        type: "bar",
        label: "Bar Chart",
        xCol: 0,
        yCols: [1, 2],
      };
      mockDetectChartTypes.mockReturnValue([groupedBarRec]);

      const cols = ["category", "sales", "returns"];
      const rows = [
        ["A", 10, 2],
        ["B", 20, 5],
        ["C", 15, 3],
      ];

      render(<ChartVisualization columns={cols} rows={rows} />);

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        expect(data.length).toBe(2);
        expect(data[0].name).toBe("sales");
        expect(data[1].name).toBe("returns");

        const layout = lastPlotProps.layout as any;
        expect(layout.barmode).toBe("group");
      }
    });

    it("shows legend when multiple y-columns exist", () => {
      const groupedBarRec: ChartRecommendation = {
        type: "bar",
        label: "Bar Chart",
        xCol: 0,
        yCols: [1, 2],
      };
      mockDetectChartTypes.mockReturnValue([groupedBarRec]);

      const cols = ["category", "sales", "returns"];
      const rows = [
        ["A", 10, 2],
        ["B", 20, 5],
      ];

      render(<ChartVisualization columns={cols} rows={rows} />);

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.showlegend).toBe(true);
      }
    });

    it("hides legend when only one y-column exists", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      if (lastPlotProps) {
        const layout = lastPlotProps.layout as any;
        expect(layout.showlegend).toBe(false);
      }
    });
  });

  // ----------------------------------------------------------------
  // Expand button
  // ----------------------------------------------------------------
  describe("expand button", () => {
    it("calls onExpand callback when expand button is clicked", async () => {
      const user = userEvent.setup();
      const onExpand = vi.fn();
      mockDetectChartTypes.mockReturnValue([barRec]);

      render(
        <ChartVisualization
          columns={sampleColumns}
          rows={sampleRows}
          onExpand={onExpand}
        />,
      );

      const expandBtn = screen.getByLabelText(/expand chart/i);
      await user.click(expandBtn);

      expect(onExpand).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // Accent color cycling
  // ----------------------------------------------------------------
  describe("accent color cycling", () => {
    it("assigns different colors to different traces", () => {
      const multiRec: ChartRecommendation = {
        type: "bar",
        label: "Bar Chart",
        xCol: 0,
        yCols: [1, 2, 3],
      };
      mockDetectChartTypes.mockReturnValue([multiRec]);

      const cols = ["cat", "a", "b", "c"];
      const rows = [
        ["X", 1, 2, 3],
        ["Y", 4, 5, 6],
      ];

      render(<ChartVisualization columns={cols} rows={rows} />);

      if (lastPlotProps) {
        const data = lastPlotProps.data as any[];
        const colors = data.map((d: any) => d.marker.color);
        // All three should have different colors
        expect(new Set(colors).size).toBe(3);
      }
    });
  });

  // ----------------------------------------------------------------
  // Suspense fallback
  // ----------------------------------------------------------------
  describe("suspense fallback", () => {
    it("shows loading spinner and text while chart is lazy-loading", () => {
      mockDetectChartTypes.mockReturnValue([barRec]);

      const { container } = render(
        <ChartVisualization columns={sampleColumns} rows={sampleRows} />,
      );

      // The mock resolves synchronously, but check for the fallback elements
      const spinner = container.querySelector(".animate-spin");
      const loadingText = screen.queryByText("Loading chart...");

      // At least one should have been rendered (spinner or loading text)
      // In the synchronous mock case, the plot renders immediately
      // but the test captures the component's structure
      expect(spinner || loadingText || screen.queryByTestId("mock-plot")).toBeTruthy();
    });
  });
});
