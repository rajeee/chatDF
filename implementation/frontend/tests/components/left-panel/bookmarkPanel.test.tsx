// Tests for BookmarkPanel component
// Covers: empty state, bookmark rendering, search, expand/collapse, tags, delete

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  act,
} from "../../helpers/render";
import { useBookmarkStore, type Bookmark } from "@/stores/bookmarkStore";
import { BookmarkPanel } from "@/components/left-panel/BookmarkPanel";

function seedBookmark(
  overrides: Partial<Omit<Bookmark, "id" | "createdAt">> = {}
): Bookmark {
  const store = useBookmarkStore.getState();
  store.addBookmark({
    messageId: overrides.messageId ?? "msg-1",
    conversationId: overrides.conversationId ?? "conv-1",
    sql: overrides.sql ?? "SELECT * FROM users",
    title: overrides.title ?? "All Users",
    tags: overrides.tags ?? [],
    ...overrides,
  });
  // addBookmark prepends, so the latest is at index 0
  return useBookmarkStore.getState().bookmarks[0];
}

beforeEach(() => {
  useBookmarkStore.setState({ bookmarks: [] });
});

afterEach(async () => {
  // Flush pending timers (delete confirmation has 2000ms setTimeout)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2100));
  });
});

// ---------------------------------------------------------------------------
// BM-1: Empty state
// ---------------------------------------------------------------------------

describe("BM-1: Empty state", () => {
  it("shows empty message when no bookmarks", () => {
    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByText(/No bookmarks yet/)).toBeInTheDocument();
  });

  it("shows count of zero in header", () => {
    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByText("Bookmarks (0)")).toBeInTheDocument();
  });

  it("does not show search input when empty", () => {
    renderWithProviders(<BookmarkPanel />);
    expect(screen.queryByTestId("bookmark-search")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BM-2: Bookmark rendering
// ---------------------------------------------------------------------------

describe("BM-2: Bookmark rendering", () => {
  it("shows bookmark count in header", () => {
    seedBookmark({ title: "Query 1", messageId: "m1" });
    seedBookmark({ title: "Query 2", messageId: "m2" });

    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByText("Bookmarks (2)")).toBeInTheDocument();
  });

  it("renders bookmark items with test ids", () => {
    const bm = seedBookmark();

    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByTestId(`bookmark-item-${bm.id}`)).toBeInTheDocument();
  });

  it("shows bookmark title", () => {
    seedBookmark({ title: "Top Sales" });

    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByText("Top Sales")).toBeInTheDocument();
  });

  it("truncates long SQL in preview", () => {
    const longSql = "SELECT " + "column_name, ".repeat(10) + "id FROM table";
    seedBookmark({ sql: longSql });

    renderWithProviders(<BookmarkPanel />);
    // truncateSql cuts at 80 chars + "..."
    const truncated = screen.getByText(/\.\.\./);
    expect(truncated).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BM-3: Search
// ---------------------------------------------------------------------------

describe("BM-3: Search", () => {
  it("shows search input when bookmarks exist", () => {
    seedBookmark();

    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByTestId("bookmark-search")).toBeInTheDocument();
  });

  it("filters bookmarks by title", async () => {
    seedBookmark({ title: "Sales Report", messageId: "m1" });
    seedBookmark({ title: "User Stats", messageId: "m2" });

    const user = userEvent.setup();
    renderWithProviders(<BookmarkPanel />);

    await user.type(screen.getByTestId("bookmark-search"), "Sales");

    expect(screen.getByText("Sales Report")).toBeInTheDocument();
    expect(screen.queryByText("User Stats")).not.toBeInTheDocument();
  });

  it("shows no matching message when nothing found", async () => {
    seedBookmark({ title: "Sales Report" });

    const user = userEvent.setup();
    renderWithProviders(<BookmarkPanel />);

    await user.type(screen.getByTestId("bookmark-search"), "nonexistent");

    expect(screen.getByText("No matching bookmarks")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BM-4: Expand/Collapse
// ---------------------------------------------------------------------------

describe("BM-4: Expand/Collapse", () => {
  it("shows full SQL in pre element when expanded", async () => {
    const sql = "SELECT id, name FROM users WHERE active = true";
    const bm = seedBookmark({ sql });

    const user = userEvent.setup();
    renderWithProviders(<BookmarkPanel />);

    const item = screen.getByTestId(`bookmark-item-${bm.id}`);
    await user.click(item);

    const pre = item.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe(sql);
  });
});

// ---------------------------------------------------------------------------
// BM-5: Tags
// ---------------------------------------------------------------------------

describe("BM-5: Tags", () => {
  it("shows tags on bookmark items", () => {
    seedBookmark({ tags: ["important", "sales"] });

    renderWithProviders(<BookmarkPanel />);

    expect(screen.getByText("important")).toBeInTheDocument();
    expect(screen.getByText("sales")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BM-6: Delete
// ---------------------------------------------------------------------------

describe("BM-6: Delete", () => {
  it("has delete button", () => {
    const bm = seedBookmark();

    renderWithProviders(<BookmarkPanel />);
    expect(screen.getByTestId(`bookmark-delete-${bm.id}`)).toBeInTheDocument();
  });

  it("first click shows confirmation label", async () => {
    const bm = seedBookmark();

    const user = userEvent.setup();
    renderWithProviders(<BookmarkPanel />);

    const deleteBtn = screen.getByTestId(`bookmark-delete-${bm.id}`);
    await user.click(deleteBtn);

    expect(deleteBtn).toHaveAttribute("aria-label", "Confirm delete");
  });

  it("second click removes bookmark", async () => {
    const bm = seedBookmark();

    const user = userEvent.setup();
    renderWithProviders(<BookmarkPanel />);

    const deleteBtn = screen.getByTestId(`bookmark-delete-${bm.id}`);
    await user.click(deleteBtn);
    expect(useBookmarkStore.getState().bookmarks).toHaveLength(1);

    await user.click(deleteBtn);
    expect(useBookmarkStore.getState().bookmarks).toHaveLength(0);
  });
});
