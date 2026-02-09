// Query history store for SQL query quick re-run
// Fetches from backend API with localStorage persistence as fallback.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiGet, apiDelete } from "../api/client";

export interface QueryHistoryEntry {
  id?: string;
  query: string;
  timestamp: number;
  conversation_id?: string;
  execution_time_ms?: number;
  row_count?: number;
  status?: "success" | "error";
  error_message?: string | null;
  source?: string;
}

interface QueryHistoryState {
  queries: QueryHistoryEntry[];
  isFetching: boolean;
}

interface QueryHistoryActions {
  addQuery: (query: string) => void;
  clearHistory: () => void;
  fetchHistory: () => Promise<void>;
}

const MAX_HISTORY_SIZE = 50;

export const useQueryHistoryStore = create<QueryHistoryState & QueryHistoryActions>()(
  persist(
    (set) => ({
      queries: [],
      isFetching: false,

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

      clearHistory: async () => {
        try {
          await apiDelete("/query-history");
        } catch {
          // Silently fall through — clear local state regardless
        }
        set({ queries: [] });
      },

      fetchHistory: async () => {
        set({ isFetching: true });
        try {
          const response = await apiGet<{ history: Record<string, unknown>[]; total: number }>(
            "/query-history?limit=50"
          );
          const queries: QueryHistoryEntry[] = response.history.map((h) => ({
            id: h.id as string,
            query: h.query as string,
            timestamp: new Date(h.created_at as string).getTime(),
            conversation_id: h.conversation_id as string | undefined,
            execution_time_ms: h.execution_time_ms as number | undefined,
            row_count: h.row_count as number | undefined,
            status: h.status as "success" | "error" | undefined,
            error_message: h.error_message as string | null | undefined,
            source: h.source as string | undefined,
          }));
          set({ queries });
        } catch {
          // Fall back to localStorage data (already in state)
        } finally {
          set({ isFetching: false });
        }
      },
    }),
    {
      name: "query-history-storage",
      partialize: (state) => ({ queries: state.queries }),
    }
  )
);
