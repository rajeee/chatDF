import { describe, it, expect, beforeEach } from "vitest";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";

describe("queryHistoryStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useQueryHistoryStore.getState().clearHistory();
    // Clear localStorage
    localStorage.clear();
  });

  it("starts with empty history", () => {
    const { queries } = useQueryHistoryStore.getState();
    expect(queries).toEqual([]);
  });

  it("adds a query to history", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();
    addQuery("SELECT * FROM users");

    expect(queries).toHaveLength(1);
    expect(queries[0].query).toBe("SELECT * FROM users");
    expect(queries[0].timestamp).toBeGreaterThan(0);
  });

  it("trims whitespace when adding queries", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();
    addQuery("  SELECT * FROM users  ");

    expect(queries).toHaveLength(1);
    expect(queries[0].query).toBe("SELECT * FROM users");
  });

  it("ignores empty queries", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();
    addQuery("");
    addQuery("   ");

    expect(queries).toHaveLength(0);
  });

  it("removes duplicate queries (case-insensitive)", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();
    addQuery("SELECT * FROM users");
    addQuery("select * from users");

    expect(queries).toHaveLength(1);
    expect(queries[0].query).toBe("select * from users"); // Most recent wins
  });

  it("keeps queries in most-recent-first order", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();
    addQuery("Query 1");
    addQuery("Query 2");
    addQuery("Query 3");

    expect(queries).toHaveLength(3);
    expect(queries[0].query).toBe("Query 3");
    expect(queries[1].query).toBe("Query 2");
    expect(queries[2].query).toBe("Query 1");
  });

  it("limits history to 20 queries", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();

    // Add 25 queries
    for (let i = 1; i <= 25; i++) {
      addQuery(`Query ${i}`);
    }

    expect(queries).toHaveLength(20);
    expect(queries[0].query).toBe("Query 25"); // Most recent
    expect(queries[19].query).toBe("Query 6"); // Oldest kept (21-25 are kept, 1-5 are dropped)
  });

  it("moves duplicate to front when re-added", () => {
    const { addQuery, queries } = useQueryHistoryStore.getState();
    addQuery("Query 1");
    addQuery("Query 2");
    addQuery("Query 3");
    addQuery("Query 1"); // Re-add Query 1

    expect(queries).toHaveLength(3);
    expect(queries[0].query).toBe("Query 1"); // Moved to front
    expect(queries[1].query).toBe("Query 3");
    expect(queries[2].query).toBe("Query 2");
  });

  it("clears all history", () => {
    const { addQuery, clearHistory, queries } = useQueryHistoryStore.getState();
    addQuery("Query 1");
    addQuery("Query 2");

    clearHistory();

    expect(queries).toHaveLength(0);
  });

  it("persists to localStorage", () => {
    const { addQuery } = useQueryHistoryStore.getState();
    addQuery("SELECT * FROM users");

    // Check localStorage
    const stored = JSON.parse(localStorage.getItem("query-history-storage") || "{}");
    expect(stored.state.queries).toHaveLength(1);
    expect(stored.state.queries[0].query).toBe("SELECT * FROM users");
  });

  it("restores from localStorage", () => {
    // Manually set localStorage
    localStorage.setItem(
      "query-history-storage",
      JSON.stringify({
        state: {
          queries: [
            { query: "SELECT * FROM users", timestamp: 1234567890 },
            { query: "SELECT * FROM posts", timestamp: 1234567891 },
          ],
        },
        version: 0,
      })
    );

    // Create a fresh store instance by re-importing
    const { queries } = useQueryHistoryStore.getState();
    expect(queries).toHaveLength(2);
    expect(queries[0].query).toBe("SELECT * FROM users");
    expect(queries[1].query).toBe("SELECT * FROM posts");
  });
});
