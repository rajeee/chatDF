// Tests for the "Save Query" button in SQLPanel's SQLQueryBlock component.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SQLModal } from "@/components/chat-area/SQLPanel";
import { useUiStore } from "@/stores/uiStore";
import { useSavedQueryStore } from "@/stores/savedQueryStore";

// Mock the CodeMirror hook
vi.mock("@/hooks/useCodeMirror", () => ({
  useCodeMirror: () => {},
}));

// Mock react-plotly.js to avoid loading the heavy library in tests
vi.mock("react-plotly.js", () => ({
  default: () => <div data-testid="mock-plotly-chart">Chart</div>,
}));

const saveQueryMock = vi.fn().mockResolvedValue({ id: "q1", name: "test", query: "SELECT 1", created_at: "2025-01-01" });

beforeEach(() => {
  saveQueryMock.mockClear();

  // Spy on the store's saveQuery method
  vi.spyOn(useSavedQueryStore.getState(), "saveQuery").mockImplementation(saveQueryMock);

  useUiStore.setState({
    sqlModalOpen: true,
    activeSqlExecutions: [
      {
        query: "SELECT * FROM test_table LIMIT 10",
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
        total_rows: 1,
        error: null,
        execution_time_ms: 42,
      },
    ],
    sqlResultModalIndex: null,
  });
});

describe("SQLPanel save query button", () => {
  it("renders a save button for each query block", () => {
    render(<SQLModal />);

    const saveBtn = screen.getByTestId("save-query-btn-0");
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn.textContent).toBe("Save");
  });

  it("shows Saved! after clicking save button", async () => {
    const user = userEvent.setup();
    render(<SQLModal />);

    const saveBtn = screen.getByTestId("save-query-btn-0");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn.textContent).toBe("Saved!");
    });
  });

  it("calls saveQuery with truncated query name and full query", async () => {
    const user = userEvent.setup();
    render(<SQLModal />);

    const saveBtn = screen.getByTestId("save-query-btn-0");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveQueryMock).toHaveBeenCalledTimes(1);
      expect(saveQueryMock).toHaveBeenCalledWith(
        "SELECT * FROM test_table LIMIT 10",
        "SELECT * FROM test_table LIMIT 10",
      );
    });
  });

  it("truncates the default name to 50 characters for long queries", async () => {
    const longQuery = "SELECT very_long_column_name_one, very_long_column_name_two, very_long_column_name_three FROM some_table WHERE condition = true";
    useUiStore.setState({
      sqlModalOpen: true,
      activeSqlExecutions: [
        {
          query: longQuery,
          columns: ["col"],
          rows: [["val"]],
          total_rows: 1,
          error: null,
          execution_time_ms: 10,
        },
      ],
      sqlResultModalIndex: null,
    });

    const user = userEvent.setup();
    render(<SQLModal />);

    const saveBtn = screen.getByTestId("save-query-btn-0");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveQueryMock).toHaveBeenCalledTimes(1);
      const [name, query] = saveQueryMock.mock.calls[0];
      expect(name.length).toBeLessThanOrEqual(50);
      expect(query).toBe(longQuery);
    });
  });

  it("disables the button while saving", async () => {
    // Make saveQuery hang to test the loading state
    let resolveSave!: () => void;
    saveQueryMock.mockImplementation(() => new Promise<void>((r) => { resolveSave = r; }));

    const user = userEvent.setup();
    render(<SQLModal />);

    const saveBtn = screen.getByTestId("save-query-btn-0");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn.textContent).toBe("Saving...");
      expect(saveBtn).toBeDisabled();
    });

    // Resolve the save to clean up
    resolveSave();

    await waitFor(() => {
      expect(saveBtn.textContent).toBe("Saved!");
    });
  });
});
