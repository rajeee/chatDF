import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunSqlPanel } from "../RunSqlPanel";

// Capture the onChange callback from useEditableCodeMirror for test access
let mockOnChange: ((value: string, cursor: number) => void) | undefined;

vi.mock("@/hooks/useEditableCodeMirror", () => ({
  useEditableCodeMirror: (options: { onChange?: (value: string, cursor: number) => void }) => {
    mockOnChange = options.onChange;
    return {
      setValue: (doc: string) => { options.onChange?.(doc, doc.length); },
      getValue: () => "",
      getCursorPos: () => 0,
      focus: vi.fn(),
      viewRef: { current: null },
    };
  },
}));

// Mock apiPost
vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  explainSql: vi.fn(),
  generateSql: vi.fn(),
}));

// Mock stores
vi.mock("@/stores/queryHistoryStore", () => ({
  useQueryHistoryStore: vi.fn((selector) => {
    const state = { queries: [], addQuery: vi.fn(), clearHistory: vi.fn() };
    return selector(state);
  }),
}));

vi.mock("@/stores/savedQueryStore", () => ({
  useSavedQueryStore: Object.assign(vi.fn((selector) => {
    const state = { queries: [], saveQuery: vi.fn(), deleteQuery: vi.fn(), fetchQueries: vi.fn() };
    return selector(state);
  }), { getState: () => ({ saveQuery: vi.fn().mockResolvedValue(undefined) }) }),
}));

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
}));

vi.mock("@/stores/toastStore", () => ({
  useToastStore: Object.assign(vi.fn(), {
    getState: () => ({ error: vi.fn(), success: vi.fn() }),
  }),
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector) => {
    const state = { pendingSql: null, setPendingSql: vi.fn() };
    return selector(state);
  }),
}));

vi.mock("@/utils/sqlFormatter", () => ({
  formatSql: vi.fn((s: string) => s),
}));

describe("RunSqlPanel column sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = undefined;
  });

  /** Helper: render the panel, execute a query, wait for results */
  async function renderWithResults(mockData: {
    columns: string[];
    rows: unknown[][];
    total_rows?: number;
    execution_time_ms?: number;
    page?: number;
    page_size?: number;
    total_pages?: number;
  }) {
    const { apiPost } = await import("@/api/client");
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_rows: mockData.rows.length,
      execution_time_ms: 1.0,
      page: 1,
      page_size: 100,
      total_pages: 1,
      ...mockData,
    });

    render(<RunSqlPanel conversationId="test-conv" />);

    // Expand the panel
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Simulate typing in the CodeMirror editor via mock
    act(() => { mockOnChange?.("SELECT * FROM t", 15); });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
    });
  }

  it("has no sort indicator by default", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    // No sort indicator should be visible
    expect(screen.queryByTestId("sort-indicator-asc")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sort-indicator-desc")).not.toBeInTheDocument();

    // Rows should be in original order
    const cells = screen.getAllByRole("cell");
    // First row cells: "2", "banana"
    expect(cells[0]).toHaveTextContent("2");
    expect(cells[1]).toHaveTextContent("banana");
  });

  it("sorts ascending on first column header click", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    // Click the first column header (id)
    fireEvent.click(screen.getByTestId("sort-header-0"));

    // Ascending sort indicator should appear
    expect(screen.getByTestId("sort-indicator-asc")).toBeInTheDocument();

    // Rows should be sorted by id ascending: 1, 2, 3
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("1");
    expect(cells[2]).toHaveTextContent("2");
    expect(cells[4]).toHaveTextContent("3");
  });

  it("sorts descending on second click of same column", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    const header = screen.getByTestId("sort-header-0");

    // First click: ascending
    fireEvent.click(header);
    expect(screen.getByTestId("sort-indicator-asc")).toBeInTheDocument();

    // Second click: descending
    fireEvent.click(header);
    expect(screen.getByTestId("sort-indicator-desc")).toBeInTheDocument();

    // Rows should be sorted by id descending: 3, 2, 1
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("3");
    expect(cells[2]).toHaveTextContent("2");
    expect(cells[4]).toHaveTextContent("1");
  });

  it("clears sort on third click of same column", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    const header = screen.getByTestId("sort-header-0");

    // Click three times: asc -> desc -> clear
    fireEvent.click(header);
    fireEvent.click(header);
    fireEvent.click(header);

    // No sort indicator
    expect(screen.queryByTestId("sort-indicator-asc")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sort-indicator-desc")).not.toBeInTheDocument();

    // Original order restored: 2, 1, 3
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("2");
    expect(cells[2]).toHaveTextContent("1");
    expect(cells[4]).toHaveTextContent("3");
  });

  it("sorts string columns alphabetically", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    // Click the name column (index 1)
    fireEvent.click(screen.getByTestId("sort-header-1"));

    // Rows sorted by name ascending: apple, banana, cherry
    const cells = screen.getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("apple");
    expect(cells[3]).toHaveTextContent("banana");
    expect(cells[5]).toHaveTextContent("cherry");
  });

  it("switches sort to a different column", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    // Sort by id ascending
    fireEvent.click(screen.getByTestId("sort-header-0"));
    expect(screen.getByTestId("sort-indicator-asc")).toBeInTheDocument();

    // Now sort by name
    fireEvent.click(screen.getByTestId("sort-header-1"));

    // Sort indicator should still show ascending (new column starts at asc)
    expect(screen.getByTestId("sort-indicator-asc")).toBeInTheDocument();

    // Rows sorted by name: apple (1), banana (2), cherry (3)
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("1");
    expect(cells[1]).toHaveTextContent("apple");
  });

  it("handles null values by sorting them to the end", async () => {
    await renderWithResults({
      columns: ["id", "value"],
      rows: [[1, null], [2, "beta"], [3, "alpha"]],
    });

    // Sort by value column (index 1) ascending
    fireEvent.click(screen.getByTestId("sort-header-1"));

    const cells = screen.getAllByRole("cell");
    // alpha should come first, beta second, null last
    expect(cells[1]).toHaveTextContent("alpha");
    expect(cells[3]).toHaveTextContent("beta");
    expect(cells[5]).toHaveTextContent("null");
  });

  it("resets sort when a new query is executed", async () => {
    const { apiPost } = await import("@/api/client");
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
      total_rows: 3,
      execution_time_ms: 1.0,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Simulate typing in the CodeMirror editor via mock
    act(() => { mockOnChange?.("SELECT * FROM t", 15); });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
    });

    // Sort by id
    fireEvent.click(screen.getByTestId("sort-header-0"));
    expect(screen.getByTestId("sort-indicator-asc")).toBeInTheDocument();

    // Execute a new query
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      columns: ["id", "name"],
      rows: [[5, "elderberry"], [4, "date"]],
      total_rows: 2,
      execution_time_ms: 1.0,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      // Sort indicator should be gone
      expect(screen.queryByTestId("sort-indicator-asc")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sort-indicator-desc")).not.toBeInTheDocument();
    });

    // Rows in original order: 5, 4
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("5");
    expect(cells[2]).toHaveTextContent("4");
  });
});
