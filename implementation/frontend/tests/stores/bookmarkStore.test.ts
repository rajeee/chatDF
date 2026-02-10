// Tests for bookmarkStore Zustand store
// Covers: addBookmark, removeBookmark, updateBookmark, tag management,
//         searchBookmarks, isBookmarked, getBookmarkByMessageId, edge cases

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useBookmarkStore, Bookmark } from "@/stores/bookmarkStore";

/** Helper to add a bookmark with sensible defaults */
function addTestBookmark(overrides: Partial<Omit<Bookmark, "id" | "createdAt">> = {}) {
  useBookmarkStore.getState().addBookmark({
    messageId: overrides.messageId ?? "msg-1",
    conversationId: overrides.conversationId ?? "conv-1",
    sql: overrides.sql ?? "SELECT * FROM users",
    title: overrides.title ?? "All users",
    tags: overrides.tags ?? [],
    notes: overrides.notes,
  });
}

describe("bookmarkStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useBookmarkStore.setState({ bookmarks: [] });
  });

  describe("addBookmark", () => {
    it("adds a bookmark to an empty store", () => {
      addTestBookmark();
      const { bookmarks } = useBookmarkStore.getState();
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].messageId).toBe("msg-1");
      expect(bookmarks[0].sql).toBe("SELECT * FROM users");
      expect(bookmarks[0].title).toBe("All users");
    });

    it("generates a unique id and createdAt timestamp", () => {
      addTestBookmark();
      const bm = useBookmarkStore.getState().bookmarks[0];
      expect(bm.id).toMatch(/^bm_\d+_[a-z0-9]+$/);
      expect(bm.createdAt).toBeTruthy();
      // createdAt should be a valid ISO date string
      expect(new Date(bm.createdAt).toISOString()).toBe(bm.createdAt);
    });

    it("prepends new bookmarks (most recent first)", () => {
      addTestBookmark({ messageId: "msg-1", title: "First" });
      addTestBookmark({ messageId: "msg-2", title: "Second" });
      const { bookmarks } = useBookmarkStore.getState();
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0].title).toBe("Second");
      expect(bookmarks[1].title).toBe("First");
    });

    it("allows adding bookmarks for different messages in the same conversation", () => {
      addTestBookmark({ messageId: "msg-1", conversationId: "conv-1" });
      addTestBookmark({ messageId: "msg-2", conversationId: "conv-1" });
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(2);
    });

    it("stores optional notes field", () => {
      addTestBookmark({ notes: "Important query for weekly report" });
      const bm = useBookmarkStore.getState().bookmarks[0];
      expect(bm.notes).toBe("Important query for weekly report");
    });
  });

  describe("removeBookmark", () => {
    it("removes a bookmark by id", () => {
      addTestBookmark({ messageId: "msg-1" });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().removeBookmark(id);
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(0);
    });

    it("is a no-op when id does not exist", () => {
      addTestBookmark({ messageId: "msg-1" });
      useBookmarkStore.getState().removeBookmark("nonexistent-id");
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(1);
    });

    it("removes only the targeted bookmark, leaving others intact", () => {
      addTestBookmark({ messageId: "msg-1", title: "First" });
      addTestBookmark({ messageId: "msg-2", title: "Second" });
      const idToRemove = useBookmarkStore.getState().bookmarks.find(
        (b) => b.title === "First"
      )!.id;
      useBookmarkStore.getState().removeBookmark(idToRemove);
      const remaining = useBookmarkStore.getState().bookmarks;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe("Second");
    });
  });

  describe("updateBookmark", () => {
    it("updates the title of a bookmark", () => {
      addTestBookmark({ title: "Old title" });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().updateBookmark(id, { title: "New title" });
      expect(useBookmarkStore.getState().bookmarks[0].title).toBe("New title");
    });

    it("updates notes of a bookmark", () => {
      addTestBookmark();
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().updateBookmark(id, { notes: "Updated notes" });
      expect(useBookmarkStore.getState().bookmarks[0].notes).toBe("Updated notes");
    });

    it("updates tags of a bookmark", () => {
      addTestBookmark({ tags: ["old"] });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().updateBookmark(id, { tags: ["new", "updated"] });
      expect(useBookmarkStore.getState().bookmarks[0].tags).toEqual(["new", "updated"]);
    });

    it("does not modify other fields when updating partially", () => {
      addTestBookmark({ title: "Original", notes: "Original notes", tags: ["tag1"] });
      const bm = useBookmarkStore.getState().bookmarks[0];
      useBookmarkStore.getState().updateBookmark(bm.id, { title: "Changed" });
      const updated = useBookmarkStore.getState().bookmarks[0];
      expect(updated.title).toBe("Changed");
      expect(updated.notes).toBe("Original notes");
      expect(updated.tags).toEqual(["tag1"]);
      expect(updated.sql).toBe("SELECT * FROM users");
    });

    it("is a no-op when id does not match any bookmark", () => {
      addTestBookmark({ title: "Untouched" });
      useBookmarkStore.getState().updateBookmark("bad-id", { title: "Changed" });
      expect(useBookmarkStore.getState().bookmarks[0].title).toBe("Untouched");
    });
  });

  describe("addTag / removeTag", () => {
    it("adds a tag to a bookmark", () => {
      addTestBookmark({ tags: [] });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().addTag(id, "important");
      expect(useBookmarkStore.getState().bookmarks[0].tags).toEqual(["important"]);
    });

    it("does not add a duplicate tag", () => {
      addTestBookmark({ tags: ["important"] });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().addTag(id, "important");
      expect(useBookmarkStore.getState().bookmarks[0].tags).toEqual(["important"]);
    });

    it("adds multiple distinct tags", () => {
      addTestBookmark({ tags: [] });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().addTag(id, "report");
      useBookmarkStore.getState().addTag(id, "weekly");
      expect(useBookmarkStore.getState().bookmarks[0].tags).toEqual(["report", "weekly"]);
    });

    it("removes a tag from a bookmark", () => {
      addTestBookmark({ tags: ["keep", "remove"] });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().removeTag(id, "remove");
      expect(useBookmarkStore.getState().bookmarks[0].tags).toEqual(["keep"]);
    });

    it("is a no-op when removing a tag that does not exist", () => {
      addTestBookmark({ tags: ["existing"] });
      const id = useBookmarkStore.getState().bookmarks[0].id;
      useBookmarkStore.getState().removeTag(id, "nonexistent");
      expect(useBookmarkStore.getState().bookmarks[0].tags).toEqual(["existing"]);
    });
  });

  describe("searchBookmarks", () => {
    beforeEach(() => {
      addTestBookmark({ title: "User analytics", sql: "SELECT * FROM users", tags: ["report"], notes: "Weekly report" });
      addTestBookmark({ title: "Sales totals", sql: "SELECT SUM(amount) FROM sales", tags: ["finance"], notes: "Monthly" });
      addTestBookmark({ title: "Error logs", sql: "SELECT * FROM logs WHERE level='ERROR'", tags: ["debug"] });
    });

    it("returns all bookmarks when query is empty", () => {
      const results = useBookmarkStore.getState().searchBookmarks("");
      expect(results).toHaveLength(3);
    });

    it("returns all bookmarks when query is only whitespace", () => {
      const results = useBookmarkStore.getState().searchBookmarks("   ");
      expect(results).toHaveLength(3);
    });

    it("searches by title (case-insensitive)", () => {
      const results = useBookmarkStore.getState().searchBookmarks("user");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("User analytics");
    });

    it("searches by SQL content", () => {
      const results = useBookmarkStore.getState().searchBookmarks("SUM(amount)");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Sales totals");
    });

    it("searches by notes", () => {
      const results = useBookmarkStore.getState().searchBookmarks("weekly");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("User analytics");
    });

    it("searches by tag", () => {
      const results = useBookmarkStore.getState().searchBookmarks("finance");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Sales totals");
    });

    it("returns empty array when no bookmarks match", () => {
      const results = useBookmarkStore.getState().searchBookmarks("nonexistent_xyz");
      expect(results).toHaveLength(0);
    });
  });

  describe("isBookmarked / getBookmarkByMessageId", () => {
    it("returns true when the message is bookmarked", () => {
      addTestBookmark({ messageId: "msg-42" });
      expect(useBookmarkStore.getState().isBookmarked("msg-42")).toBe(true);
    });

    it("returns false when the message is not bookmarked", () => {
      expect(useBookmarkStore.getState().isBookmarked("msg-99")).toBe(false);
    });

    it("returns the bookmark for a given messageId", () => {
      addTestBookmark({ messageId: "msg-42", title: "Target" });
      const bm = useBookmarkStore.getState().getBookmarkByMessageId("msg-42");
      expect(bm).toBeDefined();
      expect(bm!.title).toBe("Target");
    });

    it("returns undefined for an unknown messageId", () => {
      const bm = useBookmarkStore.getState().getBookmarkByMessageId("unknown");
      expect(bm).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles an initially empty store gracefully", () => {
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(0);
      expect(useBookmarkStore.getState().isBookmarked("any")).toBe(false);
      expect(useBookmarkStore.getState().searchBookmarks("test")).toHaveLength(0);
      expect(useBookmarkStore.getState().getBookmarkByMessageId("any")).toBeUndefined();
    });

    it("generates distinct ids for bookmarks added in rapid succession", () => {
      // Use vi.spyOn to make Date.now return incrementing values
      let counter = 1000;
      const spy = vi.spyOn(Date, "now").mockImplementation(() => counter++);

      addTestBookmark({ messageId: "msg-a" });
      addTestBookmark({ messageId: "msg-b" });
      addTestBookmark({ messageId: "msg-c" });

      const ids = useBookmarkStore.getState().bookmarks.map((b) => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);

      spy.mockRestore();
    });

    it("allows bookmarking the same messageId twice (no dedup enforcement in store)", () => {
      addTestBookmark({ messageId: "msg-dup" });
      addTestBookmark({ messageId: "msg-dup" });
      // The store does not deduplicate; both bookmarks coexist
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(2);
    });
  });
});
