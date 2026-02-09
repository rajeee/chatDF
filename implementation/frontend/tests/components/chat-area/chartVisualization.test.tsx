import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChartRecommendation } from "@/utils/chartDetection";

// Mock react-plotly.js (lazy-loaded)
vi.mock("react-plotly.js", () => ({
  default: (props: any) => <div data-testid="mock-plot" />,
}));

// Mock chartDetection — we control recommendations per test
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

// Mock tableUtils so extractColumn doesn't blow up
vi.mock("@/utils/tableUtils", () => ({
  cellValueRaw: (row: unknown[], idx: number) => (row as any)[idx] ?? null,
}));

// Import component AFTER mocks
import { ChartVisualization } from "@/components/chat-area/ChartVisualization";

const barRec: ChartRecommendation = {
  type: "bar",
  label: "Bar",
  xCol: 0,
  yCols: [1],
};

const lineRec: ChartRecommendation = {
  type: "line",
  label: "Line",
  xCol: 0,
  yCols: [1],
};

describe("ChartVisualization", () => {
  describe("No visualizable data", () => {
    it("shows 'No visualizable data detected' with SVG icon when no recommendations", () => {
      mockDetectChartTypes.mockReturnValue([]);
      const { container } = render(
        <ChartVisualization columns={["name"]} rows={[["Alice"]]} />,
      );

      expect(screen.getByText("No visualizable data detected")).toBeInTheDocument();
      // Should have the SVG icon
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("width", "24");
      expect(svg).toHaveAttribute("height", "24");
    });

    it("wraps no-data message in an opacity-50 container", () => {
      mockDetectChartTypes.mockReturnValue([]);
      render(
        <ChartVisualization columns={["x"]} rows={[["a"]]} />,
      );
      const span = screen.getByText("No visualizable data detected");
      const wrapper = span.parentElement!;
      expect(wrapper.className).toContain("opacity-50");
      expect(wrapper.className).toContain("flex-col");
    });
  });

  describe("Loading spinner in Suspense fallback", () => {
    it("renders animated spinner and loading text while chart lazy-loads", () => {
      // The lazy-loaded Plot component hasn't resolved yet in the initial
      // render, so the Suspense fallback is visible with the spinner.
      mockDetectChartTypes.mockReturnValue([barRec]);
      const { container } = render(
        <ChartVisualization
          columns={["city", "pop"]}
          rows={[["NYC", 8000000]]}
        />,
      );

      // Loading text should be present
      expect(screen.getByText("Loading chart...")).toBeInTheDocument();

      // Spinner element should exist with animate-spin class
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute("aria-hidden", "true");
      expect(spinner!.className).toContain("border-2");
      expect(spinner!.className).toContain("rounded-full");
      expect(spinner!.className).toContain("border-t-transparent");
    });
  });

  describe("Chart type buttons", () => {
    it("active chart button has accent background style", () => {
      mockDetectChartTypes.mockReturnValue([barRec, lineRec]);
      render(
        <ChartVisualization
          columns={["city", "pop"]}
          rows={[["NYC", 8000000]]}
        />,
      );

      // First recommendation (bar) is active by default
      const barButton = screen.getByRole("button", { name: /Bar/i });
      expect(barButton.style.backgroundColor).toBe("var(--color-accent)");
      expect(barButton.style.color).toBe("rgb(255, 255, 255)");
    });

    it("inactive chart button has hover classes and no inline background", () => {
      mockDetectChartTypes.mockReturnValue([barRec, lineRec]);
      render(
        <ChartVisualization
          columns={["city", "pop"]}
          rows={[["NYC", 8000000]]}
        />,
      );

      // Line button is inactive (bar is the default active)
      const lineButton = screen.getByRole("button", { name: /Line/i });
      expect(lineButton.className).toContain("hover:bg-black/[0.05]");
      expect(lineButton.className).toContain("dark:hover:bg-white/[0.08]");
      // Inactive button should NOT have inline backgroundColor
      expect(lineButton.style.backgroundColor).toBe("");
    });

    it("active chart button does NOT have hover classes", () => {
      mockDetectChartTypes.mockReturnValue([barRec, lineRec]);
      render(
        <ChartVisualization
          columns={["city", "pop"]}
          rows={[["NYC", 8000000]]}
        />,
      );

      const barButton = screen.getByRole("button", { name: /Bar/i });
      expect(barButton.className).not.toContain("hover:bg-black/[0.05]");
      expect(barButton.className).not.toContain("dark:hover:bg-white/[0.08]");
    });
  });
});
