// Tests for ChartModal component.
//
// CM-RENDER-1: Renders chart modal with title
// CM-CLOSE-1: Close button calls closeChartModal
// CM-ESCAPE-1: Escape key closes modal
// CM-BACKDROP-1: Backdrop click closes modal
// CM-CHART-1: Renders chart visualization with correct data
// CM-DRAG-1: Drag handle exists and is visible
// CM-RESIZE-1: Resize handle exists
// CM-NULL-1: Renders nothing when no execution is set

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useUiStore } from "@/stores/uiStore";
import type { SqlExecution } from "@/stores/chatStore";
import type { ChartRecommendation } from "@/utils/chartDetection";

// Mock react-plotly.js (lazy-loaded by ChartVisualization)
vi.mock("react-plotly.js", () => ({
  default: (props: any) => <div data-testid="mock-plot" />,
}));

// Mock chartDetection — control chart recommendations per test
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

// Mock useDraggable to expose testable refs
const mockOnMouseDown = vi.fn();
const mockJustDragged = { current: false };
vi.mock("@/hooks/useDraggable", () => ({
  useDraggable: () => ({
    pos: null,
    setPos: vi.fn(),
    onMouseDown: mockOnMouseDown,
    justDragged: mockJustDragged,
  }),
}));

// Mock useResizable
const mockOnResizeMouseDown = vi.fn();
const mockJustResized = { current: false };
vi.mock("@/hooks/useResizable", () => ({
  useResizable: () => ({
    size: null,
    onResizeMouseDown: mockOnResizeMouseDown,
    justResized: mockJustResized,
  }),
}));

// Import component AFTER mocks
import { ChartModal } from "@/components/chat-area/ChartModal";

const barRec: ChartRecommendation = {
  type: "bar",
  label: "Bar",
  xCol: 0,
  yCols: [1],
};

function createExecution(overrides?: Partial<SqlExecution>): SqlExecution {
  return {
    query: "SELECT city, population FROM cities",
    columns: ["city", "population"],
    rows: [
      ["New York", 8336817],
      ["Los Angeles", 3979576],
      ["Chicago", 2693976],
    ],
    total_rows: 3,
    error: null,
    execution_time_ms: 42,
    ...overrides,
  };
}

function openChartModal(execution?: SqlExecution) {
  const exec = execution ?? createExecution();
  useUiStore.setState({ chartModalExecution: exec });
}

function closeChartModal() {
  useUiStore.setState({ chartModalExecution: null });
}

beforeEach(() => {
  closeChartModal();
  mockDetectChartTypes.mockReturnValue([barRec]);
  mockJustDragged.current = false;
  mockJustResized.current = false;
  vi.clearAllMocks();
});

describe("CM-NULL: Renders nothing when no execution", () => {
  it("returns null when chartModalExecution is null", () => {
    closeChartModal();

    const { container } = render(<ChartModal />);

    expect(container.innerHTML).toBe("");
  });

  it("returns null when execution has no visualizable data", () => {
    mockDetectChartTypes.mockReturnValue([]);
    openChartModal();

    const { container } = render(<ChartModal />);

    expect(container.innerHTML).toBe("");
  });

  it("returns null when execution has empty columns", () => {
    mockDetectChartTypes.mockReturnValue([]);
    openChartModal(createExecution({ columns: [], rows: [] }));

    const { container } = render(<ChartModal />);

    expect(container.innerHTML).toBe("");
  });
});

