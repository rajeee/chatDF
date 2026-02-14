// Comprehensive tests for RunSqlPanel component.
//
// 1. Rendering: Panel renders with toggle, editor, and run button
// 2. SQL Execution: Entering SQL and clicking Run triggers API call
// 3. Results Display: After execution, results appear in a table
// 4. Error Handling: SQL errors are displayed to the user
// 5. Export: CSV/XLSX export buttons exist when results are present
// 6. Clear/Reset: Executing a new query resets prior results and errors

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunSqlPanel } from "@/components/right-panel/RunSqlPanel";
import { useUiStore } from "@/stores/uiStore";
import { apiPost } from "@/api/client";

// Mock API client
vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  explainSql: vi.fn(),
  generateSql: vi.fn(),
}));

// Mock queryHistoryStore
const mockAddQuery = vi.fn();
vi.mock("@/stores/queryHistoryStore", () => ({
  useQueryHistoryStore: vi.fn((selector) => {
    const state = { queries: [], addQuery: mockAddQuery, clearHistory: vi.fn() };
    return selector(state);
  }),
}));

// Mock savedQueryStore
vi.mock("@/stores/savedQueryStore", () => ({
  useSavedQueryStore: Object.assign(
    vi.fn((selector) => {
      const state = {
        queries: [],
        saveQuery: vi.fn(),
        deleteQuery: vi.fn(),
        fetchQueries: vi.fn(),
      };
      return selector(state);
    }),
    {
      getState: () => ({
        saveQuery: vi.fn().mockResolvedValue({ id: "saved-1" }),
        togglePin: vi.fn().mockResolvedValue(undefined),
        getFolders: () => [],
      }),
    }
  ),
}));

// Mock autocomplete hook
vi.mock("@/hooks/useSqlAutocomplete", () => ({
  useSqlAutocomplete: () => ({
    suggestions: [],
    isOpen: false,
    selectedIndex: 0,
    handleInput: vi.fn(),
    accept: vi.fn(),
    close: vi.fn(),
    moveSelection: vi.fn(),
  }),
  parseSchema: () => [],
}));

// Mock toast store
vi.mock("@/stores/toastStore", () => ({
  useToastStore: Object.assign(vi.fn(), {
    getState: () => ({ error: vi.fn(), success: vi.fn() }),
  }),
}));

// Mock chart detection to return empty array by default (no chart button shown)
vi.mock("@/utils/chartDetection", () => ({
  detectChartTypes: vi.fn(() => []),
}));

// Mock ChartVisualization lazy import
vi.mock("@/components/chat-area/ChartVisualization", () => ({
  ChartVisualization: () => <div data-testid="chart-viz">Chart</div>,
}));

// Helper: expand the panel by clicking the toggle button
function expandPanel() {
  const toggle = screen.getByTestId("run-sql-toggle");
  fireEvent.click(toggle);
}

// Helper: set SQL via pendingSql (the hidden input reflects internal sql state)
function setSqlViaPending(sql: string) {
  act(() => {
    useUiStore.getState().setPendingSql(sql);
  });
}

// Sample query result for reuse across tests
const sampleResult = {
  columns: ["id", "name", "value"],
  rows: [
    [1, "Alice", 100],
    [2, "Bob", 200],
    [3, "Charlie", 300],
  ],
  total_rows: 3,
  execution_time_ms: 42,
  page: 1,
  page_size: 100,
  total_pages: 1,
};

