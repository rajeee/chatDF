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

describe("RunSqlPanel pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = undefined;
  });

  it("shows pagination controls when multiple pages exist", async () => {
    const { apiPost } = await import("@/api/client");
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      columns: ["id", "name"],
      rows: Array.from({ length: 10 }, (_, i) => [i, `item-${i}`]),
      total_rows: 250,
      execution_time_ms: 5.0,
      page: 1,
      page_size: 10,
      total_pages: 25,
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

    // Check pagination controls exist
    expect(screen.getByTestId("pagination-info")).toHaveTextContent("Page 1 of 25");
    expect(screen.getByTestId("pagination-prev")).toBeDisabled();
    expect(screen.getByTestId("pagination-next")).not.toBeDisabled();
  });

  it("does not show pagination when only one page", async () => {
    const { apiPost } = await import("@/api/client");
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      columns: ["id"],
      rows: [[1], [2]],
      total_rows: 2,
      execution_time_ms: 1.0,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Simulate typing in the CodeMirror editor via mock
    act(() => { mockOnChange?.("SELECT 1", 8); });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("pagination-info")).not.toBeInTheDocument();
  });

  it("navigates to next page on click", async () => {
    const { apiPost } = await import("@/api/client");
    (apiPost as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        columns: ["id"],
        rows: Array.from({ length: 10 }, (_, i) => [i]),
        total_rows: 30,
        execution_time_ms: 5.0,
        page: 1,
        page_size: 10,
        total_pages: 3,
      })
      .mockResolvedValueOnce({
        columns: ["id"],
        rows: Array.from({ length: 10 }, (_, i) => [i + 10]),
        total_rows: 30,
        execution_time_ms: 3.0,
        page: 2,
        page_size: 10,
        total_pages: 3,
      });

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Simulate typing in the CodeMirror editor via mock
    act(() => { mockOnChange?.("SELECT * FROM t", 15); });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("pagination-info")).toHaveTextContent("Page 1 of 3");
    });

    fireEvent.click(screen.getByTestId("pagination-next"));

    await waitFor(() => {
      expect(screen.getByTestId("pagination-info")).toHaveTextContent("Page 2 of 3");
    });

    // Verify API was called with page=2
    expect(apiPost).toHaveBeenCalledTimes(2);
    const secondCall = (apiPost as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall[1]).toEqual({ sql: "SELECT * FROM t", page: 2, page_size: 10 });
  });
});
