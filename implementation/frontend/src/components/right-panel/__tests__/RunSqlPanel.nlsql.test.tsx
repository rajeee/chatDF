import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunSqlPanel } from "../RunSqlPanel";

// Mock apiPost and generateSql
const mockGenerateSql = vi.fn();

vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  explainSql: vi.fn(),
  generateSql: (...args: unknown[]) => mockGenerateSql(...args),
}));

// Mock stores
vi.mock("@/stores/queryHistoryStore", () => ({
  useQueryHistoryStore: vi.fn((selector) => {
    const state = { queries: [], addQuery: vi.fn(), clearHistory: vi.fn() };
    return selector(state);
  }),
}));

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
    { getState: () => ({ saveQuery: vi.fn().mockResolvedValue(undefined) }) }
  ),
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

describe("RunSqlPanel NL-to-SQL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders NL input when panel is expanded", () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    // Expand the panel
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // NL input should be visible
    expect(screen.getByTestId("nl-to-sql-input")).toBeInTheDocument();
    expect(screen.getByTestId("nl-to-sql-generate")).toBeInTheDocument();
  });

  it("does not render NL input when panel is collapsed", () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    // Panel is collapsed by default
    expect(screen.queryByTestId("nl-to-sql-input")).not.toBeInTheDocument();
  });

  it("Generate SQL button is disabled when input is empty", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const btn = screen.getByTestId("nl-to-sql-generate");
    expect(btn).toBeDisabled();
  });

  it("Generate SQL button is enabled when input has text", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const input = screen.getByTestId("nl-to-sql-input");
    fireEvent.change(input, { target: { value: "Show me all sales" } });

    const btn = screen.getByTestId("nl-to-sql-generate");
    expect(btn).not.toBeDisabled();
  });

  it("clicking Generate SQL calls the API and populates textarea", async () => {
    mockGenerateSql.mockResolvedValue({
      sql: "SELECT * FROM sales LIMIT 1000",
      explanation: "Selects all rows from the sales table.",
    });

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Type a question
    const input = screen.getByTestId("nl-to-sql-input");
    fireEvent.change(input, { target: { value: "Show me all sales" } });

    // Click generate
    fireEvent.click(screen.getByTestId("nl-to-sql-generate"));

    // Wait for the API call to complete
    await waitFor(() => {
      expect(mockGenerateSql).toHaveBeenCalledWith(
        "test-conv",
        "Show me all sales"
      );
    });

    // SQL textarea should be populated with the generated SQL
    await waitFor(() => {
      const textarea = screen.getByTestId(
        "run-sql-textarea"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("SELECT * FROM sales LIMIT 1000");
    });

    // Explanation should be displayed
    await waitFor(() => {
      expect(screen.getByTestId("run-sql-explanation")).toBeInTheDocument();
    });
  });

  it("Enter key triggers generation", async () => {
    mockGenerateSql.mockResolvedValue({
      sql: "SELECT COUNT(*) FROM sales",
      explanation: "Counts all sales.",
    });

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const input = screen.getByTestId("nl-to-sql-input");
    fireEvent.change(input, { target: { value: "How many sales?" } });

    // Press Enter
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(mockGenerateSql).toHaveBeenCalledWith(
        "test-conv",
        "How many sales?"
      );
    });
  });

  it("shows error when API call fails", async () => {
    mockGenerateSql.mockRejectedValue(new Error("No datasets loaded"));

    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const input = screen.getByTestId("nl-to-sql-input");
    fireEvent.change(input, { target: { value: "Show data" } });
    fireEvent.click(screen.getByTestId("nl-to-sql-generate"));

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("run-sql-error")).toHaveTextContent(
      "No datasets loaded"
    );
  });

  it("does not trigger generation with empty/whitespace input", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const input = screen.getByTestId("nl-to-sql-input");
    fireEvent.change(input, { target: { value: "   " } });

    // Button should still be disabled
    const btn = screen.getByTestId("nl-to-sql-generate");
    expect(btn).toBeDisabled();
  });
});
