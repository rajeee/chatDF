import { create } from "zustand";
import { apiGet, apiPost, apiDelete } from "@/api/client";

export interface SavedQueryResultData {
  columns: string[];
  rows: unknown[][];
  total_rows: number;
}

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  created_at: string;
  result_data?: SavedQueryResultData;
}

interface SavedQueryState {
  queries: SavedQuery[];
  isLoading: boolean;
}

interface SavedQueryActions {
  fetchQueries: () => Promise<void>;
  saveQuery: (name: string, query: string, resultData?: SavedQueryResultData) => Promise<SavedQuery>;
  deleteQuery: (id: string) => Promise<void>;
}

/** Max rows to store in a bookmark to prevent bloated storage. */
const MAX_BOOKMARK_ROWS = 100;

/** Parse a raw API response (with result_json string) into a SavedQuery with result_data. */
function parseRawSavedQuery(raw: RawSavedQuery): SavedQuery {
  const { result_json, ...rest } = raw;
  let result_data: SavedQueryResultData | undefined;
  if (result_json) {
    try {
      result_data = JSON.parse(result_json) as SavedQueryResultData;
    } catch {
      // Ignore malformed JSON
    }
  }
  return { ...rest, result_data };
}

/** Raw API shape (result_json is a JSON string from the backend). */
interface RawSavedQuery {
  id: string;
  name: string;
  query: string;
  created_at: string;
  result_json?: string | null;
}

export const useSavedQueryStore = create<SavedQueryState & SavedQueryActions>()((set) => ({
  queries: [],
  isLoading: false,

  fetchQueries: async () => {
    set({ isLoading: true });
    try {
      const data = await apiGet<{ queries: RawSavedQuery[] }>("/saved-queries");
      const queries = (data.queries ?? []).map(parseRawSavedQuery);
      set({ queries, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveQuery: async (name: string, query: string, resultData?: SavedQueryResultData) => {
    // Cap rows at MAX_BOOKMARK_ROWS to keep storage reasonable
    let result_json: string | undefined;
    if (resultData) {
      const capped: SavedQueryResultData = {
        columns: resultData.columns,
        rows: resultData.rows.slice(0, MAX_BOOKMARK_ROWS),
        total_rows: resultData.total_rows,
      };
      result_json = JSON.stringify(capped);
    }
    const raw = await apiPost<RawSavedQuery>("/saved-queries", { name, query, result_json });
    const saved = parseRawSavedQuery(raw);
    set((state) => ({ queries: [saved, ...state.queries] }));
    return saved;
  },

  deleteQuery: async (id: string) => {
    await apiDelete(`/saved-queries/${id}`);
    set((state) => ({ queries: state.queries.filter((q) => q.id !== id) }));
  },
}));
