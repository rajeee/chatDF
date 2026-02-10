import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookmarkPanel } from "../BookmarkPanel";
import { useBookmarkStore, type Bookmark } from "@/stores/bookmarkStore";

function resetStore() {
  useBookmarkStore.setState({ bookmarks: [] });
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "bm-1",
    messageId: "msg-1",
    conversationId: "conv-1",
    sql: "SELECT * FROM users WHERE active = true",
    title: "Active users query",
    tags: ["users", "active"],
    createdAt: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

function seedBookmarks() {
  useBookmarkStore.setState({
    bookmarks: [
      makeBookmark({
        id: "bm-1",
        messageId: "msg-1",
        sql: "SELECT * FROM users WHERE active = true",
        title: "Active users query",
        tags: ["users", "active"],
        createdAt: "2025-06-01T00:00:00Z",
      }),
      makeBookmark({
        id: "bm-2",
        messageId: "msg-2",
        sql: "SELECT COUNT(*) FROM orders",
        title: "Order count",
        tags: ["orders"],
        createdAt: "2025-06-02T00:00:00Z",
        notes: "Daily report query",
      }),
      makeBookmark({
        id: "bm-3",
        messageId: "msg-3",
        conversationId: "conv-2",
        sql: "SELECT name FROM products",
        title: "Product names",
        tags: [],
        createdAt: "2025-06-03T00:00:00Z",
      }),
    ],
  });
}

describe("BookmarkPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  // ──────────────────────────────────────────────
  // Empty state
  // ──────────────────────────────────────────────

  describe("empty state", () => {
    it("shows empty state message when no bookmarks", () => {
      render(<BookmarkPanel />);
      expect(
        screen.getByText("No bookmarks yet. Bookmark a query from the chat.")
      ).toBeInTheDocument();
    });

    it("shows count of zero in header", () => {
      render(<BookmarkPanel />);
      expect(screen.getByText("Bookmarks (0)")).toBeInTheDocument();
    });

    it("does not show search input when no bookmarks", () => {
      render(<BookmarkPanel />);
      expect(screen.queryByTestId("bookmark-search")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // Rendering bookmark list
  // ──────────────────────────────────────────────

  describe("rendering bookmark list", () => {
    it("renders bookmark items when bookmarks exist", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-item-bm-3")).toBeInTheDocument();
    });

    it("shows bookmark count in header", () => {
      seedBookmarks();
      render(<BookmarkPanel />);
      expect(screen.getByText("Bookmarks (3)")).toBeInTheDocument();
    });

    it("displays all bookmark titles", () => {
      seedBookmarks();
      render(<BookmarkPanel />);
      expect(screen.getByText("Active users query")).toBeInTheDocument();
      expect(screen.getByText("Order count")).toBeInTheDocument();
      expect(screen.getByText("Product names")).toBeInTheDocument();
    });

    it("displays tags as chips with remove buttons", () => {
      seedBookmarks();
      render(<BookmarkPanel />);
      const usersTag = screen.getByTestId("bookmark-tag-bm-1-users");
      expect(usersTag).toHaveTextContent("users");
      expect(usersTag.querySelector("button")).toBeTruthy();

      expect(screen.getByTestId("bookmark-tag-bm-1-active")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-tag-bm-2-orders")).toBeInTheDocument();
    });

    it("shows search input only when bookmarks exist", () => {
      seedBookmarks();
      render(<BookmarkPanel />);
      expect(screen.getByTestId("bookmark-search")).toBeInTheDocument();
    });

    it("renders the bookmark-panel test id on root container", () => {
      render(<BookmarkPanel />);
      expect(screen.getByTestId("bookmark-panel")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // SQL truncation
  // ──────────────────────────────────────────────

  describe("SQL truncation in collapsed view", () => {
    it("truncates long SQL to 80 characters with ellipsis", () => {
      const longSql = "SELECT very_long_column_name_a, very_long_column_name_b, very_long_column_name_c FROM a_very_long_table_name WHERE condition = true";
      useBookmarkStore.setState({
        bookmarks: [makeBookmark({ id: "bm-long", sql: longSql })],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-long");
      // The truncated text should be the first 80 chars + "..."
      const truncated = longSql.slice(0, 80) + "...";
      expect(item.textContent).toContain(truncated);
    });

    it("does not truncate short SQL", () => {
      const shortSql = "SELECT 1";
      useBookmarkStore.setState({
        bookmarks: [makeBookmark({ id: "bm-short", sql: shortSql })],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-short");
      expect(item.textContent).toContain(shortSql);
      expect(item.textContent).not.toContain(shortSql + "...");
    });
  });

  // ──────────────────────────────────────────────
  // Search / filter
  // ──────────────────────────────────────────────

  describe("search and filter", () => {
    it("filters bookmarks by title (case insensitive)", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "order" } });

      expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-item-bm-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-item-bm-3")).not.toBeInTheDocument();
    });

    it("filters bookmarks by tag content", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "active" } });

      expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-item-bm-2")).not.toBeInTheDocument();
    });

    it("filters bookmarks by SQL content", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "products" } });

      // bm-3 has SQL "SELECT name FROM products"
      expect(screen.getByTestId("bookmark-item-bm-3")).toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-item-bm-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-item-bm-2")).not.toBeInTheDocument();
    });

    it("filters bookmarks by notes content", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "daily report" } });

      // bm-2 has notes "Daily report query"
      expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-item-bm-1")).not.toBeInTheDocument();
    });

    it("shows 'No matching bookmarks' when search has no results", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "zzz_no_match" } });

      expect(screen.getByText("No matching bookmarks")).toBeInTheDocument();
    });

    it("shows all bookmarks again when search is cleared", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "order" } });
      expect(screen.queryByTestId("bookmark-item-bm-1")).not.toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: "" } });
      expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-item-bm-3")).toBeInTheDocument();
    });

    it("search is case-insensitive", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const searchInput = screen.getByTestId("bookmark-search");
      fireEvent.change(searchInput, { target: { value: "ACTIVE USERS" } });

      expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // Delete with confirmation
  // ──────────────────────────────────────────────

  describe("delete bookmark with confirmation", () => {
    it("first click enters confirm state, second click deletes", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const deleteBtn = screen.getByTestId("bookmark-delete-bm-2");

      // First click: enters confirmation mode
      fireEvent.click(deleteBtn);
      expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
      expect(deleteBtn).toHaveAttribute("aria-label", "Confirm delete");
      expect(deleteBtn).toHaveAttribute("title", "Click again to confirm");

      // Second click: actually deletes
      fireEvent.click(deleteBtn);
      expect(screen.queryByTestId("bookmark-item-bm-2")).not.toBeInTheDocument();
      expect(useBookmarkStore.getState().bookmarks).toHaveLength(2);
    });

    it("delete button initially has Delete bookmark aria-label", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const deleteBtn = screen.getByTestId("bookmark-delete-bm-1");
      expect(deleteBtn).toHaveAttribute("aria-label", "Delete bookmark");
      expect(deleteBtn).toHaveAttribute("title", "Delete bookmark");
    });

    it("confirmation resets after 2 seconds timeout", () => {
      vi.useFakeTimers();
      seedBookmarks();
      render(<BookmarkPanel />);

      const deleteBtn = screen.getByTestId("bookmark-delete-bm-1");

      // First click: enter confirm mode
      fireEvent.click(deleteBtn);
      expect(deleteBtn).toHaveAttribute("aria-label", "Confirm delete");

      // Advance 2 seconds - confirmation should auto-reset
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(deleteBtn).toHaveAttribute("aria-label", "Delete bookmark");

      // Clicking now should be first click again (confirm), not delete
      fireEvent.click(deleteBtn);
      expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
      expect(deleteBtn).toHaveAttribute("aria-label", "Confirm delete");

      vi.useRealTimers();
    });

    it("removes the correct bookmark from the store", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const deleteBtn = screen.getByTestId("bookmark-delete-bm-1");
      fireEvent.click(deleteBtn); // confirm
      fireEvent.click(deleteBtn); // delete

      const remaining = useBookmarkStore.getState().bookmarks;
      expect(remaining).toHaveLength(2);
      expect(remaining.find((b) => b.id === "bm-1")).toBeUndefined();
      expect(remaining.find((b) => b.id === "bm-2")).toBeDefined();
      expect(remaining.find((b) => b.id === "bm-3")).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // Inline title editing
  // ──────────────────────────────────────────────

  describe("inline title editing", () => {
    it("double-clicking title switches to input field", async () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Active users query");
      expect(titleSpan.getAttribute("title")).toBe("Double-click to rename");

      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-1");
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Active users query");
    });

    it("submitting title via Enter updates the store", async () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Active users query");
      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-1");
      fireEvent.change(input, { target: { value: "Renamed query" } });
      fireEvent.keyDown(input, { key: "Enter" });

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.title).toBe("Renamed query");

      // Should exit editing mode - no more input
      expect(screen.queryByTestId("bookmark-title-input-bm-1")).not.toBeInTheDocument();
      expect(screen.getByText("Renamed query")).toBeInTheDocument();
    });

    it("submitting title via blur updates the store", async () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Order count");
      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-2");
      fireEvent.change(input, { target: { value: "Total orders" } });
      fireEvent.blur(input);

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-2");
      expect(bm?.title).toBe("Total orders");
      expect(screen.queryByTestId("bookmark-title-input-bm-2")).not.toBeInTheDocument();
    });

    it("pressing Escape cancels editing and reverts title", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Active users query");
      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-1");
      fireEvent.change(input, { target: { value: "Changed title" } });
      fireEvent.keyDown(input, { key: "Escape" });

      // Should revert to original title
      expect(screen.queryByTestId("bookmark-title-input-bm-1")).not.toBeInTheDocument();
      expect(screen.getByText("Active users query")).toBeInTheDocument();

      // Store should NOT have changed
      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.title).toBe("Active users query");
    });

    it("does not update store if title is unchanged", () => {
      seedBookmarks();
      const updateSpy = vi.spyOn(useBookmarkStore.getState(), "updateBookmark");
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Active users query");
      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-1");
      // Do not change the value, just submit
      fireEvent.keyDown(input, { key: "Enter" });

      // updateBookmark should not have been called since title didn't change
      // (We can verify via the store)
      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.title).toBe("Active users query");
      updateSpy.mockRestore();
    });

    it("does not update store if title is trimmed to empty", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Active users query");
      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-1");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.keyDown(input, { key: "Enter" });

      // Title should remain unchanged
      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.title).toBe("Active users query");
    });

    it("clicking the input does not toggle expand/collapse", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const titleSpan = screen.getByText("Active users query");
      fireEvent.doubleClick(titleSpan);

      const input = screen.getByTestId("bookmark-title-input-bm-1");
      // Clicking the input should stopPropagation (not toggle expand)
      fireEvent.click(input);

      // Input should still be there (not collapsed away)
      expect(screen.getByTestId("bookmark-title-input-bm-1")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // Expand / collapse SQL preview
  // ──────────────────────────────────────────────

  describe("expand/collapse SQL preview", () => {
    it("clicking the bookmark row toggles expanded state", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-1");
      const expandArea = bookmarkItem.querySelector(".cursor-pointer")!;

      // Initially collapsed - the expanded section has maxHeight: 0
      const expandedSection = bookmarkItem.querySelector("pre");
      // Pre exists in DOM but inside hidden container
      // Click to expand
      fireEvent.click(expandArea);

      // Now should show the tag input area (part of expanded content)
      expect(screen.getByTestId("bookmark-tag-input-bm-1")).toBeInTheDocument();

      // Click again to collapse
      fireEvent.click(expandArea);

      // Tag input should still be in DOM but container has maxHeight: 0
      // We verify the toggle works by checking the chevron rotation class
      const chevron = expandArea.querySelector("svg");
      expect(chevron?.classList.contains("rotate-90")).toBe(false);
    });

    it("expanded bookmark shows full SQL in a pre element", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-1");
      const expandArea = bookmarkItem.querySelector(".cursor-pointer")!;
      fireEvent.click(expandArea);

      const preElements = bookmarkItem.querySelectorAll("pre");
      const sqlPre = Array.from(preElements).find((el) =>
        el.textContent?.includes("SELECT * FROM users WHERE active = true")
      );
      expect(sqlPre).toBeTruthy();
    });

    it("expanded bookmark shows tag input and Add button", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
      const expandArea = bookmarkItem.querySelector(".cursor-pointer")!;
      fireEvent.click(expandArea);

      expect(screen.getByTestId("bookmark-tag-input-bm-3")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-add-tag-bm-3")).toBeInTheDocument();
    });

    it("chevron rotates when expanded", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-1");
      const expandArea = bookmarkItem.querySelector(".cursor-pointer")!;
      const chevron = expandArea.querySelector("svg")!;

      expect(chevron.classList.contains("rotate-90")).toBe(false);

      fireEvent.click(expandArea);
      expect(chevron.classList.contains("rotate-90")).toBe(true);

      fireEvent.click(expandArea);
      expect(chevron.classList.contains("rotate-90")).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Tag management
  // ──────────────────────────────────────────────

  describe("tag management", () => {
    it("adds a tag via the Add button", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      // Expand bm-3 (no tags)
      const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
      fireEvent.click(bookmarkItem.querySelector(".cursor-pointer")!);

      const tagInput = screen.getByTestId("bookmark-tag-input-bm-3");
      const addBtn = screen.getByTestId("bookmark-add-tag-bm-3");

      fireEvent.change(tagInput, { target: { value: "new-tag" } });
      fireEvent.click(addBtn);

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-3");
      expect(bm?.tags).toContain("new-tag");
    });

    it("adds a tag via Enter key in the tag input", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
      fireEvent.click(bookmarkItem.querySelector(".cursor-pointer")!);

      const tagInput = screen.getByTestId("bookmark-tag-input-bm-3");

      fireEvent.change(tagInput, { target: { value: "enter-tag" } });
      fireEvent.keyDown(tagInput, { key: "Enter" });

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-3");
      expect(bm?.tags).toContain("enter-tag");
    });

    it("clears the tag input after adding", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
      fireEvent.click(bookmarkItem.querySelector(".cursor-pointer")!);

      const tagInput = screen.getByTestId("bookmark-tag-input-bm-3");
      const addBtn = screen.getByTestId("bookmark-add-tag-bm-3");

      fireEvent.change(tagInput, { target: { value: "cleared" } });
      fireEvent.click(addBtn);

      expect(tagInput).toHaveValue("");
    });

    it("does not add empty or whitespace-only tag", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
      fireEvent.click(bookmarkItem.querySelector(".cursor-pointer")!);

      const tagInput = screen.getByTestId("bookmark-tag-input-bm-3");
      const addBtn = screen.getByTestId("bookmark-add-tag-bm-3");

      // Empty string
      fireEvent.change(tagInput, { target: { value: "" } });
      fireEvent.click(addBtn);

      let bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-3");
      expect(bm?.tags).toHaveLength(0);

      // Whitespace only
      fireEvent.change(tagInput, { target: { value: "   " } });
      fireEvent.click(addBtn);

      bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-3");
      expect(bm?.tags).toHaveLength(0);
    });

    it("does not add duplicate tag", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-1");
      fireEvent.click(bookmarkItem.querySelector(".cursor-pointer")!);

      const tagInput = screen.getByTestId("bookmark-tag-input-bm-1");
      const addBtn = screen.getByTestId("bookmark-add-tag-bm-1");

      // Try to add "users" which already exists
      fireEvent.change(tagInput, { target: { value: "users" } });
      fireEvent.click(addBtn);

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      // Should still have exactly 2 tags, not 3
      expect(bm?.tags).toHaveLength(2);
      expect(bm?.tags?.filter((t) => t === "users")).toHaveLength(1);
    });

    it("pressing Escape in tag input clears it", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
      fireEvent.click(bookmarkItem.querySelector(".cursor-pointer")!);

      const tagInput = screen.getByTestId("bookmark-tag-input-bm-3");
      fireEvent.change(tagInput, { target: { value: "discard-me" } });
      fireEvent.keyDown(tagInput, { key: "Escape" });

      expect(tagInput).toHaveValue("");
    });

    it("removes a tag by clicking the X button on a tag chip", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const tagChip = screen.getByTestId("bookmark-tag-bm-1-users");
      const removeBtn = tagChip.querySelector("button")!;
      expect(removeBtn).toHaveAttribute("aria-label", "Remove tag users");

      fireEvent.click(removeBtn);

      const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm?.tags).not.toContain("users");
      expect(bm?.tags).toContain("active");
    });

    it("removing a tag does not affect other bookmarks", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const tagChip = screen.getByTestId("bookmark-tag-bm-2-orders");
      fireEvent.click(tagChip.querySelector("button")!);

      // bm-2 should have no tags
      const bm2 = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-2");
      expect(bm2?.tags).toHaveLength(0);

      // bm-1 should still have its tags
      const bm1 = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
      expect(bm1?.tags).toContain("users");
      expect(bm1?.tags).toContain("active");
    });

    it("tag chip shows the tag text", () => {
      seedBookmarks();
      render(<BookmarkPanel />);

      const tagChip = screen.getByTestId("bookmark-tag-bm-1-active");
      expect(tagChip).toHaveTextContent("active");
    });
  });

  // ──────────────────────────────────────────────
  // Date formatting
  // ──────────────────────────────────────────────

  describe("date formatting", () => {
    it("shows 'just now' for recent bookmarks", () => {
      useBookmarkStore.setState({
        bookmarks: [
          makeBookmark({
            id: "bm-recent",
            createdAt: new Date().toISOString(),
          }),
        ],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-recent");
      expect(item.textContent).toContain("just now");
    });

    it("shows minutes ago for bookmarks created minutes ago", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      useBookmarkStore.setState({
        bookmarks: [
          makeBookmark({ id: "bm-min", createdAt: fiveMinAgo }),
        ],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-min");
      expect(item.textContent).toContain("5m ago");
    });

    it("shows hours ago for bookmarks created hours ago", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();
      useBookmarkStore.setState({
        bookmarks: [
          makeBookmark({ id: "bm-hr", createdAt: threeHoursAgo }),
        ],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-hr");
      expect(item.textContent).toContain("3h ago");
    });

    it("shows days ago for bookmarks created days ago", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
      useBookmarkStore.setState({
        bookmarks: [
          makeBookmark({ id: "bm-day", createdAt: twoDaysAgo }),
        ],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-day");
      expect(item.textContent).toContain("2d ago");
    });

    it("shows locale date string for bookmarks older than a week", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000);
      useBookmarkStore.setState({
        bookmarks: [
          makeBookmark({
            id: "bm-old",
            createdAt: twoWeeksAgo.toISOString(),
          }),
        ],
      });
      render(<BookmarkPanel />);

      const item = screen.getByTestId("bookmark-item-bm-old");
      // Should contain the locale date format
      expect(item.textContent).toContain(twoWeeksAgo.toLocaleDateString());
    });
  });

  // ──────────────────────────────────────────────
  // Single bookmark edge case
  // ──────────────────────────────────────────────

  describe("single bookmark", () => {
    it("renders correctly with a single bookmark", () => {
      useBookmarkStore.setState({
        bookmarks: [makeBookmark({ id: "bm-only" })],
      });
      render(<BookmarkPanel />);

      expect(screen.getByText("Bookmarks (1)")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-item-bm-only")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-search")).toBeInTheDocument();
    });

    it("deleting the only bookmark returns to empty state", () => {
      useBookmarkStore.setState({
        bookmarks: [makeBookmark({ id: "bm-only" })],
      });
      render(<BookmarkPanel />);

      const deleteBtn = screen.getByTestId("bookmark-delete-bm-only");
      fireEvent.click(deleteBtn); // confirm
      fireEvent.click(deleteBtn); // delete

      expect(
        screen.getByText("No bookmarks yet. Bookmark a query from the chat.")
      ).toBeInTheDocument();
      expect(screen.getByText("Bookmarks (0)")).toBeInTheDocument();
      expect(screen.queryByTestId("bookmark-search")).not.toBeInTheDocument();
    });
  });
});
