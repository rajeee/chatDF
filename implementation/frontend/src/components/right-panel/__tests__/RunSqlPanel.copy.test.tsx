import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunSqlPanel } from "../RunSqlPanel";

// Copy-to-clipboard is now handled by the DataGrid component (which has its own tests).
// These tests verify that DataGrid's copy/export toolbar is rendered within RunSqlPanel.

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

describe("RunSqlPanel DataGrid copy/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = undefined;
  });

  async function executeQueryAndGetResults() {
    const { apiPost } = await import("@/api/client");
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      columns: ["id", "name", "value"],
      rows: [
        [1, "Alice", 100],
        [2, null, 200],
        [3, "Charlie", null],
      ],
      total_rows: 3,
      execution_time_ms: 5.0,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));
    act(() => { mockOnChange?.("SELECT * FROM t", 15); });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
    });
  }

  it("renders DataGrid with copy table button after executing a query", async () => {
    await executeQueryAndGetResults();

    // DataGrid provides its own "Copy table" button
    const copyBtn = screen.getByRole("button", { name: /copy table/i });
    expect(copyBtn).toBeInTheDocument();
  });

  it("renders DataGrid with Download CSV button", async () => {
    await executeQueryAndGetResults();

    const csvBtn = screen.getByRole("button", { name: /download csv/i });
    expect(csvBtn).toBeInTheDocument();
  });

  it("renders DataGrid with Download Excel button", async () => {
    await executeQueryAndGetResults();

    const xlsxBtn = screen.getByRole("button", { name: /download excel/i });
    expect(xlsxBtn).toBeInTheDocument();
  });
});
