import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Bookmark {
  id: string;
  messageId: string;
  conversationId: string;
  sql: string;
  title: string;
  tags: string[];
  createdAt: string;
  notes?: string;
}

interface BookmarkState {
  bookmarks: Bookmark[];
}

interface BookmarkActions {
  addBookmark: (bookmark: Omit<Bookmark, "id" | "createdAt">) => void;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, updates: Partial<Pick<Bookmark, "title" | "notes" | "tags">>) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  searchBookmarks: (query: string) => Bookmark[];
  isBookmarked: (messageId: string) => boolean;
  getBookmarkByMessageId: (messageId: string) => Bookmark | undefined;
}

const initialState: BookmarkState = {
  bookmarks: [],
};

export const useBookmarkStore = create<BookmarkState & BookmarkActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addBookmark: (bookmark) => {
        const newBookmark: Bookmark = {
          ...bookmark,
          id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          bookmarks: [newBookmark, ...state.bookmarks],
        }));
      },

      removeBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        })),

      updateBookmark: (id, updates) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        })),

      addTag: (id, tag) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id && !b.tags.includes(tag)
              ? { ...b, tags: [...b.tags, tag] }
              : b
          ),
        })),

      removeTag: (id, tag) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id
              ? { ...b, tags: b.tags.filter((t) => t !== tag) }
              : b
          ),
        })),

      searchBookmarks: (query) => {
        const q = query.toLowerCase().trim();
        if (!q) return get().bookmarks;
        return get().bookmarks.filter((b) =>
          b.title.toLowerCase().includes(q) ||
          b.sql.toLowerCase().includes(q) ||
          (b.notes?.toLowerCase().includes(q) ?? false) ||
          b.tags.some((t) => t.toLowerCase().includes(q))
        );
      },

      isBookmarked: (messageId) =>
        get().bookmarks.some((b) => b.messageId === messageId),

      getBookmarkByMessageId: (messageId) =>
        get().bookmarks.find((b) => b.messageId === messageId),
    }),
    {
      name: "chatdf-bookmarks",
    }
  )
);
