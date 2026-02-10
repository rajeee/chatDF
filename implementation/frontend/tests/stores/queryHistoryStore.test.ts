// Tests for queryHistoryStore Zustand store
// Covers: addQuery, clearHistory, fetchHistory, toggleStar,
//         deduplication, max history limit, edge cases

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useQueryHistoryStore, QueryHistoryEntry } from "@/stores/queryHistoryStore";

// Mock the API client module so network calls don't actually fire
vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
}));

import { apiGet, apiDelete, apiPatch } from "@/api/client";

const mockedApiGet = vi.mocked(apiGet);
const mockedApiDelete = vi.mocked(apiDelete);
const mockedApiPatch = vi.mocked(apiPatch);

describe("queryHistoryStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useQueryHistoryStore.setState({ queries: [], isFetching: false });
    vi.clearAllMocks();
  });

  describe("addQuery", () => {
    it("adds a query to an empty history", () => {
      useQueryHistoryStore.getState().addQuery("SELECT 1");
      const { queries } = useQueryHistoryStore.getState();
      expect(queries).toHaveLength(1);
      expect(queries[0].query).toBe("SELECT 1");
      expect(queries[0].timestamp).toBeGreaterThan(0);
    });

    it("prepends new queries (most recent first)", () => {
      useQueryHistoryStore.getState().addQuery("SELECT 1");
      useQueryHistoryStore.getState().addQuery("SELECT 2");
      const { queries } = useQueryHistoryStore.getState();
      expect(queries[0].query).toBe("SELECT 2");
      expect(queries[1].query).toBe("SELECT 1");
    });

    it("trims whitespace from the query", () => {
      useQueryHistoryStore.getState().addQuery("   SELECT 1   ");
      const { queries } = useQueryHistoryStore.getState();
      expect(queries[0].query).toBe("SELECT 1");
    });

    it("ignores empty or whitespace-only queries", () => {
      useQueryHistoryStore.getState().addQuery("");
      useQueryHistoryStore.getState().addQuery("   ");
      expect(useQueryHistoryStore.getState().queries).toHaveLength(0);
    });

    it("deduplicates queries case-insensitively", () => {
      useQueryHistoryStore.getState().addQuery("SELECT * FROM users");
      useQueryHistoryStore.getState().addQuery("select * from users");
      const { queries } = useQueryHistoryStore.getState();
      // Only one entry should remain (the newer one)
      expect(queries).toHaveLength(1);
      expect(queries[0].query).toBe("select * from users");
    });

    it("moves duplicate query to the top with a new timestamp", () => {
      useQueryHistoryStore.getState().addQuery("SELECT 1");
      const oldTimestamp = useQueryHistoryStore.getState().queries[0].timestamp;

      // Add another query in between
      useQueryHistoryStore.getState().addQuery("SELECT 2");

      // Re-add the first query
      useQueryHistoryStore.getState().addQuery("SELECT 1");

      const { queries } = useQueryHistoryStore.getState();
      expect(queries).toHaveLength(2);
      expect(queries[0].query).toBe("SELECT 1");
      expect(queries[0].timestamp).toBeGreaterThanOrEqual(oldTimestamp);
      expect(queries[1].query).toBe("SELECT 2");
    });

    it("enforces a maximum history size of 50", () => {
      for (let i = 0; i < 60; i++) {
        useQueryHistoryStore.getState().addQuery(`SELECT ${i}`);
      }
      const { queries } = useQueryHistoryStore.getState();
      expect(queries).toHaveLength(50);
      // Most recent query should be present
      expect(queries[0].query).toBe("SELECT 59");
      // Oldest queries should be evicted
      expect(queries.find((q) => q.query === "SELECT 0")).toBeUndefined();
    });
  });

  describe("clearHistory", () => {
    it("clears all queries from the store", async () => {
      mockedApiDelete.mockResolvedValue(undefined);
      useQueryHistoryStore.getState().addQuery("SELECT 1");
      useQueryHistoryStore.getState().addQuery("SELECT 2");

      await useQueryHistoryStore.getState().clearHistory();
      expect(useQueryHistoryStore.getState().queries).toHaveLength(0);
    });

    it("calls apiDelete to clear server-side history", async () => {
      mockedApiDelete.mockResolvedValue(undefined);
      await useQueryHistoryStore.getState().clearHistory();
      expect(mockedApiDelete).toHaveBeenCalledWith("/query-history");
    });

    it("clears local state even if the API call fails", async () => {
      mockedApiDelete.mockRejectedValue(new Error("Network error"));
      useQueryHistoryStore.getState().addQuery("SELECT 1");

      await useQueryHistoryStore.getState().clearHistory();
      expect(useQueryHistoryStore.getState().queries).toHaveLength(0);
    });
  });

  describe("fetchHistory", () => {
    it("sets isFetching true during fetch and false after", async () => {
      mockedApiGet.mockResolvedValue({ history: [], total: 0 });

      const promise = useQueryHistoryStore.getState().fetchHistory();
      // isFetching should be true immediately
      expect(useQueryHistoryStore.getState().isFetching).toBe(true);

      await promise;
      expect(useQueryHistoryStore.getState().isFetching).toBe(false);
    });

    it("populates queries from the API response", async () => {
      mockedApiGet.mockResolvedValue({
        history: [
          {
            id: "h1",
            query: "SELECT * FROM users",
            created_at: "2025-01-15T10:00:00Z",
            conversation_id: "conv-1",
            execution_time_ms: 42,
            row_count: 10,
            status: "success",
            error_message: null,
            source: "editor",
            is_starred: true,
          },
          {
            id: "h2",
            query: "SELECT COUNT(*) FROM orders",
            created_at: "2025-01-14T09:00:00Z",
            is_starred: false,
          },
        ],
        total: 2,
      });

      await useQueryHistoryStore.getState().fetchHistory();
      const { queries } = useQueryHistoryStore.getState();
      expect(queries).toHaveLength(2);
      expect(queries[0].id).toBe("h1");
      expect(queries[0].query).toBe("SELECT * FROM users");
      expect(queries[0].is_starred).toBe(true);
      expect(queries[0].status).toBe("success");
      expect(queries[1].id).toBe("h2");
      expect(queries[1].is_starred).toBe(false);
    });

    it("keeps existing local state when the API call fails", async () => {
      useQueryHistoryStore.getState().addQuery("local query");
      mockedApiGet.mockRejectedValue(new Error("Network error"));

      await useQueryHistoryStore.getState().fetchHistory();
      const { queries } = useQueryHistoryStore.getState();
      expect(queries).toHaveLength(1);
      expect(queries[0].query).toBe("local query");
    });

    it("sets isFetching false even when the API call fails", async () => {
      mockedApiGet.mockRejectedValue(new Error("Network error"));
      await useQueryHistoryStore.getState().fetchHistory();
      expect(useQueryHistoryStore.getState().isFetching).toBe(false);
    });
  });

  describe("toggleStar", () => {
    it("updates the is_starred field from API response", async () => {
      useQueryHistoryStore.setState({
        queries: [
          { id: "h1", query: "SELECT 1", timestamp: Date.now(), is_starred: false },
        ],
      });
      mockedApiPatch.mockResolvedValue({ id: "h1", is_starred: true });

      await useQueryHistoryStore.getState().toggleStar("h1");
      expect(useQueryHistoryStore.getState().queries[0].is_starred).toBe(true);
    });

    it("calls apiPatch with the correct endpoint", async () => {
      useQueryHistoryStore.setState({
        queries: [
          { id: "h1", query: "SELECT 1", timestamp: Date.now(), is_starred: false },
        ],
      });
      mockedApiPatch.mockResolvedValue({ id: "h1", is_starred: true });

      await useQueryHistoryStore.getState().toggleStar("h1");
      expect(mockedApiPatch).toHaveBeenCalledWith("/query-history/h1/star");
    });

    it("does not modify state when the API call fails", async () => {
      useQueryHistoryStore.setState({
        queries: [
          { id: "h1", query: "SELECT 1", timestamp: Date.now(), is_starred: false },
        ],
      });
      mockedApiPatch.mockRejectedValue(new Error("Network error"));

      await useQueryHistoryStore.getState().toggleStar("h1");
      expect(useQueryHistoryStore.getState().queries[0].is_starred).toBe(false);
    });

    it("only updates the targeted query, leaving others unchanged", async () => {
      useQueryHistoryStore.setState({
        queries: [
          { id: "h1", query: "SELECT 1", timestamp: Date.now(), is_starred: false },
          { id: "h2", query: "SELECT 2", timestamp: Date.now(), is_starred: true },
        ],
      });
      mockedApiPatch.mockResolvedValue({ id: "h1", is_starred: true });

      await useQueryHistoryStore.getState().toggleStar("h1");
      const { queries } = useQueryHistoryStore.getState();
      expect(queries[0].is_starred).toBe(true);
      expect(queries[1].is_starred).toBe(true); // unchanged
    });
  });

  describe("edge cases", () => {
    it("starts with empty queries and isFetching false", () => {
      useQueryHistoryStore.setState({ queries: [], isFetching: false });
      const state = useQueryHistoryStore.getState();
      expect(state.queries).toHaveLength(0);
      expect(state.isFetching).toBe(false);
    });

    it("handles adding then clearing then adding again", async () => {
      mockedApiDelete.mockResolvedValue(undefined);
      useQueryHistoryStore.getState().addQuery("SELECT 1");
      expect(useQueryHistoryStore.getState().queries).toHaveLength(1);

      await useQueryHistoryStore.getState().clearHistory();
      expect(useQueryHistoryStore.getState().queries).toHaveLength(0);

      useQueryHistoryStore.getState().addQuery("SELECT 2");
      expect(useQueryHistoryStore.getState().queries).toHaveLength(1);
      expect(useQueryHistoryStore.getState().queries[0].query).toBe("SELECT 2");
    });
  });
});
