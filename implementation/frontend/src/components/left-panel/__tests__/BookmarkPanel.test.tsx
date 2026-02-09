import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookmarkPanel } from "../BookmarkPanel";
import { useBookmarkStore } from "@/stores/bookmarkStore";

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
        sql: "SELECT * FROM users WHERE active = true",
        title: "Active users query",
        tags: ["users", "active"],
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
        notes: "Daily report query",
      },
      {
        id: "bm-3",
        messageId: "msg-3",
        conversationId: "conv-2",
        sql: "SELECT name FROM products",
        title: "Product names",
        tags: [],
        createdAt: "2025-06-03T00:00:00Z",
      },
    ],
  });
}

describe("BookmarkPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  it("shows empty state when no bookmarks", () => {
    render(<BookmarkPanel />);
    expect(screen.getByText("No bookmarks yet. Bookmark a query from the chat.")).toBeInTheDocument();
  });

  it("renders bookmark items when bookmarks exist", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
    expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
    expect(screen.getByTestId("bookmark-item-bm-3")).toBeInTheDocument();
  });

  it("shows bookmark count", () => {
    seedBookmarks();
    render(<BookmarkPanel />);
    expect(screen.getByText("Bookmarks (3)")).toBeInTheDocument();
  });

  it("displays bookmark titles", () => {
    seedBookmarks();
    render(<BookmarkPanel />);
    expect(screen.getByText("Active users query")).toBeInTheDocument();
    expect(screen.getByText("Order count")).toBeInTheDocument();
    expect(screen.getByText("Product names")).toBeInTheDocument();
  });

  it("displays tags as chips", () => {
    seedBookmarks();
    render(<BookmarkPanel />);
    expect(screen.getByTestId("bookmark-tag-bm-1-users")).toBeInTheDocument();
    expect(screen.getByTestId("bookmark-tag-bm-1-active")).toBeInTheDocument();
    expect(screen.getByTestId("bookmark-tag-bm-2-orders")).toBeInTheDocument();
  });

  it("filters bookmarks with search", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    const searchInput = screen.getByTestId("bookmark-search");
    fireEvent.change(searchInput, { target: { value: "order" } });

    // Only "Order count" should show
    expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();
    expect(screen.queryByTestId("bookmark-item-bm-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bookmark-item-bm-3")).not.toBeInTheDocument();
  });

  it("shows no matching bookmarks message when search has no results", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    const searchInput = screen.getByTestId("bookmark-search");
    fireEvent.change(searchInput, { target: { value: "zzz_no_match" } });

    expect(screen.getByText("No matching bookmarks")).toBeInTheDocument();
  });

  it("filters by tag search", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    const searchInput = screen.getByTestId("bookmark-search");
    fireEvent.change(searchInput, { target: { value: "active" } });

    expect(screen.getByTestId("bookmark-item-bm-1")).toBeInTheDocument();
    expect(screen.queryByTestId("bookmark-item-bm-2")).not.toBeInTheDocument();
  });

  it("deletes a bookmark with confirm flow", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    const deleteBtn = screen.getByTestId("bookmark-delete-bm-2");

    // First click - confirmation
    fireEvent.click(deleteBtn);
    expect(screen.getByTestId("bookmark-item-bm-2")).toBeInTheDocument();

    // Second click - actually deletes
    fireEvent.click(deleteBtn);
    expect(screen.queryByTestId("bookmark-item-bm-2")).not.toBeInTheDocument();
    expect(useBookmarkStore.getState().bookmarks).toHaveLength(2);
  });

  it("expands bookmark to show full SQL on click", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    // Click to expand bm-1
    const bookmarkItem = screen.getByTestId("bookmark-item-bm-1");
    const expandArea = bookmarkItem.querySelector(".cursor-pointer");
    expect(expandArea).toBeTruthy();
    fireEvent.click(expandArea!);

    // Should show the full SQL in a pre element
    const preElements = bookmarkItem.querySelectorAll("pre");
    const sqlPre = Array.from(preElements).find(
      (el) => el.textContent?.includes("SELECT * FROM users WHERE active = true")
    );
    expect(sqlPre).toBeTruthy();
  });

  it("can add a tag to a bookmark", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    // First expand the bookmark
    const bookmarkItem = screen.getByTestId("bookmark-item-bm-3");
    const expandArea = bookmarkItem.querySelector(".cursor-pointer");
    fireEvent.click(expandArea!);

    const tagInput = screen.getByTestId("bookmark-tag-input-bm-3");
    const addBtn = screen.getByTestId("bookmark-add-tag-bm-3");

    fireEvent.change(tagInput, { target: { value: "products" } });
    fireEvent.click(addBtn);

    const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-3");
    expect(bm?.tags).toContain("products");
  });

  it("can remove a tag from a bookmark", () => {
    seedBookmarks();
    render(<BookmarkPanel />);

    const tagChip = screen.getByTestId("bookmark-tag-bm-1-users");
    const removeBtn = tagChip.querySelector("button");
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn!);

    const bm = useBookmarkStore.getState().bookmarks.find((b) => b.id === "bm-1");
    expect(bm?.tags).not.toContain("users");
    expect(bm?.tags).toContain("active");
  });
});
