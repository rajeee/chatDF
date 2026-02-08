import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SQLModal } from "@/components/chat-area/SQLPanel";
import { useUiStore } from "@/stores/uiStore";

// Mock the CodeMirror hook
vi.mock("@/hooks/useCodeMirror", () => ({
  useCodeMirror: () => {},
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
        },
      ],
    });

    render(<SQLModal />);
    expect(screen.getByText("Show Error")).toBeInTheDocument();
  });
});