describe("RunSqlPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ pendingSql: null });
  });

  // ─── 1. Rendering ───

  describe("Rendering", () => {
    it("renders the panel container with toggle button", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expect(screen.getByTestId("run-sql-panel")).toBeInTheDocument();
      expect(screen.getByTestId("run-sql-toggle")).toBeInTheDocument();
      expect(screen.getByText("Run SQL")).toBeInTheDocument();
    });

    it("is collapsed by default — editor and run button are not visible", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expect(screen.queryByTestId("run-sql-editor")).not.toBeInTheDocument();
      expect(screen.queryByTestId("run-sql-execute")).not.toBeInTheDocument();
    });

    it("expands when toggle is clicked, showing editor and run button", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      expect(screen.getByTestId("run-sql-editor")).toBeInTheDocument();
      expect(screen.getByTestId("run-sql-execute")).toBeInTheDocument();
      expect(screen.getByText("Run")).toBeInTheDocument();
    });

    it("shows Explain and Format buttons when expanded", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      expect(screen.getByTestId("run-sql-explain")).toBeInTheDocument();
      expect(screen.getByTestId("run-sql-format")).toBeInTheDocument();
      expect(screen.getByText("Explain")).toBeInTheDocument();
      expect(screen.getByText("Format")).toBeInTheDocument();
    });

    it("shows natural language to SQL input when expanded", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      expect(screen.getByTestId("nl-to-sql-input")).toBeInTheDocument();
      expect(screen.getByTestId("nl-to-sql-generate")).toBeInTheDocument();
    });

    it("collapses when toggle is clicked again", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      expect(screen.getByTestId("run-sql-editor")).toBeInTheDocument();

      // Click toggle again to collapse
      fireEvent.click(screen.getByTestId("run-sql-toggle"));
      expect(screen.queryByTestId("run-sql-editor")).not.toBeInTheDocument();
    });

    it("shows the hidden textarea with data-testid for test access", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      const hiddenInput = screen.getByTestId("run-sql-textarea");
      expect(hiddenInput).toBeInTheDocument();
      expect(hiddenInput).toHaveAttribute("type", "hidden");
    });
  });

  // ─── 2. SQL Execution ───

  describe("SQL Execution", () => {
    it("Run button is disabled when SQL is empty", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      const runBtn = screen.getByTestId("run-sql-execute");
      expect(runBtn).toBeDisabled();
    });

    it("Run button is enabled when SQL is present", async () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        const runBtn = screen.getByTestId("run-sql-execute");
        expect(runBtn).not.toBeDisabled();
      });
    });

    it("clicking Run calls apiPost with correct endpoint and payload", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT * FROM users");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith(
          "/conversations/conv-1/query",
          { sql: "SELECT * FROM users", page: 1, page_size: 100 },
          60_000
        );
      });
    });

    it("adds query to history after successful execution", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT * FROM users");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(mockAddQuery).toHaveBeenCalledWith("SELECT * FROM users");
      });
    });

    it("shows 'Running...' text while executing", async () => {
      const mockApiPost = vi.mocked(apiPost);
      // Never resolve to keep the loading state
      mockApiPost.mockReturnValue(new Promise(() => {}));

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByText("Running...")).toBeInTheDocument();
      });
    });
  });

  // ─── 3. Results Display ───

  describe("Results Display", () => {
    it("shows results table after successful execution", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT * FROM users");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
      });
    });

    it("displays row count and execution time in results header", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByText("3 rows")).toBeInTheDocument();
        expect(screen.getByText("(42ms)")).toBeInTheDocument();
      });
    });

    it("renders column headers from the result", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByText("id")).toBeInTheDocument();
        expect(screen.getByText("name")).toBeInTheDocument();
        expect(screen.getByText("value")).toBeInTheDocument();
      });
    });

    it("renders row data cells", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
        expect(screen.getByText("Charlie")).toBeInTheDocument();
        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText("200")).toBeInTheDocument();
      });
    });

    it("renders null cells with italic 'null' text", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce({
        ...sampleResult,
        rows: [[1, null, 100]],
        total_rows: 1,
      });

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByText("null")).toBeInTheDocument();
      });
    });

    it("renders DataGrid component when results are present", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("data-grid")).toBeInTheDocument();
      });
    });

    it("shows limit-applied banner when limit_applied is true", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce({
        ...sampleResult,
        limit_applied: true,
      });

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("limit-applied-banner")).toBeInTheDocument();
        expect(
          screen.getByText(/Results limited to 10,000 rows/)
        ).toBeInTheDocument();
      });
    });
  });

  // ─── 4. Error Handling ───

  describe("Error Handling", () => {
    it("displays error message when query execution fails", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockRejectedValueOnce(new Error("no such table: nonexistent"));

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT * FROM nonexistent");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-error")).toBeInTheDocument();
        expect(
          screen.getByText("no such table: nonexistent")
        ).toBeInTheDocument();
      });
    });

    it("displays generic error message for non-Error exceptions", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockRejectedValueOnce("something went wrong");

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("INVALID SQL");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-error")).toBeInTheDocument();
        expect(screen.getByText("Query execution failed")).toBeInTheDocument();
      });
    });

    it("clears previous error when a new query succeeds", async () => {
      const mockApiPost = vi.mocked(apiPost);
      // First call fails
      mockApiPost.mockRejectedValueOnce(new Error("syntax error"));

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("BAD SQL");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-error")).toBeInTheDocument();
      });

      // Second call succeeds
      mockApiPost.mockResolvedValueOnce(sampleResult);

      // Set new SQL and execute again
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.queryByTestId("run-sql-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
      });
    });

    it("clears previous results when a new query errors", async () => {
      const mockApiPost = vi.mocked(apiPost);
      // First call succeeds
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
      });

      // Second call fails
      mockApiPost.mockRejectedValueOnce(new Error("oops"));
      setSqlViaPending("BAD SQL");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.queryByTestId("run-sql-results")).not.toBeInTheDocument();
        expect(screen.getByTestId("run-sql-error")).toBeInTheDocument();
      });
    });
  });

  // ─── 5. Export Buttons ───

  describe("Export", () => {
    it("DataGrid has Download CSV and Download Excel buttons when results are present", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /download excel/i })).toBeInTheDocument();
      });
    });

    it("DataGrid has Copy table button when results are present", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /copy table/i })).toBeInTheDocument();
      });
    });

    it("does not show export buttons when no results exist", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      expect(screen.queryByTestId("export-csv")).not.toBeInTheDocument();
      expect(screen.queryByTestId("export-xlsx")).not.toBeInTheDocument();
    });

    it("shows Save Query and Pin Result buttons when results are present", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-save")).toBeInTheDocument();
        expect(screen.getByTestId("run-sql-save")).toHaveTextContent("Save Query");
        expect(screen.getByTestId("run-sql-pin")).toBeInTheDocument();
        expect(screen.getByTestId("run-sql-pin")).toHaveTextContent("Pin Result");
      });
    });

    it("shows Compare button when results are present", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-compare")).toBeInTheDocument();
        expect(screen.getByTestId("run-sql-compare")).toHaveTextContent("Compare");
      });
    });
  });

  // ─── 6. Clear / Reset Behavior ───

  describe("Clear / Reset", () => {
    it("running a new query clears the previous result before new results arrive", async () => {
      const mockApiPost = vi.mocked(apiPost);

      // First query returns results
      mockApiPost.mockResolvedValueOnce(sampleResult);

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
        expect(screen.getByText("Alice")).toBeInTheDocument();
      });

      // Second query — use a never-resolving promise so we can check the cleared state
      mockApiPost.mockReturnValueOnce(new Promise(() => {}));

      // Set new SQL and execute
      setSqlViaPending("SELECT 2");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      // Previous results should be cleared while the new query is in-flight
      await waitFor(() => {
        expect(screen.queryByTestId("run-sql-results")).not.toBeInTheDocument();
        expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      });
    });

    it("Explain and Format buttons are disabled when SQL is empty", () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();

      expect(screen.getByTestId("run-sql-explain")).toBeDisabled();
      expect(screen.getByTestId("run-sql-format")).toBeDisabled();
    });

    it("Explain and Format buttons are enabled when SQL is present", async () => {
      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-explain")).not.toBeDisabled();
        expect(screen.getByTestId("run-sql-format")).not.toBeDisabled();
      });
    });
  });

  // ─── 7. Pagination ───

  describe("Pagination", () => {
    it("shows pagination controls when total_pages > 1", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce({
        ...sampleResult,
        total_pages: 3,
        page: 1,
      });

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("pagination-prev")).toBeInTheDocument();
        expect(screen.getByTestId("pagination-next")).toBeInTheDocument();
        expect(screen.getByTestId("pagination-info")).toHaveTextContent(
          "Page 1 of 3"
        );
      });
    });

    it("Previous button is disabled on first page", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce({
        ...sampleResult,
        total_pages: 3,
        page: 1,
      });

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("pagination-prev")).toBeDisabled();
        expect(screen.getByTestId("pagination-next")).not.toBeDisabled();
      });
    });

    it("does not show pagination when total_pages is 1", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce({
        ...sampleResult,
        total_pages: 1,
      });

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("pagination-prev")).not.toBeInTheDocument();
      expect(screen.queryByTestId("pagination-next")).not.toBeInTheDocument();
    });
  });

  // ─── 8. Column Sorting ───

  describe("Column Sorting", () => {
    it("DataGrid renders column headers that support sorting", async () => {
      const mockApiPost = vi.mocked(apiPost);
      mockApiPost.mockResolvedValueOnce({
        ...sampleResult,
        rows: [
          [2, "Bob", 200],
          [1, "Alice", 100],
          [3, "Charlie", 300],
        ],
      });

      render(<RunSqlPanel conversationId="conv-1" />);

      expandPanel();
      setSqlViaPending("SELECT 1");

      await waitFor(() => {
        expect(screen.getByTestId("run-sql-execute")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("run-sql-execute"));

      await waitFor(() => {
        // DataGrid renders column headers with sort icon wrappers
        const headers = screen.getAllByRole("columnheader");
        expect(headers.length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByTestId("sort-icon-wrapper")).toHaveLength(3);
      });
    });
  });
});