describe("CM-RENDER: Renders chart modal with title", () => {
  it("renders the modal dialog when execution is set", () => {
    openChartModal();

    render(<ChartModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("chart-modal")).toBeInTheDocument();
  });

  it("displays 'Chart Visualization' heading", () => {
    openChartModal();

    render(<ChartModal />);

    expect(screen.getByText("Chart Visualization")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chart Visualization" })).toBeInTheDocument();
  });

  it("has correct accessibility attributes", () => {
    openChartModal();

    render(<ChartModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "chart-modal-title");
  });

  it("heading has the correct id for aria-labelledby", () => {
    openChartModal();

    render(<ChartModal />);

    const heading = document.getElementById("chart-modal-title");
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe("Chart Visualization");
  });
});

describe("CM-CLOSE: Close button calls closeChartModal", () => {
  it("renders a close button with aria-label 'Close chart'", () => {
    openChartModal();

    render(<ChartModal />);

    const closeBtn = screen.getByLabelText("Close chart");
    expect(closeBtn).toBeInTheDocument();
  });

  it("clicking close button sets chartModalExecution to null in store", () => {
    openChartModal();

    render(<ChartModal />);

    const closeBtn = screen.getByLabelText("Close chart");
    act(() => {
      closeBtn.click();
    });

    expect(useUiStore.getState().chartModalExecution).toBeNull();
  });

  it("close button displays the X character", () => {
    openChartModal();

    render(<ChartModal />);

    const closeBtn = screen.getByLabelText("Close chart");
    // The button shows &#x2715; which renders as the multiplication sign / X mark
    expect(closeBtn.textContent).toBe("\u2715");
  });
});

describe("CM-ESCAPE: Escape key closes modal", () => {
  it("closes the modal when Escape key is pressed", () => {
    openChartModal();

    render(<ChartModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(useUiStore.getState().chartModalExecution).toBeNull();
  });

  it("does NOT close the modal for non-Escape keys", () => {
    openChartModal();

    render(<ChartModal />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    // Modal should still be open
    expect(useUiStore.getState().chartModalExecution).not.toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not register Escape listener when modal is closed", () => {
    closeChartModal();

    render(<ChartModal />);

    // Pressing Escape should have no effect when modal is not open
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    // State should remain null (unchanged)
    expect(useUiStore.getState().chartModalExecution).toBeNull();
  });
});

describe("CM-BACKDROP: Backdrop click closes modal", () => {
  it("closes the modal when the backdrop is clicked", () => {
    openChartModal();

    render(<ChartModal />);

    const backdrop = screen.getByTestId("chart-modal-backdrop");
    act(() => {
      // Click the backdrop itself (event.target === event.currentTarget)
      backdrop.click();
    });

    expect(useUiStore.getState().chartModalExecution).toBeNull();
  });

  it("does NOT close the modal when clicking inside the modal content", () => {
    openChartModal();

    render(<ChartModal />);

    // Click on the heading inside the modal content
    const heading = screen.getByText("Chart Visualization");
    act(() => {
      heading.click();
    });

    // Modal should still be open because the inner content's onClick stops propagation
    expect(useUiStore.getState().chartModalExecution).not.toBeNull();
  });

  it("does NOT close modal on backdrop click if just dragged", () => {
    openChartModal();
    mockJustDragged.current = true;

    render(<ChartModal />);

    const backdrop = screen.getByTestId("chart-modal-backdrop");
    act(() => {
      backdrop.click();
    });

    // Should remain open because justDragged is true
    expect(useUiStore.getState().chartModalExecution).not.toBeNull();
  });

  it("does NOT close modal on backdrop click if just resized", () => {
    openChartModal();
    mockJustResized.current = true;

    render(<ChartModal />);

    const backdrop = screen.getByTestId("chart-modal-backdrop");
    act(() => {
      backdrop.click();
    });

    // Should remain open because justResized is true
    expect(useUiStore.getState().chartModalExecution).not.toBeNull();
  });
});

describe("CM-CHART: Renders chart visualization with correct data", () => {
  it("passes columns and rows to ChartVisualization", () => {
    openChartModal();

    render(<ChartModal />);

    // The ChartVisualization component should be rendered (it shows the Bar button
    // based on our mocked chart recommendations)
    expect(screen.getByRole("button", { name: /Bar/i })).toBeInTheDocument();
  });

  it("renders chart content area", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    // The chart content wrapper should exist with min-h-0 class
    const contentArea = container.querySelector(".flex-1.min-h-0");
    expect(contentArea).toBeInTheDocument();
  });
});

describe("CM-DRAG: Drag handle exists and is visible", () => {
  it("renders a drag header with cursor-move class", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    const dragHeader = container.querySelector(".cursor-move");
    expect(dragHeader).toBeInTheDocument();
  });

  it("drag header has select-none to prevent text selection during drag", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    const dragHeader = container.querySelector(".cursor-move");
    expect(dragHeader).toBeInTheDocument();
    expect(dragHeader!.className).toContain("select-none");
  });

  it("drag header contains the title and close button", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    const dragHeader = container.querySelector(".cursor-move");
    expect(dragHeader).toBeInTheDocument();

    // Should contain the heading
    const heading = dragHeader!.querySelector("h2");
    expect(heading).toBeInTheDocument();
    expect(heading!.textContent).toBe("Chart Visualization");

    // Should contain the close button
    const closeBtn = dragHeader!.querySelector('button[aria-label="Close chart"]');
    expect(closeBtn).toBeInTheDocument();
  });
});

describe("CM-RESIZE: Resize handle exists", () => {
  it("renders a resize handle with se-resize cursor", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    const resizeHandle = container.querySelector(".cursor-se-resize");
    expect(resizeHandle).toBeInTheDocument();
  });

  it("resize handle contains SVG with dot pattern", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    const resizeHandle = container.querySelector(".cursor-se-resize");
    expect(resizeHandle).toBeInTheDocument();

    const svg = resizeHandle!.querySelector("svg");
    expect(svg).toBeInTheDocument();

    // Should have multiple circle elements for the dot pattern
    const circles = svg!.querySelectorAll("circle");
    expect(circles.length).toBe(6);
  });

  it("resize handle is positioned at bottom-right", () => {
    openChartModal();

    const { container } = render(<ChartModal />);

    const resizeHandle = container.querySelector(".cursor-se-resize");
    expect(resizeHandle).toBeInTheDocument();
    expect(resizeHandle!.className).toContain("absolute");
    expect(resizeHandle!.className).toContain("bottom-0");
    expect(resizeHandle!.className).toContain("right-0");
  });
});
