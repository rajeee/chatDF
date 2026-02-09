import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunSqlPanel } from "../RunSqlPanel";

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

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

describe("RunSqlPanel copy to clipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // Expand the panel
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Type query and execute
    const textarea = screen.getByTestId("run-sql-textarea");
    fireEvent.change(textarea, { target: { value: "SELECT * FROM t" } });
    fireEvent.click(screen.getByTestId("run-sql-execute"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-results")).toBeInTheDocument();
    });
  }

  it("shows Copy button in results header after executing a query", async () => {
    await executeQueryAndGetResults();

    const copyBtn = screen.getByTestId("copy-results-tsv");
    expect(copyBtn).toBeInTheDocument();
    expect(copyBtn).toHaveTextContent("Copy");
  });

  it("copies TSV data to clipboard when Copy is clicked", async () => {
    await executeQueryAndGetResults();

    const copyBtn = screen.getByTestId("copy-results-tsv");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    const expectedTsv =
      "id\tname\tvalue\n" +
      "1\tAlice\t100\n" +
      "2\t\t200\n" +
      "3\tCharlie\t";

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedTsv);
  });

  it("shows 'Copied!' feedback after clicking Copy", async () => {
    await executeQueryAndGetResults();

    const copyBtn = screen.getByTestId("copy-results-tsv");
    expect(copyBtn).toHaveTextContent("Copy");

    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByTestId("copy-results-tsv")).toHaveTextContent("Copied!");
    });
  });
});
