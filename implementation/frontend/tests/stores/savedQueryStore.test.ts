// Tests for savedQueryStore Zustand store
// Covers: fetchQueries, saveQuery, deleteQuery, moveToFolder,
//         togglePin, getFolders, parseRawSavedQuery edge cases

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSavedQueryStore, SavedQuery, SavedQueryResultData } from "@/stores/savedQueryStore";

// Mock the API client module so network calls don't actually fire
vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  shareQuery: vi.fn(),
  unshareQuery: vi.fn(),
}));

import { apiGet, apiPost, apiPatch, apiDelete } from "@/api/client";

const mockedApiGet = vi.mocked(apiGet);
const mockedApiPost = vi.mocked(apiPost);
const mockedApiPatch = vi.mocked(apiPatch);
const mockedApiDelete = vi.mocked(apiDelete);

/** Helper to build a raw API response object (with result_json as a string). */
function makeRawQuery(overrides: Record<string, unknown> = {}) {
  return {
    id: "sq-1",
    name: "Test Query",
    query: "SELECT * FROM users",
    created_at: "2025-06-01T12:00:00Z",
    result_json: null as string | null,
    execution_time_ms: null as number | null,
    folder: "",
    is_pinned: false,
    share_token: null,
    ...overrides,
  };
}

/** Helper to build a SavedQuery for seeding state directly. */
function makeSavedQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: "sq-1",
    name: "Test Query",
    query: "SELECT * FROM users",
    created_at: "2025-06-01T12:00:00Z",
    result_data: undefined,
    execution_time_ms: null,
    folder: "",
    is_pinned: false,
    share_token: null,
    ...overrides,
  };
}

