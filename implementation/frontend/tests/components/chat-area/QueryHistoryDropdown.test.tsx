// Comprehensive tests for QueryHistoryDropdown component
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { fireEvent } from "@testing-library/react";
import { useQueryHistoryStore, type QueryHistoryEntry } from "@/stores/queryHistoryStore";
import { useSavedQueryStore } from "@/stores/savedQueryStore";
import { QueryHistoryDropdown } from "@/components/chat-area/QueryHistoryDropdown";

vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

function makeEntry(overrides: Partial<QueryHistoryEntry> = {}): QueryHistoryEntry {
  return {
    query: "SELECT * FROM users",
    timestamp: Date.now(),
    ...overrides,
  };
}

const SAMPLE_QUERIES: QueryHistoryEntry[] = [
  makeEntry({ query: "SELECT * FROM users", timestamp: 1700000000000 }),
  makeEntry({ query: "SELECT COUNT(*) FROM orders", timestamp: 1700001000000 }),
  makeEntry({ query: "SELECT id, name FROM products WHERE price > 10", timestamp: 1700002000000 }),
];

beforeEach(() => {
  resetAllStores();
  useQueryHistoryStore.setState({ queries: [], isFetching: false });
  useSavedQueryStore.setState({ queries: [], isLoading: false });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe("QueryHistoryDropdown rendering", () => {
  it("renders query history button", () => {
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);
    expect(screen.getByTestId("query-history-button")).toBeDefined();
  });

  it("button is disabled when no queries exist", () => {
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);
    const button = screen.getByTestId("query-history-button");
    expect(button).toHaveProperty("disabled", true);
  });

  it("button is disabled when disabled prop is true even with queries", () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} disabled={true} />);
    const button = screen.getByTestId("query-history-button");
    expect(button).toHaveProperty("disabled", true);
  });

  it("button is enabled when there are queries and disabled prop is false", () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);
    const button = screen.getByTestId("query-history-button");
    expect(button).toHaveProperty("disabled", false);
  });

  it('button shows title "No query history" when no queries', () => {
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);
    const button = screen.getByTestId("query-history-button");
    expect(button.title).toBe("No query history");
  });

  it('button shows title "Recent SQL queries" when queries exist', () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);
    const button = screen.getByTestId("query-history-button");
    expect(button.title).toBe("Recent SQL queries");
  });
});

// ---------------------------------------------------------------------------
// Dropdown behavior
// ---------------------------------------------------------------------------
describe("QueryHistoryDropdown dropdown behavior", () => {
  it("clicking button opens dropdown", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();
  });

  it("clicking button again closes dropdown", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    const button = screen.getByTestId("query-history-button");
    await user.click(button);
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();

    await user.click(button);
    expect(screen.queryByTestId("query-history-dropdown")).toBeNull();
  });

  it('dropdown shows "Recent SQL Queries" header', async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByText("Recent SQL Queries")).toBeDefined();
  });

  it("dropdown renders query items", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByTestId("query-history-item-0")).toBeDefined();
    expect(screen.getByTestId("query-history-item-1")).toBeDefined();
    expect(screen.getByTestId("query-history-item-2")).toBeDefined();
  });

  it("query text is displayed in each item", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByText("SELECT * FROM users")).toBeDefined();
    expect(screen.getByText("SELECT COUNT(*) FROM orders")).toBeDefined();
    expect(screen.getByText("SELECT id, name FROM products WHERE price > 10")).toBeDefined();
  });

  it("timestamp is displayed for each query", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));

    // Each entry should have a formatted date string rendered
    const formattedDate = new Date(1700000000000).toLocaleString();
    expect(screen.getByText(formattedDate)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------
describe("QueryHistoryDropdown interaction", () => {
  it("clicking a query item calls onSelectQuery with correct query", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const onSelectQuery = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={onSelectQuery} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByTestId("query-history-item-1"));

    expect(onSelectQuery).toHaveBeenCalledTimes(1);
    expect(onSelectQuery).toHaveBeenCalledWith("SELECT COUNT(*) FROM orders");
  });

  it("clicking a query item closes the dropdown", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();

    await user.click(screen.getByTestId("query-history-item-0"));
    expect(screen.queryByTestId("query-history-dropdown")).toBeNull();
  });

  it("Clear All button clears history", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByText("Clear All"));

    // Store should be emptied
    expect(useQueryHistoryStore.getState().queries).toHaveLength(0);
  });

  it("Clear All button closes dropdown", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();

    await user.click(screen.getByText("Clear All"));
    expect(screen.queryByTestId("query-history-dropdown")).toBeNull();
  });

  it("save query button triggers window.prompt", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByTestId("save-query-btn-0"));

    expect(promptSpy).toHaveBeenCalledTimes(1);
    // The default name is derived from the first 30 chars of the query
    expect(promptSpy).toHaveBeenCalledWith(
      "Name for saved query:",
      "SELECT * FROM users"
    );
  });
});

