/**
 * Tests for chart download functionality in ChartVisualization component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChartRecommendation } from "@/utils/chartDetection";

// Mock react-plotly.js (must be before component import)
vi.mock("react-plotly.js", () => ({
  default: ({ divId }: { divId: string }) => <div data-testid="plotly-chart" data-divid={divId}>Mocked Plotly Chart</div>,
}));

// Mock chartDetection
const mockDetectChartTypes = vi.fn<() => ChartRecommendation[]>(() => []);
vi.mock("@/utils/chartDetection", () => ({
  detectChartTypes: (...args: unknown[]) => mockDetectChartTypes(),
  analyzeColumns: (columns: string[], rows: unknown[][]) =>
    columns.map((name, index) => ({
      index,
      name,
      isNumeric: typeof rows[0]?.[index] === "number",
      isDate: false,
      uniqueCount: rows.length,
    })),
}));

// Mock tableUtils
vi.mock("@/utils/tableUtils", () => ({
  cellValueRaw: (row: unknown[], idx: number) => (row as any)[idx] ?? null,
}));

// Import component AFTER all mocks
import { ChartVisualization } from "@/components/chat-area/ChartVisualization";

describe("ChartVisualization - Download PNG", () => {
  const sampleColumns = ["category", "value"];
  const sampleRows = [
    ["A", 10],
    ["B", 20],
    ["C", 15],
  ];

  const barRec: ChartRecommendation = {
    type: "bar",
    label: "Bar",
    xCol: 0,
    yCols: [1],
  };

  const mockDownloadImage = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    // Provide at least one chart recommendation so the component renders
    mockDetectChartTypes.mockReturnValue([barRec]);
    // Set up window.Plotly mock (the component uses window.Plotly to download)
    (window as any).Plotly = { downloadImage: mockDownloadImage };
  });

  afterEach(() => {
    delete (window as any).Plotly;
  });

  it("renders download button in the toolbar", () => {
    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
      />
    );

    const downloadButton = screen.getByLabelText(/download chart as png/i);
    expect(downloadButton).toBeInTheDocument();
    expect(downloadButton).toHaveAttribute("title", "Download chart as PNG");
  });

  it("calls Plotly.downloadImage when download button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
      />
    );

    // Create a matching DOM element so getElementById finds it
    const plotEl = screen.getByTestId("plotly-chart");
    const divId = plotEl.getAttribute("data-divid")!;
    plotEl.id = divId;

    const downloadButton = screen.getByLabelText(/download chart as png/i);
    await user.click(downloadButton);

    expect(mockDownloadImage).toHaveBeenCalledTimes(1);

    // Check that downloadImage was called with the element and correct parameters
    const [el, options] = mockDownloadImage.mock.calls[0];
    expect(el).toBe(plotEl);
    expect(options).toEqual({
      format: "png",
      width: 1200,
      height: 800,
      filename: "chatdf-chart",
    });
  });

  it("handles download errors gracefully", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDownloadImage.mockImplementationOnce(() => { throw new Error("Download failed"); });

    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
      />
    );

    // Create a matching DOM element so getElementById finds it
    const plotEl = screen.getByTestId("plotly-chart");
    const divId = plotEl.getAttribute("data-divid")!;
    plotEl.id = divId;

    const downloadButton = screen.getByLabelText(/download chart as png/i);
    await user.click(downloadButton);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to download chart:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it("passes unique divId to Plot component", () => {
    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
      />
    );

    const plotElement = screen.getByTestId("plotly-chart");
    const divId = plotElement.getAttribute("data-divid");

    expect(divId).toBeTruthy();
    expect(divId).toMatch(/^chart-plot-/);
  });

  it("download button is styled consistently with other toolbar buttons", () => {
    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
      />
    );

    const downloadButton = screen.getByLabelText(/download chart as png/i);

    // Check that it has the same classes as other toolbar buttons
    expect(downloadButton).toHaveClass(
      "flex",
      "items-center",
      "gap-1",
      "px-2",
      "py-1",
      "rounded",
      "text-[10px]",
      "font-medium",
      "transition-colors"
    );
  });

  it("renders download button even when llmSpec is provided", () => {
    const llmSpec = {
      chart_type: "bar" as const,
      x_column: "category",
      y_columns: ["value"],
    };

    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
        llmSpec={llmSpec}
      />
    );

    const downloadButton = screen.getByLabelText(/download chart as png/i);
    expect(downloadButton).toBeInTheDocument();
  });

  it("renders download button alongside expand button when onExpand is provided", () => {
    const mockOnExpand = vi.fn();

    render(
      <ChartVisualization
        columns={sampleColumns}
        rows={sampleRows}
        onExpand={mockOnExpand}
      />
    );

    const downloadButton = screen.getByLabelText(/download chart as png/i);
    const expandButton = screen.getByLabelText(/expand chart/i);

    expect(downloadButton).toBeInTheDocument();
    expect(expandButton).toBeInTheDocument();
  });
});
