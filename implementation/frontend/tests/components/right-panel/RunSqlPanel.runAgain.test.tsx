// Tests for RunSqlPanel consuming pendingSql from uiStore.
//
// RA-1: pendingSql populates textarea and expands panel
// RA-2: pendingSql is cleared after consumption
// RA-3: Panel stays expanded after pendingSql is consumed

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { RunSqlPanel } from "@/components/right-panel/RunSqlPanel";
import { useUiStore } from "@/stores/uiStore";

// Mock apiPost and other API functions
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

describe("RunSqlPanel pendingSql (Run Again)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset pendingSql to null
    useUiStore.setState({ pendingSql: null });
  });

  it("populates textarea and expands panel when pendingSql is set", async () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    // Panel is collapsed by default — textarea should not be visible
    expect(screen.queryByTestId("run-sql-textarea")).not.toBeInTheDocument();

    // Set pendingSql via the store (simulating "Run Again" from QueryHistoryPanel)
    act(() => {
      useUiStore.getState().setPendingSql("SELECT * FROM orders WHERE status = 'active'");
    });

    // Panel should expand and textarea should be populated
    await waitFor(() => {
      const textarea = screen.getByTestId("run-sql-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("SELECT * FROM orders WHERE status = 'active'");
    });
  });

  it("clears pendingSql from store after consuming it", async () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    act(() => {
      useUiStore.getState().setPendingSql("SELECT 1");
    });

    await waitFor(() => {
      expect(screen.getByTestId("run-sql-textarea")).toBeInTheDocument();
    });

    // pendingSql should have been cleared
    expect(useUiStore.getState().pendingSql).toBeNull();
  });

  it("keeps panel expanded after pendingSql is consumed", async () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    act(() => {
      useUiStore.getState().setPendingSql("SELECT COUNT(*) FROM users");
    });

    await waitFor(() => {
      const textarea = screen.getByTestId("run-sql-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("SELECT COUNT(*) FROM users");
    });

    // Panel should remain expanded even after pendingSql is cleared
    expect(screen.getByTestId("run-sql-textarea")).toBeInTheDocument();
  });

  it("replaces existing SQL when pendingSql is set", async () => {
    render(<RunSqlPanel conversationId="test-conv" />);

    // First, set some SQL
    act(() => {
      useUiStore.getState().setPendingSql("SELECT 1");
    });

    await waitFor(() => {
      const textarea = screen.getByTestId("run-sql-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("SELECT 1");
    });

    // Set new pendingSql — should replace the previous value
    act(() => {
      useUiStore.getState().setPendingSql("SELECT 2");
    });

    await waitFor(() => {
      const textarea = screen.getByTestId("run-sql-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("SELECT 2");
    });
  });
});
