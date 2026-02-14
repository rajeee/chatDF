import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunSqlPanel } from "../RunSqlPanel";

// Sorting is now handled by the DataGrid component (which has its own tests).
// These tests verify that RunSqlPanel renders DataGrid with correct data.

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

vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  explainSql: vi.fn(),
  generateSql: vi.fn(),
}));

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

describe("RunSqlPanel DataGrid integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = undefined;
  });

  async function renderWithResults(mockData: {
    columns: string[];
    rows: unknown[][];
    total_rows?: number;
    execution_time_ms?: number;
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
    fireEvent.click(screen.getByTestId("run-sql-toggle"));
    act(() => { mockOnChange?.("SELECT * FROM t", 15); });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
    });
  }

  it("renders DataGrid component with query results", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    // DataGrid should be rendered
    expect(screen.getByTestId("data-grid")).toBeInTheDocument();
  });

  it("displays all result rows in DataGrid", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[2, "banana"], [1, "apple"], [3, "cherry"]],
    });

    const cells = screen.getAllByRole("cell");
    expect(cells.length).toBeGreaterThanOrEqual(6); // 3 rows x 2 cols
    expect(cells[0]).toHaveTextContent("2");
    expect(cells[1]).toHaveTextContent("banana");
  });

  it("renders column headers from query result", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[1, "test"]],
    });

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("id");
    expect(headers[1]).toHaveTextContent("name");
  });

  it("DataGrid has sort icons on column headers", async () => {
    await renderWithResults({
      columns: ["id", "name"],
      rows: [[1, "test"]],
    });

    // DataGrid renders sort icon wrappers for each column
    const sortIcons = screen.getAllByTestId("sort-icon-wrapper");
    expect(sortIcons).toHaveLength(2);
  });

  it("displays row count and execution time in header", async () => {
    await renderWithResults({
      columns: ["id"],
      rows: [[1], [2], [3]],
      total_rows: 3,
      execution_time_ms: 42,
    });

    expect(screen.getByText("3 rows")).toBeInTheDocument();
    expect(screen.getByText("(42ms)")).toBeInTheDocument();
  });
});