describe("savedQueryStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSavedQueryStore.setState({ queries: [], isLoading: false });
    vi.clearAllMocks();
  });

  // ─── Initial State ──────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with empty queries array", () => {
      expect(useSavedQueryStore.getState().queries).toHaveLength(0);
    });

    it("starts with isLoading false", () => {
      expect(useSavedQueryStore.getState().isLoading).toBe(false);
    });
  });

  // ─── fetchQueries ───────────────────────────────────────────────────

  describe("fetchQueries", () => {
    it("sets isLoading true during fetch and false after success", async () => {
      mockedApiGet.mockResolvedValue({ queries: [] });

      const promise = useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().isLoading).toBe(true);

      await promise;
      expect(useSavedQueryStore.getState().isLoading).toBe(false);
    });

    it("sets isLoading false even when the API call fails", async () => {
      mockedApiGet.mockRejectedValue(new Error("Network error"));

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().isLoading).toBe(false);
    });

    it("calls apiGet with /saved-queries", async () => {
      mockedApiGet.mockResolvedValue({ queries: [] });

      await useSavedQueryStore.getState().fetchQueries();
      expect(mockedApiGet).toHaveBeenCalledWith("/saved-queries");
    });

    it("populates queries from the API response", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [
          makeRawQuery({ id: "sq-1", name: "Query A" }),
          makeRawQuery({ id: "sq-2", name: "Query B" }),
        ],
      });

      await useSavedQueryStore.getState().fetchQueries();
      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(2);
      expect(queries[0].id).toBe("sq-1");
      expect(queries[0].name).toBe("Query A");
      expect(queries[1].id).toBe("sq-2");
      expect(queries[1].name).toBe("Query B");
    });

    it("parses result_json string into result_data object", async () => {
      const resultData: SavedQueryResultData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"], [2, "Bob"]],
        total_rows: 2,
      };
      mockedApiGet.mockResolvedValue({
        queries: [
          makeRawQuery({ id: "sq-1", result_json: JSON.stringify(resultData) }),
        ],
      });

      await useSavedQueryStore.getState().fetchQueries();
      const q = useSavedQueryStore.getState().queries[0];
      expect(q.result_data).toEqual(resultData);
    });

    it("keeps existing state when the API call fails", async () => {
      // Seed with existing data
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "existing" })],
      });
      mockedApiGet.mockRejectedValue(new Error("Server error"));

      await useSavedQueryStore.getState().fetchQueries();
      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(1);
      expect(queries[0].id).toBe("existing");
    });

    it("replaces all queries on successful fetch (not merge)", async () => {
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "old-1" })],
      });
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ id: "new-1" })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(1);
      expect(queries[0].id).toBe("new-1");
    });

    it("handles API returning null/undefined queries array", async () => {
      mockedApiGet.mockResolvedValue({ queries: null });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries).toHaveLength(0);
    });
  });

  // ─── saveQuery ──────────────────────────────────────────────────────

  describe("saveQuery", () => {
    it("calls apiPost with the correct endpoint and payload", async () => {
      mockedApiPost.mockResolvedValue(
        makeRawQuery({ id: "sq-new", name: "My Query" })
      );

      await useSavedQueryStore.getState().saveQuery(
        "My Query",
        "SELECT 1",
        undefined,
        undefined,
        "Reports"
      );

      expect(mockedApiPost).toHaveBeenCalledWith("/saved-queries", {
        name: "My Query",
        query: "SELECT 1",
        result_json: undefined,
        execution_time_ms: undefined,
        folder: "Reports",
      });
    });

    it("sends result_json as a JSON string when resultData is provided", async () => {
      const resultData: SavedQueryResultData = {
        columns: ["x"],
        rows: [[1], [2]],
        total_rows: 2,
      };
      mockedApiPost.mockResolvedValue(
        makeRawQuery({ id: "sq-new", result_json: JSON.stringify(resultData) })
      );

      await useSavedQueryStore.getState().saveQuery(
        "Q",
        "SELECT x",
        resultData,
        42
      );

      const call = mockedApiPost.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(typeof payload.result_json).toBe("string");
      expect(JSON.parse(payload.result_json as string)).toEqual(resultData);
    });

    it("caps rows at 100 in the result_json payload", async () => {
      const manyRows = Array.from({ length: 200 }, (_, i) => [i]);
      const resultData: SavedQueryResultData = {
        columns: ["n"],
        rows: manyRows,
        total_rows: 200,
      };
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-capped" }));

      await useSavedQueryStore.getState().saveQuery("Q", "SELECT n", resultData);

      const call = mockedApiPost.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const sentData = JSON.parse(payload.result_json as string) as SavedQueryResultData;
      expect(sentData.rows).toHaveLength(100);
      expect(sentData.total_rows).toBe(200); // preserves original total
    });

    it("does not cap rows when under 100", async () => {
      const rows = Array.from({ length: 50 }, (_, i) => [i]);
      const resultData: SavedQueryResultData = {
        columns: ["n"],
        rows,
        total_rows: 50,
      };
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-small" }));

      await useSavedQueryStore.getState().saveQuery("Q", "SELECT n", resultData);

      const call = mockedApiPost.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const sentData = JSON.parse(payload.result_json as string) as SavedQueryResultData;
      expect(sentData.rows).toHaveLength(50);
    });

    it("prepends the saved query to the state", async () => {
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "existing", name: "Old" })],
      });
      mockedApiPost.mockResolvedValue(
        makeRawQuery({ id: "sq-new", name: "New" })
      );

      await useSavedQueryStore.getState().saveQuery("New", "SELECT 1");

      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(2);
      expect(queries[0].id).toBe("sq-new");
      expect(queries[0].name).toBe("New");
      expect(queries[1].id).toBe("existing");
    });

    it("returns the parsed SavedQuery object", async () => {
      const resultData: SavedQueryResultData = {
        columns: ["a"],
        rows: [[1]],
        total_rows: 1,
      };
      mockedApiPost.mockResolvedValue(
        makeRawQuery({
          id: "sq-ret",
          name: "Returned",
          result_json: JSON.stringify(resultData),
        })
      );

      const result = await useSavedQueryStore.getState().saveQuery(
        "Returned",
        "SELECT a"
      );

      expect(result.id).toBe("sq-ret");
      expect(result.name).toBe("Returned");
      expect(result.result_data).toEqual(resultData);
    });

    it("defaults folder to empty string when not provided", async () => {
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-nf" }));

      await useSavedQueryStore.getState().saveQuery("Q", "SELECT 1");

      const call = mockedApiPost.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.folder).toBe("");
    });

    it("passes execution_time_ms to the API when provided", async () => {
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-t" }));

      await useSavedQueryStore.getState().saveQuery("Q", "SELECT 1", undefined, 150);

      const call = mockedApiPost.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.execution_time_ms).toBe(150);
    });

    it("sends execution_time_ms as undefined when null is passed", async () => {
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-null-t" }));

      await useSavedQueryStore.getState().saveQuery("Q", "SELECT 1", undefined, null);

      const call = mockedApiPost.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      expect(payload.execution_time_ms).toBeUndefined();
    });
  });

  // ─── deleteQuery ────────────────────────────────────────────────────

  describe("deleteQuery", () => {
    it("calls apiDelete with the correct endpoint", async () => {
      mockedApiDelete.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-del" })],
      });

      await useSavedQueryStore.getState().deleteQuery("sq-del");
      expect(mockedApiDelete).toHaveBeenCalledWith("/saved-queries/sq-del");
    });

    it("removes the query from local state after successful delete", async () => {
      mockedApiDelete.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1" }),
          makeSavedQuery({ id: "sq-2" }),
        ],
      });

      await useSavedQueryStore.getState().deleteQuery("sq-1");
      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(1);
      expect(queries[0].id).toBe("sq-2");
    });

    it("propagates API errors (does not silently catch)", async () => {
      mockedApiDelete.mockRejectedValue(new Error("Forbidden"));
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-err" })],
      });

      await expect(
        useSavedQueryStore.getState().deleteQuery("sq-err")
      ).rejects.toThrow("Forbidden");
    });

    it("does not remove from state when API fails (await rejects before set)", async () => {
      mockedApiDelete.mockRejectedValue(new Error("Server error"));
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-err" })],
      });

      try {
        await useSavedQueryStore.getState().deleteQuery("sq-err");
      } catch {
        // expected
      }
      // State should still have the query since apiDelete is awaited before set
      expect(useSavedQueryStore.getState().queries).toHaveLength(1);
    });
  });

  // ─── moveToFolder ───────────────────────────────────────────────────

  describe("moveToFolder", () => {
    it("calls apiPatch with the correct endpoint and payload", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-mv", folder: "" })],
      });

      await useSavedQueryStore.getState().moveToFolder("sq-mv", "Reports");
      expect(mockedApiPatch).toHaveBeenCalledWith("/saved-queries/sq-mv/folder", {
        folder: "Reports",
      });
    });

    it("updates the folder in local state after success", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-mv", folder: "" })],
      });

      await useSavedQueryStore.getState().moveToFolder("sq-mv", "Analytics");
      expect(useSavedQueryStore.getState().queries[0].folder).toBe("Analytics");
    });

    it("only updates the targeted query, leaving others unchanged", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", folder: "Original" }),
          makeSavedQuery({ id: "sq-2", folder: "Other" }),
        ],
      });

      await useSavedQueryStore.getState().moveToFolder("sq-1", "Moved");
      const { queries } = useSavedQueryStore.getState();
      expect(queries[0].folder).toBe("Moved");
      expect(queries[1].folder).toBe("Other");
    });

    it("can move a query to the root folder (empty string)", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-1", folder: "Reports" })],
      });

      await useSavedQueryStore.getState().moveToFolder("sq-1", "");
      expect(useSavedQueryStore.getState().queries[0].folder).toBe("");
    });

    it("does not update state when API fails (await rejects before set)", async () => {
      mockedApiPatch.mockRejectedValue(new Error("Forbidden"));
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-err", folder: "Original" })],
      });

      try {
        await useSavedQueryStore.getState().moveToFolder("sq-err", "New");
      } catch {
        // expected
      }
      expect(useSavedQueryStore.getState().queries[0].folder).toBe("Original");
    });
  });

  // ─── togglePin ──────────────────────────────────────────────────────

  describe("togglePin", () => {
    it("optimistically toggles is_pinned from false to true", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-1", is_pinned: false })],
      });

      const promise = useSavedQueryStore.getState().togglePin("sq-1");
      // Optimistic: should be true immediately
      expect(useSavedQueryStore.getState().queries[0].is_pinned).toBe(true);
      await promise;
    });

    it("optimistically toggles is_pinned from true to false", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-1", is_pinned: true })],
      });

      const promise = useSavedQueryStore.getState().togglePin("sq-1");
      expect(useSavedQueryStore.getState().queries[0].is_pinned).toBe(false);
      await promise;
    });

    it("calls apiPatch with the correct endpoint", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-pin" })],
      });

      await useSavedQueryStore.getState().togglePin("sq-pin");
      expect(mockedApiPatch).toHaveBeenCalledWith("/saved-queries/sq-pin/pin");
    });

    it("sorts pinned queries to the top after toggling", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", name: "A", is_pinned: false }),
          makeSavedQuery({ id: "sq-2", name: "B", is_pinned: false }),
          makeSavedQuery({ id: "sq-3", name: "C", is_pinned: false }),
        ],
      });

      // Pin the last query
      await useSavedQueryStore.getState().togglePin("sq-3");
      const { queries } = useSavedQueryStore.getState();
      expect(queries[0].id).toBe("sq-3");
      expect(queries[0].is_pinned).toBe(true);
    });

    it("reverts the pin state on API failure", async () => {
      mockedApiPatch.mockRejectedValue(new Error("Server error"));
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-1", is_pinned: false })],
      });

      await useSavedQueryStore.getState().togglePin("sq-1");
      // Should revert back to false
      expect(useSavedQueryStore.getState().queries[0].is_pinned).toBe(false);
    });

    it("reverts sorting on API failure", async () => {
      mockedApiPatch.mockRejectedValue(new Error("Server error"));
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", name: "A", is_pinned: false }),
          makeSavedQuery({ id: "sq-2", name: "B", is_pinned: false }),
        ],
      });

      await useSavedQueryStore.getState().togglePin("sq-2");
      // After revert, sq-2 should no longer be pinned and order should revert
      const { queries } = useSavedQueryStore.getState();
      expect(queries.find((q) => q.id === "sq-2")!.is_pinned).toBe(false);
    });

    it("does not modify state for a non-existent id", async () => {
      useSavedQueryStore.setState({
        queries: [makeSavedQuery({ id: "sq-1", is_pinned: false })],
      });

      await useSavedQueryStore.getState().togglePin("nonexistent");
      expect(mockedApiPatch).not.toHaveBeenCalled();
      expect(useSavedQueryStore.getState().queries[0].is_pinned).toBe(false);
    });

    it("maintains relative order among pinned and unpinned queries", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", is_pinned: true }),
          makeSavedQuery({ id: "sq-2", is_pinned: false }),
          makeSavedQuery({ id: "sq-3", is_pinned: false }),
        ],
      });

      // Pin sq-3
      await useSavedQueryStore.getState().togglePin("sq-3");
      const { queries } = useSavedQueryStore.getState();
      // Both sq-1 and sq-3 are pinned, should appear before sq-2
      const pinnedIds = queries.filter((q) => q.is_pinned).map((q) => q.id);
      const unpinnedIds = queries.filter((q) => !q.is_pinned).map((q) => q.id);
      expect(pinnedIds).toEqual(["sq-1", "sq-3"]);
      expect(unpinnedIds).toEqual(["sq-2"]);
    });

    it("unpinning moves query below pinned queries", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", is_pinned: true }),
          makeSavedQuery({ id: "sq-2", is_pinned: true }),
          makeSavedQuery({ id: "sq-3", is_pinned: false }),
        ],
      });

      // Unpin sq-1
      await useSavedQueryStore.getState().togglePin("sq-1");
      const { queries } = useSavedQueryStore.getState();
      // sq-2 should remain pinned and be first
      expect(queries[0].id).toBe("sq-2");
      expect(queries[0].is_pinned).toBe(true);
      // sq-1 should now be unpinned
      expect(queries.find((q) => q.id === "sq-1")!.is_pinned).toBe(false);
    });
  });

  // ─── getFolders ─────────────────────────────────────────────────────

  describe("getFolders", () => {
    it("returns an empty array when no queries exist", () => {
      expect(useSavedQueryStore.getState().getFolders()).toEqual([]);
    });

    it("returns an empty array when all queries have empty folder", () => {
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", folder: "" }),
          makeSavedQuery({ id: "sq-2", folder: "" }),
        ],
      });
      expect(useSavedQueryStore.getState().getFolders()).toEqual([]);
    });

    it("returns unique folder names sorted alphabetically", () => {
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", folder: "Zebra" }),
          makeSavedQuery({ id: "sq-2", folder: "Alpha" }),
          makeSavedQuery({ id: "sq-3", folder: "Zebra" }),
          makeSavedQuery({ id: "sq-4", folder: "Middle" }),
        ],
      });
      expect(useSavedQueryStore.getState().getFolders()).toEqual([
        "Alpha",
        "Middle",
        "Zebra",
      ]);
    });

    it("excludes empty string folders from the result", () => {
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", folder: "Reports" }),
          makeSavedQuery({ id: "sq-2", folder: "" }),
        ],
      });
      expect(useSavedQueryStore.getState().getFolders()).toEqual(["Reports"]);
    });

    it("returns a single folder when only one unique folder exists", () => {
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", folder: "Only" }),
          makeSavedQuery({ id: "sq-2", folder: "Only" }),
        ],
      });
      expect(useSavedQueryStore.getState().getFolders()).toEqual(["Only"]);
    });
  });

  // ─── parseRawSavedQuery edge cases ──────────────────────────────────

  describe("parseRawSavedQuery (via fetchQueries)", () => {
    it("sets result_data to undefined when result_json is null", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ result_json: null })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].result_data).toBeUndefined();
    });

    it("sets result_data to undefined when result_json is undefined", async () => {
      const raw = makeRawQuery();
      delete (raw as Record<string, unknown>).result_json;
      mockedApiGet.mockResolvedValue({ queries: [raw] });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].result_data).toBeUndefined();
    });

    it("sets result_data to undefined when result_json is malformed JSON", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ result_json: "not valid json {{{" })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].result_data).toBeUndefined();
    });

    it("sets result_data to undefined when result_json is an empty string", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ result_json: "" })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      // Empty string is falsy, so result_data should be undefined
      expect(useSavedQueryStore.getState().queries[0].result_data).toBeUndefined();
    });

    it("defaults folder to empty string when missing from raw data", async () => {
      const raw = makeRawQuery();
      delete (raw as Record<string, unknown>).folder;
      mockedApiGet.mockResolvedValue({ queries: [raw] });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].folder).toBe("");
    });

    it("defaults is_pinned to false when missing from raw data", async () => {
      const raw = makeRawQuery();
      delete (raw as Record<string, unknown>).is_pinned;
      mockedApiGet.mockResolvedValue({ queries: [raw] });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].is_pinned).toBe(false);
    });

    it("defaults folder to empty string when folder is null", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ folder: null })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].folder).toBe("");
    });

    it("defaults is_pinned to false when is_pinned is undefined", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ is_pinned: undefined })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].is_pinned).toBe(false);
    });

    it("preserves execution_time_ms from raw data", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ execution_time_ms: 256 })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].execution_time_ms).toBe(256);
    });

    it("preserves share_token from raw data", async () => {
      mockedApiGet.mockResolvedValue({
        queries: [makeRawQuery({ share_token: "abc-123-share" })],
      });

      await useSavedQueryStore.getState().fetchQueries();
      expect(useSavedQueryStore.getState().queries[0].share_token).toBe("abc-123-share");
    });

    it("correctly parses a fully populated raw query", async () => {
      const resultData: SavedQueryResultData = {
        columns: ["id", "name", "email"],
        rows: [[1, "Alice", "a@b.com"]],
        total_rows: 1,
      };
      mockedApiGet.mockResolvedValue({
        queries: [
          makeRawQuery({
            id: "sq-full",
            name: "Full Query",
            query: "SELECT * FROM users LIMIT 1",
            created_at: "2025-07-01T00:00:00Z",
            result_json: JSON.stringify(resultData),
            execution_time_ms: 42,
            folder: "Analytics",
            is_pinned: true,
            share_token: "tok-123",
          }),
        ],
      });

      await useSavedQueryStore.getState().fetchQueries();
      const q = useSavedQueryStore.getState().queries[0];
      expect(q.id).toBe("sq-full");
      expect(q.name).toBe("Full Query");
      expect(q.query).toBe("SELECT * FROM users LIMIT 1");
      expect(q.created_at).toBe("2025-07-01T00:00:00Z");
      expect(q.result_data).toEqual(resultData);
      expect(q.execution_time_ms).toBe(42);
      expect(q.folder).toBe("Analytics");
      expect(q.is_pinned).toBe(true);
      expect(q.share_token).toBe("tok-123");
    });
  });

  // ─── Combined / Integration-style edge cases ───────────────────────

  describe("edge cases", () => {
    it("handles save then delete leaving empty state", async () => {
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-temp" }));
      mockedApiDelete.mockResolvedValue(undefined);

      await useSavedQueryStore.getState().saveQuery("Temp", "SELECT 1");
      expect(useSavedQueryStore.getState().queries).toHaveLength(1);

      await useSavedQueryStore.getState().deleteQuery("sq-temp");
      expect(useSavedQueryStore.getState().queries).toHaveLength(0);
    });

    it("handles multiple rapid saves building up the list", async () => {
      mockedApiPost
        .mockResolvedValueOnce(makeRawQuery({ id: "sq-a", name: "A" }))
        .mockResolvedValueOnce(makeRawQuery({ id: "sq-b", name: "B" }))
        .mockResolvedValueOnce(makeRawQuery({ id: "sq-c", name: "C" }));

      await useSavedQueryStore.getState().saveQuery("A", "SELECT 1");
      await useSavedQueryStore.getState().saveQuery("B", "SELECT 2");
      await useSavedQueryStore.getState().saveQuery("C", "SELECT 3");

      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(3);
      // Most recent first
      expect(queries[0].id).toBe("sq-c");
      expect(queries[1].id).toBe("sq-b");
      expect(queries[2].id).toBe("sq-a");
    });

    it("getFolders reflects folder changes from moveToFolder", async () => {
      mockedApiPatch.mockResolvedValue(undefined);
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", folder: "Old" }),
        ],
      });

      expect(useSavedQueryStore.getState().getFolders()).toEqual(["Old"]);

      await useSavedQueryStore.getState().moveToFolder("sq-1", "New");
      expect(useSavedQueryStore.getState().getFolders()).toEqual(["New"]);
    });

    it("pin toggle + revert does not corrupt other queries", async () => {
      mockedApiPatch.mockRejectedValue(new Error("Fail"));
      useSavedQueryStore.setState({
        queries: [
          makeSavedQuery({ id: "sq-1", name: "A", is_pinned: true, folder: "F1" }),
          makeSavedQuery({ id: "sq-2", name: "B", is_pinned: false, folder: "F2" }),
        ],
      });

      await useSavedQueryStore.getState().togglePin("sq-2");
      const { queries } = useSavedQueryStore.getState();
      // sq-2 should revert to false
      expect(queries.find((q) => q.id === "sq-2")!.is_pinned).toBe(false);
      // sq-1 should remain pinned and other fields intact
      const sq1 = queries.find((q) => q.id === "sq-1")!;
      expect(sq1.is_pinned).toBe(true);
      expect(sq1.folder).toBe("F1");
    });

    it("fetching after local modifications replaces all state", async () => {
      mockedApiPost.mockResolvedValue(makeRawQuery({ id: "sq-local" }));
      await useSavedQueryStore.getState().saveQuery("Local", "SELECT 1");
      expect(useSavedQueryStore.getState().queries).toHaveLength(1);

      mockedApiGet.mockResolvedValue({
        queries: [
          makeRawQuery({ id: "sq-server-1" }),
          makeRawQuery({ id: "sq-server-2" }),
        ],
      });
      await useSavedQueryStore.getState().fetchQueries();
      const { queries } = useSavedQueryStore.getState();
      expect(queries).toHaveLength(2);
      expect(queries.find((q) => q.id === "sq-local")).toBeUndefined();
    });
  });
});