// ---------------------------------------------------------------------------
// Click outside / Escape
// ---------------------------------------------------------------------------
describe("QueryHistoryDropdown close behaviors", () => {
  it("clicking outside closes dropdown", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <div data-testid="outside-element">Outside</div>
        <QueryHistoryDropdown onSelectQuery={vi.fn()} />
      </div>
    );

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();

    // Click outside the dropdown via mousedown on document
    fireEvent.mouseDown(screen.getByTestId("outside-element"));
    expect(screen.queryByTestId("query-history-dropdown")).toBeNull();
  });

  it("Escape key closes dropdown", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("query-history-dropdown")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("QueryHistoryDropdown edge cases", () => {
  it("works with empty queries array (button disabled)", () => {
    useQueryHistoryStore.setState({ queries: [] });
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    const button = screen.getByTestId("query-history-button");
    expect(button).toHaveProperty("disabled", true);
    // Dropdown should not be in DOM
    expect(screen.queryByTestId("query-history-dropdown")).toBeNull();
  });

  it("handles long query text with truncation via CSS class", async () => {
    const longQuery = "SELECT " + "a, ".repeat(200) + "z FROM very_long_table_name";
    useQueryHistoryStore.setState({
      queries: [makeEntry({ query: longQuery })],
    });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    const item = screen.getByTestId("query-history-item-0");

    // The query text container should have the truncate CSS class
    const queryDiv = item.querySelector(".truncate");
    expect(queryDiv).not.toBeNull();
    // The full query should be in the title attribute for tooltip
    expect(queryDiv!.getAttribute("title")).toBe(longQuery);
    // The text content should contain the full query (CSS truncation is visual only)
    expect(queryDiv!.textContent).toBe(longQuery);
  });

  it("save query calls savedQueryStore.saveQuery when name is provided", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    vi.spyOn(window, "prompt").mockReturnValue("My Saved Query");
    const saveQuerySpy = vi.spyOn(useSavedQueryStore.getState(), "saveQuery").mockResolvedValue({
      id: "new-id",
      name: "My Saved Query",
      query: "SELECT * FROM users",
      created_at: new Date().toISOString(),
      folder: "",
      is_pinned: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByTestId("save-query-btn-0"));

    expect(saveQuerySpy).toHaveBeenCalledTimes(1);
    expect(saveQuerySpy).toHaveBeenCalledWith("My Saved Query", "SELECT * FROM users");
  });

  it("save query does NOT call savedQueryStore.saveQuery when prompt is cancelled", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const saveQuerySpy = vi.spyOn(useSavedQueryStore.getState(), "saveQuery").mockResolvedValue({
      id: "new-id",
      name: "test",
      query: "test",
      created_at: new Date().toISOString(),
      folder: "",
      is_pinned: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByTestId("save-query-btn-0"));

    expect(saveQuerySpy).not.toHaveBeenCalled();
  });

  it("save query does NOT call savedQueryStore.saveQuery when prompt returns empty string", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    vi.spyOn(window, "prompt").mockReturnValue("");
    const saveQuerySpy = vi.spyOn(useSavedQueryStore.getState(), "saveQuery").mockResolvedValue({
      id: "new-id",
      name: "test",
      query: "test",
      created_at: new Date().toISOString(),
      folder: "",
      is_pinned: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByTestId("save-query-btn-0"));

    expect(saveQuerySpy).not.toHaveBeenCalled();
  });

  it("save query button click does not close the dropdown or select the query", async () => {
    useQueryHistoryStore.setState({ queries: SAMPLE_QUERIES });
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const onSelectQuery = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={onSelectQuery} />);

    await user.click(screen.getByTestId("query-history-button"));
    await user.click(screen.getByTestId("save-query-btn-0"));

    // onSelectQuery should not have been called
    expect(onSelectQuery).not.toHaveBeenCalled();
    // Dropdown should still be open
    expect(screen.getByTestId("query-history-dropdown")).toBeDefined();
  });

  it("button has aria-label for accessibility", () => {
    renderWithProviders(<QueryHistoryDropdown onSelectQuery={vi.fn()} />);
    const button = screen.getByTestId("query-history-button");
    expect(button.getAttribute("aria-label")).toBe("Query history");
  });
});
