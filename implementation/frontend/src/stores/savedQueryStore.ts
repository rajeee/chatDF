import { create } from "zustand";
import { apiGet, apiPost, apiDelete } from "@/api/client";

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  created_at: string;
}

interface SavedQueryState {
  queries: SavedQuery[];
  isLoading: boolean;
}

interface SavedQueryActions {
  fetchQueries: () => Promise<void>;
  saveQuery: (name: string, query: string) => Promise<SavedQuery>;
  deleteQuery: (id: string) => Promise<void>;
}

export const useSavedQueryStore = create<SavedQueryState & SavedQueryActions>()((set) => ({
  queries: [],
  isLoading: false,

  fetchQueries: async () => {
    set({ isLoading: true });
    try {
      const data = await apiGet<{ queries: SavedQuery[] }>("/saved-queries");
      set({ queries: data.queries ?? [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveQuery: async (name: string, query: string) => {
    const saved = await apiPost<SavedQuery>("/saved-queries", { name, query });
    set((state) => ({ queries: [saved, ...state.queries] }));
    return saved;
  },

  deleteQuery: async (id: string) => {
    await apiDelete(`/saved-queries/${id}`);
    set((state) => ({ queries: state.queries.filter((q) => q.id !== id) }));
  },
}));
