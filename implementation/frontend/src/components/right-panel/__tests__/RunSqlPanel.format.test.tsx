import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RunSqlPanel } from "../RunSqlPanel";

// Capture the onChange and onFormat callbacks from useEditableCodeMirror for test access
let mockOnChange: ((value: string, cursor: number) => void) | undefined;
let mockOnFormat: (() => void) | undefined;

vi.mock("@/hooks/useEditableCodeMirror", () => ({
  useEditableCodeMirror: (options: {
    onChange?: (value: string, cursor: number) => void;
    onFormat?: () => void;
  }) => {
    mockOnChange = options.onChange;
    mockOnFormat = options.onFormat;
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

describe("RunSqlPanel Format button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = undefined;
    mockOnFormat = undefined;
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

    const hiddenInput = screen.getByTestId("run-sql-textarea") as HTMLInputElement;

    // Simulate typing in the CodeMirror editor via mock
    act(() => {
      mockOnChange?.("SELECT id, name FROM users WHERE age > 18 AND status = 'active'", 60);
    });

    // Click format
    fireEvent.click(screen.getByTestId("run-sql-format"));

    // Hidden input value should now contain formatted SQL
    const value = hiddenInput.getAttribute("value") ?? "";
    expect(value).toContain("SELECT\n");
    expect(value).toContain("  id,");
    expect(value).toContain("  name");
    expect(value).toContain("FROM users");
    expect(value).toContain("WHERE\n");
    expect(value).toContain("  age > 18");
    expect(value).toContain("  AND status = 'active'");
  });

  it("Ctrl+Shift+F keyboard shortcut formats SQL", () => {
    render(<RunSqlPanel conversationId="test-conv" />);
    fireEvent.click(screen.getByTestId("run-sql-toggle"));

    const hiddenInput = screen.getByTestId("run-sql-textarea") as HTMLInputElement;

    // Simulate typing in the CodeMirror editor via mock
    act(() => {
      mockOnChange?.("SELECT id, name FROM users ORDER BY name", 40);
    });

    // Simulate Ctrl+Shift+F by invoking the onFormat callback captured from the mock
    act(() => { mockOnFormat?.(); });

    // Hidden input value should now contain formatted SQL
    const value = hiddenInput.getAttribute("value") ?? "";
    expect(value).toContain("SELECT\n");
    expect(value).toContain("  id,");
    expect(value).toContain("  name");
    expect(value).toContain("FROM users");
    expect(value).toContain("ORDER BY name");
  });
});
