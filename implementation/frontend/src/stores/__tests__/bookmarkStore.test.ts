import { describe, it, expect, beforeEach } from "vitest";
import { useBookmarkStore } from "../bookmarkStore";

function resetStore() {
  useBookmarkStore.setState({ bookmarks: [] });
}

function seedBookmarks() {
  useBookmarkStore.setState({
    bookmarks: [
      {
        id: "bm-1",
        messageId: "msg-1",
        conversationId: "conv-1",
        sql: "SELECT * FROM users",
        title: "All users query",
        tags: ["users", "important"],
        createdAt: "2025-06-01T00:00:00Z",
      },
      {
        id: "bm-2",
        messageId: "msg-2",
        conversationId: "conv-1",
        sql: "SELECT COUNT(*) FROM orders",
        title: "Order count",
        tags: ["orders"],
        createdAt: "2025-06-02T00:00:00Z",
      },
      {
        id: "bm-3",
        messageId: "msg-3",
        conversationId: "conv-2",
        sql: "SELECT name, email FROM contacts WHERE active = true",
        title: "Active contacts",
        tags: [],
        createdAt: "2025-06-03T00:00:00Z",
        notes: "Used for weekly report",
      },
    ],
  });
}

describe("bookmarkStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("has empty bookmarks array", () => {
      expect(useBookmarkStore.getState().bookmarks).toEqual([]);
    });
  });

  describe("addBookmark", () => {
    it("adds a bookmark with auto-generated id and createdAt", () => {
      useBookmarkStore.getState().addBookmark({
        messageId: "msg-1",
        conversationId: "conv-1",
        sql: "SELECT 1",
        title: "Test query",
        tags: [],
      });

      const bookmarks = useBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].messageId).toBe("msg-1");
      expect(bookmarks[0].sql).toBe("SELECT 1");
      expect(bookmarks[0].title).toBe("Test query");
      expect(bookmarks[0].id).toMatch(/^bm_/);
      expect(bookmarks[0].createdAt).toBeTruthy();
    });

    it("prepends new bookmarks (newest first)", () => {
      useBookmarkStore.getState().addBookmark({
        messageId: "msg-1",
        conversationId: "conv-1",
        sql: "SELECT 1",
        title: "First",
        tags: [],
      });
      useBookmarkStore.getState().addBookmark({
        messageId: "msg-2",
        conversationId: "conv-1",
        sql: "SELECT 2",
        title: "Second",
        tags: [],
      });

      const bookmarks = useBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0].title).toBe("Second");
      expect(bookmarks[1].title).toBe("First");
    });

    it("adds bookmark with tags", () => {
      useBookmarkStore.getState().addBookmark({
        messageId: "msg-1",
        conversationId: "conv-1",
        sql: "SELECT 1",
        title: "Tagged query",
        tags: ["analytics", "daily"],
      });

      const bookmarks = useBookmarkStore.getState().bookmarks;
      expect(bookmarks[0].tags).toEqual(["analytics", "daily"]);
    });
  });

  describe("removeBookmark", () => {
    it("removes a bookmark by id", () => {
      seedBookmarks();
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(3);

      useBookmarkStore.getState().removeBookmark("bm-2");

      const bookmarks = useBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks.find((b) => b.id === "bm-2")).toBeUndefined();
    });

    it("does nothing when id is not found", () => {
      seedBookmarks();
      useBookmarkStore.getState().removeBookmark("nonexistent");
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(3);
    });
  });

  describe("updateBookmark", () => {
    it("updates title", () => {
      seedBookmarks();
      useBookmarkStore.getState().updateBookmark("bm-1", { title: "Updated title" });

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.title).toBe("Updated title");
    });

    it("updates notes", () => {
      seedBookmarks();
      useBookmarkStore.getState().updateBookmark("bm-1", { notes: "Some notes" });

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.notes).toBe("Some notes");
    });

    it("updates tags", () => {
      seedBookmarks();
      useBookmarkStore.getState().updateBookmark("bm-1", { tags: ["new-tag"] });

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.tags).toEqual(["new-tag"]);
    });

    it("does not change other bookmarks", () => {
      seedBookmarks();
      useBookmarkStore.getState().updateBookmark("bm-1", { title: "Changed" });

      const bm2 = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-2");
      expect(bm2?.title).toBe("Order count");
    });
  });

  describe("addTag", () => {
    it("adds a tag to a bookmark", () => {
      seedBookmarks();
      useBookmarkStore.getState().addTag("bm-3", "weekly");

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-3");
      expect(bm?.tags).toContain("weekly");
    });

    it("does not add duplicate tags", () => {
      seedBookmarks();
      useBookmarkStore.getState().addTag("bm-1", "users");

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.tags.filter((t) => t === "users")).toHaveLength(1);
    });
  });

  describe("removeTag", () => {
    it("removes a tag from a bookmark", () => {
      seedBookmarks();
      useBookmarkStore.getState().removeTag("bm-1", "important");

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.tags).toEqual(["users"]);
    });

    it("does nothing when tag is not present", () => {
      seedBookmarks();
      useBookmarkStore.getState().removeTag("bm-1", "nonexistent");

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.tags).toEqual(["users", "important"]);
    });
  });

  describe("searchBookmarks", () => {
    it("returns all bookmarks when query is empty", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("");
      expect(results).toHaveLength(3);
    });

    it("matches against title", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("order count");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("bm-2");
    });

    it("matches against SQL", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("contacts");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("bm-3");
    });

    it("matches against tags", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("important");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("bm-1");
    });

    it("matches against notes", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("weekly report");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("bm-3");
    });

    it("is case insensitive", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("ALL USERS");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("bm-1");
    });

    it("returns empty array when no matches", () => {
      seedBookmarks();
      const results = useBookmarkStore.getState().searchBookmarks("zzz_no_match");
      expect(results).toHaveLength(0);
    });
  });

  describe("isBookmarked", () => {
    it("returns true for bookmarked message", () => {
      seedBookmarks();
      expect(useBookmarkStore.getState().isBookmarked("msg-1")).toBe(true);
    });

    it("returns false for non-bookmarked message", () => {
      seedBookmarks();
      expect(useBookmarkStore.getState().isBookmarked("msg-999")).toBe(false);
    });
  });

  describe("getBookmarkByMessageId", () => {
    it("returns the bookmark for a given messageId", () => {
      seedBookmarks();
      const bm = useBookmarkStore.getState().getBookmarkByMessageId("msg-2");
      expect(bm?.id).toBe("bm-2");
    });

    it("returns undefined for non-bookmarked message", () => {
      seedBookmarks();
      const bm = useBookmarkStore.getState().getBookmarkByMessageId("msg-999");
      expect(bm).toBeUndefined();
    });
  });
});
