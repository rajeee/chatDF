import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SQLModal } from "@/components/chat-area/SQLPanel";
import { useUiStore } from "@/stores/uiStore";

// Mock the CodeMirror hook
vi.mock("@/hooks/useCodeMirror", () => ({
  useCodeMirror: () => {},
}));

// Mock react-plotly.js to avoid loading the heavy library in tests
vi.mock("react-plotly.js", () => ({
  default: () => <div data-testid="mock-plotly-chart">Chart</div>,
}));

describe("SQLModal", () => {
  beforeEach(() => {
    useUiStore.setState({
      sqlModalOpen: false,
      activeSqlExecutions: [],
      sqlResultModalIndex: null,
    });
  });

  it("should not render when sqlModalOpen is false", () => {
    render(<SQLModal />);
    expect(screen.queryByTestId("sql-modal")).not.toBeInTheDocument();
  });

  it("should not render when executions array is empty", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [],
    });
    render(<SQLModal />);
    expect(screen.queryByTestId("sql-modal")).not.toBeInTheDocument();
  });

  it("should render when sqlModalOpen is true and executions exist", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT * FROM test",
          columns: ["id", "name"],
          rows: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
          total_rows: 2,
          error: null,
          execution_time_ms: null,
        },
      ],
    });
    render(<SQLModal />);
    expect(screen.getByTestId("sql-modal")).toBeInTheDocument();
    expect(screen.getByText("SQL Queries (1)")).toBeInTheDocument();
  });

  it("should render query blocks with virtualization support", () => {
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      value: Math.random(),
    }));

    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT * FROM large_table",
          columns: ["id", "name", "value"],
          rows: largeDataset,
          total_rows: 1000,
          error: null,
          execution_time_ms: null,
        },
      ],
    });

    render(<SQLModal />);

    // Should show the query card
    expect(screen.getByText("Query 1")).toBeInTheDocument();

    // Should show the "View Output" button with row count
    expect(screen.getByText(/View Output \(1000 rows\)/)).toBeInTheDocument();
  });

  it("should handle errors in query executions", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT * FROM nonexistent",
          columns: null,
          rows: null,
          total_rows: 0,
          error: "Table not found",
          execution_time_ms: null,
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.getByText("Show Error")).toBeInTheDocument();
  });

  it("should display execution time for queries", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT * FROM test",
          columns: ["id"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: 42.5,
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.getByText(/43ms/)).toBeInTheDocument();
  });

  it("should display execution time in seconds for slow queries", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT * FROM test",
          columns: ["id"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: 2345.67,
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.getByText(/2\.35s/)).toBeInTheDocument();
  });

  it("should have role='dialog' and aria-modal='true'", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT 1",
          columns: ["id"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: null,
        },
      ],
    });

    render(<SQLModal />);

    const modal = screen.getByTestId("sql-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(modal).toHaveAttribute("aria-labelledby", "sql-modal-title");

    const title = document.getElementById("sql-modal-title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("SQL Queries (1)");
  });

  it("should apply entrance animation classes to backdrop and modal content", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT 1",
          columns: ["id"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: null,
        },
      ],
    });

    render(<SQLModal />);

    const backdrop = screen.getByTestId("sql-modal-backdrop");
    expect(backdrop).toHaveClass("modal-backdrop-enter");

    // The modal content div (child of backdrop) should have scale-enter animation
    const modalContent = backdrop.querySelector(".modal-scale-enter");
    expect(modalContent).toBeInTheDocument();
  });

  it("should not display execution time when null", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT * FROM test",
          columns: ["id"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: null,
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.getByText("Query 1")).toBeInTheDocument();
    // Should not show execution time (neither ms nor seconds format)
    expect(screen.queryByText(/\(\d+\.?\d*ms\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(\d+\.?\d*s\)/)).not.toBeInTheDocument();
  });

  it("should show Visualize button for data with numeric columns", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT city, population FROM cities",
          columns: ["city", "population"],
          rows: [
            ["NYC", 8000000],
            ["LA", 4000000],
            ["Chicago", 2700000],
          ],
          total_rows: 3,
          error: null,
          execution_time_ms: 10,
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.getByTestId("visualize-btn-0")).toBeInTheDocument();
    expect(screen.getByText("Visualize")).toBeInTheDocument();
  });

  it("should NOT show Visualize button for text-only data", () => {
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: "SELECT name, description FROM items",
          columns: ["name", "description"],
          rows: [
            ["Item A", "Description A"],
            ["Item B", "Description B"],
          ],
          total_rows: 2,
          error: null,
          execution_time_ms: 5,
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.queryByText("Visualize")).not.toBeInTheDocument();
  });
});
