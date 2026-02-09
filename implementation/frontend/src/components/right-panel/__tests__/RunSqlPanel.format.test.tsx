import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("RunSqlPanel Format button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Format button is visible when panel is expanded", () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    // Expand the panel
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    // Format button should be visible
    expect(screen.getByTestId("run-sql-format")).toBeInTheDocument();
  });

  it("Format button is disabled when textarea is empty", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const formatBtn = screen.getByTestId("run-sql-format");
    expect(formatBtn).toBeDisabled();
  });

  it("Clicking Format button formats the SQL in the textarea", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const textarea = screen.getByTestId("run-sql-textarea") as HTMLTextAreaElement;

    // Type unformatted SQL
    fireEvent.change(textarea, {
      target: { value: "SELECT id, name FROM users WHERE age > 18 AND status = 'active'" },
    });

    // Click format
    fireEvent.click(screen.getByTestId("run-sql-format"));

    // Textarea should now contain formatted SQL
    expect(textarea.value).toContain("SELECT\n");
    expect(textarea.value).toContain("  id,");
    expect(textarea.value).toContain("  name");
    expect(textarea.value).toContain("FROM users");
    expect(textarea.value).toContain("WHERE\n");
    expect(textarea.value).toContain("  age > 18");
    expect(textarea.value).toContain("  AND status = 'active'");
  });

  it("Ctrl+Shift+F keyboard shortcut formats SQL", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const textarea = screen.getByTestId("run-sql-textarea") as HTMLTextAreaElement;

    // Type unformatted SQL
    fireEvent.change(textarea, {
      target: { value: "SELECT id, name FROM users ORDER BY name" },
    });

    // Press Ctrl+Shift+F
    fireEvent.keyDown(textarea, {
      key: "f",
      ctrlKey: true,
      shiftKey: true,
    });

    // Textarea should now contain formatted SQL
    expect(textarea.value).toContain("SELECT\n");
    expect(textarea.value).toContain("  id,");
    expect(textarea.value).toContain("  name");
    expect(textarea.value).toContain("FROM users");
    expect(textarea.value).toContain("ORDER BY name");
  });
});
