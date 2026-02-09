import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CorrelationMatrix } from "../CorrelationMatrix";

// Mock the API client
const mockGetCorrelations = vi.fn();
vi.mock("@/api/client", () => ({
  getCorrelations: (...args: unknown[]) => mockGetCorrelations(...args),
}));

describe("CorrelationMatrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when numericColumnCount < 2", () => {
    const { container } = render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={1}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the toggle button when numericColumnCount >= 2", () => {
    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={3}
      />
    );
    expect(screen.getByTestId("correlation-matrix-toggle")).toBeInTheDocument();
    expect(screen.getByText("Show Correlations")).toBeInTheDocument();
  });

  it("fetches and displays the heatmap on button click", async () => {
    mockGetCorrelations.mockResolvedValueOnce({
      columns: ["x", "y"],
      matrix: [
        [1.0, 0.85],
        [0.85, 1.0],
      ],
    });

    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={2}
      />
    );

    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("correlation-heatmap")).toBeInTheDocument();
    });

    // Verify API was called with correct args
    expect(mockGetCorrelations).toHaveBeenCalledWith("conv-1", "ds-1");

    // Verify cell values are displayed
    const cells = screen.getAllByTestId("correlation-cell");
    expect(cells.length).toBe(4); // 2x2 matrix

    // Check that 1.00 appears (diagonal)
    const cellTexts = cells.map((c) => c.textContent);
    expect(cellTexts).toContain("1.00");
    expect(cellTexts).toContain("0.85");
  });

  it("shows loading state while computing", async () => {
    // Create a promise we can control
    let resolvePromise: (value: unknown) => void;
    const controlledPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockGetCorrelations.mockReturnValueOnce(controlledPromise);

    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={3}
      />
    );

    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));

    // Should show loading text
    await waitFor(() => {
      expect(screen.getByText("Computing...")).toBeInTheDocument();
    });

    // Button should be disabled during loading
    expect(screen.getByTestId("correlation-matrix-toggle")).toBeDisabled();

    // Resolve the promise
    resolvePromise!({
      columns: ["a", "b"],
      matrix: [[1.0, 0.5], [0.5, 1.0]],
    });

    await waitFor(() => {
      expect(screen.getByTestId("correlation-heatmap")).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockGetCorrelations.mockRejectedValueOnce(
      new Error("Need at least 2 numeric columns")
    );

    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={2}
      />
    );

    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("correlation-error")).toBeInTheDocument();
      expect(
        screen.getByText("Need at least 2 numeric columns")
      ).toBeInTheDocument();
    });
  });

  it("toggles heatmap visibility without re-fetching", async () => {
    mockGetCorrelations.mockResolvedValueOnce({
      columns: ["x", "y"],
      matrix: [[1.0, 0.5], [0.5, 1.0]],
    });

    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={2}
      />
    );

    // First click: fetch and show
    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("correlation-heatmap")).toBeInTheDocument();
    });
    expect(mockGetCorrelations).toHaveBeenCalledTimes(1);

    // Second click: hide
    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));
    await waitFor(() => {
      expect(screen.queryByTestId("correlation-heatmap")).not.toBeInTheDocument();
    });

    // Third click: show again without re-fetching
    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("correlation-heatmap")).toBeInTheDocument();
    });
    // Should still only have been called once
    expect(mockGetCorrelations).toHaveBeenCalledTimes(1);
  });

  it("displays null values as dashes", async () => {
    mockGetCorrelations.mockResolvedValueOnce({
      columns: ["a", "b"],
      matrix: [[1.0, null], [null, 1.0]],
    });

    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={2}
      />
    );

    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("correlation-heatmap")).toBeInTheDocument();
    });

    const cells = screen.getAllByTestId("correlation-cell");
    const cellTexts = cells.map((c) => c.textContent);
    expect(cellTexts).toContain("-");
    expect(cellTexts).toContain("1.00");
  });

  it("renders the legend with -1, 0, +1 labels", async () => {
    mockGetCorrelations.mockResolvedValueOnce({
      columns: ["x", "y"],
      matrix: [[1.0, 0.5], [0.5, 1.0]],
    });

    render(
      <CorrelationMatrix
        conversationId="conv-1"
        datasetId="ds-1"
        numericColumnCount={2}
      />
    );

    fireEvent.click(screen.getByTestId("correlation-matrix-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("correlation-legend")).toBeInTheDocument();
    });

    const legend = screen.getByTestId("correlation-legend");
    expect(legend).toHaveTextContent("-1");
    expect(legend).toHaveTextContent("0");
    expect(legend).toHaveTextContent("+1");
  });
});
