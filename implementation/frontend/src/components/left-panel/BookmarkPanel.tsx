import { useState, useCallback } from "react";
import { useBookmarkStore, type Bookmark } from "@/stores/bookmarkStore";

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncateSql(sql: string, maxLen = 80): string {
  if (sql.length <= maxLen) return sql;
  return sql.slice(0, maxLen) + "...";
}

function BookmarkItem({ bookmark }: { bookmark: Bookmark }) {
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const addTag = useBookmarkStore((s) => s.addTag);
  const removeTag = useBookmarkStore((s) => s.removeTag);
  const updateBookmark = useBookmarkStore((s) => s.updateBookmark);

  const [expanded, setExpanded] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(bookmark.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !bookmark.tags.includes(tag)) {
      addTag(bookmark.id, tag);
    }
    setTagInput("");
  }, [tagInput, bookmark.id, bookmark.tags, addTag]);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTag();
      } else if (e.key === "Escape") {
        setTagInput("");
      }
    },
    [handleAddTag]
  );

  const handleTitleSubmit = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== bookmark.title) {
      updateBookmark(bookmark.id, { title: trimmed });
    }
    setIsEditingTitle(false);
  }, [editTitle, bookmark.id, bookmark.title, updateBookmark]);

  const handleDeleteClick = useCallback(() => {
    if (confirmDelete) {
      removeBookmark(bookmark.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
    }
  }, [confirmDelete, removeBookmark, bookmark.id]);

  return (
    <div
      data-testid={`bookmark-item-${bookmark.id}`}
      className="rounded border text-xs"
      style={{
        backgroundColor: "var(--color-bg)",
        borderColor: "var(--color-border)",
      }}
    >
      <div
        className="flex items-start gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-gray-500/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              data-testid={`bookmark-title-input-${bookmark.id}`}
              className="w-full bg-transparent border rounded px-1 py-0 text-xs"
              style={{ borderColor: "var(--color-accent)" }}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTitleSubmit();
                } else if (e.key === "Escape") {
                  setIsEditingTitle(false);
                  setEditTitle(bookmark.title);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span
              className="block truncate font-medium"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
                setEditTitle(bookmark.title);
              }}
              title="Double-click to rename"
            >
              {bookmark.title}
            </span>
          )}
          <span className="block truncate opacity-40 font-mono mt-0.5" style={{ fontSize: "10px" }}>
            {truncateSql(bookmark.sql)}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="opacity-30" style={{ fontSize: "10px" }}>
              {formatDate(bookmark.createdAt)}
            </span>
            {bookmark.tags.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {bookmark.tags.map((tag) => (
                  <span
                    key={tag}
                    data-testid={`bookmark-tag-${bookmark.id}-${tag}`}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full font-medium"
                    style={{
                      fontSize: "10px",
                      backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                      color: "var(--color-accent)",
                    }}
                  >
                    {tag}
                    <button
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTag(bookmark.id, tag);
                      }}
                      aria-label={`Remove tag ${tag}`}
                    >
                      <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          data-testid={`bookmark-delete-${bookmark.id}`}
          className={`flex-shrink-0 p-0.5 rounded transition-all duration-150 ${
            confirmDelete ? "opacity-100" : "opacity-30 hover:opacity-100"
          } active:scale-90`}
          style={{ color: confirmDelete ? "var(--color-error)" : "var(--color-text)" }}
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteClick();
          }}
          aria-label={confirmDelete ? "Confirm delete" : "Delete bookmark"}
          title={confirmDelete ? "Click again to confirm" : "Delete bookmark"}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      {/* Expanded content */}
      <div
        style={{
          maxHeight: expanded ? "300px" : "0px",
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 200ms ease, opacity 200ms ease",
        }}
      >
        <div className="px-2 pb-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <pre
            className="mt-1.5 p-1.5 rounded font-mono overflow-x-auto"
            style={{
              fontSize: "10px",
              lineHeight: "1.4",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              maxHeight: "120px",
              overflowY: "auto",
            }}
          >
            {bookmark.sql}
          </pre>
          <div className="mt-1.5 flex items-center gap-1">
            <input
              data-testid={`bookmark-tag-input-${bookmark.id}`}
              type="text"
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="flex-1 px-1.5 py-0.5 rounded border text-xs"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                fontSize: "10px",
              }}
            />
            <button
              data-testid={`bookmark-add-tag-${bookmark.id}`}
              className="px-1.5 py-0.5 rounded text-xs hover:opacity-80 active:scale-95 transition-all"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
                fontSize: "10px",
              }}
              onClick={handleAddTag}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BookmarkPanel() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const searchBookmarks = useBookmarkStore((s) => s.searchBookmarks);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredBookmarks = searchQuery.trim()
    ? searchBookmarks(searchQuery)
    : bookmarks;

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="bookmark-panel">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-60" style={{ color: "var(--color-text)" }}>
          Bookmarks ({bookmarks.length})
        </span>
      </div>

      {bookmarks.length > 0 && (
        <div className="relative mb-2">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            data-testid="bookmark-search"
            type="text"
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs rounded border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
        </div>
      )}

      {bookmarks.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center text-xs opacity-40"
          style={{ color: "var(--color-text)" }}
        >
          No bookmarks yet. Bookmark a query from the chat.
        </div>
      ) : filteredBookmarks.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center text-xs opacity-40"
          style={{ color: "var(--color-text)" }}
        >
          No matching bookmarks
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {filteredBookmarks.map((bookmark) => (
            <BookmarkItem key={bookmark.id} bookmark={bookmark} />
          ))}
        </div>
      )}
    </div>
  );
}
