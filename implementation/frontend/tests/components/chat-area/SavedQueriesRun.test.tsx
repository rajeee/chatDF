// Tests for SavedQueries run button functionality
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../helpers/render";
import { SavedQueries } from "@/components/chat-area/SavedQueries";
import { useSavedQueryStore } from "@/stores/savedQueryStore";

const MOCK_QUERIES = [
  { id: "q1", name: "All users", query: "SELECT * FROM users", created_at: "2025-01-01T00:00:00Z" },
  { id: "q2", name: "Order count", query: "SELECT COUNT(*) FROM orders", created_at: "2025-01-02T00:00:00Z" },
];

beforeEach(() => {
  // Seed the store with mock queries and stub fetchQueries to avoid API calls
  useSavedQueryStore.setState({ queries: MOCK_QUERIES, isLoading: false });
  vi.spyOn(useSavedQueryStore.getState(), "fetchQueries").mockResolvedValue(undefined);
});

describe("SavedQueries run button", () => {
  it("renders a run button on each saved query when onRunQuery is provided", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const onRunQuery = vi.fn();

    renderWithProviders(<SavedQueries onRunQuery={onRunQuery} />);

    // Expand the saved queries section
    const toggle = screen.getByTestId("saved-queries-toggle");
    await user.click(toggle);

    // Verify run buttons exist for each query
    expect(screen.getByTestId("run-saved-query-q1")).toBeDefined();
    expect(screen.getByTestId("run-saved-query-q2")).toBeDefined();
  });

  it("does not render run buttons when onRunQuery is not provided", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();

    renderWithProviders(<SavedQueries />);

    // Expand the saved queries section
    const toggle = screen.getByTestId("saved-queries-toggle");
    await user.click(toggle);

    // Verify run buttons do NOT exist
    expect(screen.queryByTestId("run-saved-query-q1")).toBeNull();
    expect(screen.queryByTestId("run-saved-query-q2")).toBeNull();
  });

  it("calls onRunQuery with the query text when run button is clicked", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const onRunQuery = vi.fn();

    renderWithProviders(<SavedQueries onRunQuery={onRunQuery} />);

    // Expand
    await user.click(screen.getByTestId("saved-queries-toggle"));

    // Click the run button for the first query
    await user.click(screen.getByTestId("run-saved-query-q1"));

    expect(onRunQuery).toHaveBeenCalledTimes(1);
    expect(onRunQuery).toHaveBeenCalledWith("SELECT * FROM users");
  });

  it("clicking the query row copies to clipboard and does not trigger onRunQuery", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const onRunQuery = vi.fn();

    // Mock clipboard API using defineProperty since navigator.clipboard is readonly
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<SavedQueries onRunQuery={onRunQuery} />);

    // Expand
    await user.click(screen.getByTestId("saved-queries-toggle"));

    // Click the row itself (not the run button)
    await user.click(screen.getByTestId("saved-query-q1"));

    // onRunQuery should NOT have been called
    expect(onRunQuery).not.toHaveBeenCalled();

    // Clipboard should have the query text
    expect(writeText).toHaveBeenCalledWith("SELECT * FROM users");
  });
});
