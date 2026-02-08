// Query history store for SQL query quick re-run
// Stores last 20 unique queries across all conversations with localStorage persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface QueryHistoryEntry {
  query: string;
  timestamp: number;
}

interface QueryHistoryState {
  queries: QueryHistoryEntry[];
}

interface QueryHistoryActions {
  addQuery: (query: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY_SIZE = 20;

export const useQueryHistoryStore = create<QueryHistoryState & QueryHistoryActions>()(
  persist(
    (set) => ({
      queries: [],

      addQuery: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;

        set((state) => {
          // Remove duplicates (case-insensitive comparison)
          const filtered = state.queries.filter(
            (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase()
          );

          // Add new query at the beginning
          const newQueries = [
            { query: trimmed, timestamp: Date.now() },
            ...filtered,
          ].slice(0, MAX_HISTORY_SIZE); // Keep only last MAX_HISTORY_SIZE queries

          return { queries: newQueries };
        });
      },

      clearHistory: () => set({ queries: [] }),
    }),
    {
      name: "query-history-storage",
      partialize: (state) => ({ queries: state.queries }),
    }
  )
);
