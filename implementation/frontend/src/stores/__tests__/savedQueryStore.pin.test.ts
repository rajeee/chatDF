/**
 * Tests for the togglePin action in savedQueryStore.
 *
 * Covers:
 * - togglePin() optimistically updates is_pinned in store state
 * - togglePin() reverts on API failure
 * - Pinned queries sort to top of the queries array
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/helpers/mocks/server";
import { useSavedQueryStore } from "../savedQueryStore";

// Helper to reset the store before each test
function resetStore() {
  useSavedQueryStore.setState({
    queries: [],
    isLoading: false,
  });
}

// Helper to seed the store with test queries
function seedQueries() {
  useSavedQueryStore.setState({
    queries: [
      {
        id: "q1",
        name: "Query 1",
        query: "SELECT 1",
        created_at: "2025-01-01T00:00:00",
        folder: "",
        is_pinned: false,
      },
      {
        id: "q2",
        name: "Query 2",
        query: "SELECT 2",
        created_at: "2025-01-02T00:00:00",
        folder: "",
        is_pinned: false,
      },
      {
        id: "q3",
        name: "Query 3 (pinned)",
        query: "SELECT 3",
        created_at: "2025-01-03T00:00:00",
        folder: "",
        is_pinned: true,
      },
    ],
    isLoading: false,
  });
}

describe("savedQueryStore togglePin", () => {
  beforeEach(() => {
    resetStore();
  });

  it("should optimistically set is_pinned to true when toggling an unpinned query", async () => {
    // Set up a successful API response
    server.use(
      http.patch("/saved-queries/:id/pin", () => {
        return HttpResponse.json({
          id: "q1",
          name: "Query 1",
          query: "SELECT 1",
          created_at: "2025-01-01T00:00:00",
          folder: "",
          is_pinned: true,
        });
      })
    );

    seedQueries();

    await useSavedQueryStore.getState().togglePin("q1");

    const q1 = useSavedQueryStore.getState().queries.find((q) => q.id === "q1");
    expect(q1).toBeDefined();
    expect(q1!.is_pinned).toBe(true);
  });

  it("should optimistically set is_pinned to false when toggling a pinned query", async () => {
    server.use(
      http.patch("/saved-queries/:id/pin", () => {
        return HttpResponse.json({
          id: "q3",
          name: "Query 3 (pinned)",
          query: "SELECT 3",
          created_at: "2025-01-03T00:00:00",
          folder: "",
          is_pinned: false,
        });
      })
    );

    seedQueries();

    await useSavedQueryStore.getState().togglePin("q3");

    const q3 = useSavedQueryStore.getState().queries.find((q) => q.id === "q3");
    expect(q3).toBeDefined();
    expect(q3!.is_pinned).toBe(false);
  });

  it("should sort pinned queries to the top", async () => {
    server.use(
      http.patch("/saved-queries/:id/pin", () => {
        return HttpResponse.json({
          id: "q2",
          name: "Query 2",
          query: "SELECT 2",
          created_at: "2025-01-02T00:00:00",
          folder: "",
          is_pinned: true,
        });
      })
    );

    seedQueries();

    // Before: q3 is pinned, q1 and q2 are not
    const before = useSavedQueryStore.getState().queries;
    expect(before[0].id).toBe("q1");
    expect(before[2].id).toBe("q3");

    // Pin q2
    await useSavedQueryStore.getState().togglePin("q2");

    const after = useSavedQueryStore.getState().queries;
    // Pinned queries (q2, q3) should be at top
    const pinnedIds = after.filter((q) => q.is_pinned).map((q) => q.id);
    const unpinnedIds = after.filter((q) => !q.is_pinned).map((q) => q.id);

    expect(pinnedIds).toContain("q2");
    expect(pinnedIds).toContain("q3");
    expect(unpinnedIds).toContain("q1");

    // All pinned should come before unpinned
    const firstUnpinnedIndex = after.findIndex((q) => !q.is_pinned);
    const lastPinnedIndex = after.reduce(
      (max, q, i) => (q.is_pinned ? i : max),
      -1
    );
    expect(lastPinnedIndex).toBeLessThan(firstUnpinnedIndex);
  });

  it("should revert on API failure", async () => {
    server.use(
      http.patch("/saved-queries/:id/pin", () => {
        return HttpResponse.json({ error: "Server error" }, { status: 500 });
      })
    );

    seedQueries();

    // q1 starts unpinned
    expect(
      useSavedQueryStore.getState().queries.find((q) => q.id === "q1")!.is_pinned
    ).toBe(false);

    await useSavedQueryStore.getState().togglePin("q1");

    // Should revert back to unpinned after API failure
    const q1 = useSavedQueryStore.getState().queries.find((q) => q.id === "q1");
    expect(q1).toBeDefined();
    expect(q1!.is_pinned).toBe(false);
  });

  it("should do nothing when query id is not found", async () => {
    seedQueries();
    const beforeCount = useSavedQueryStore.getState().queries.length;

    await useSavedQueryStore.getState().togglePin("nonexistent-id");

    const afterCount = useSavedQueryStore.getState().queries.length;
    expect(afterCount).toBe(beforeCount);
  });
});
