import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/api/client";

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
  execution_time_ms?: number | null;
  folder: string;
}

interface SavedQueryState {
  queries: SavedQuery[];
  isLoading: boolean;
}

interface SavedQueryActions {
  fetchQueries: () => Promise<void>;
  saveQuery: (name: string, query: string, resultData?: SavedQueryResultData, executionTimeMs?: number | null, folder?: string) => Promise<SavedQuery>;
  deleteQuery: (id: string) => Promise<void>;
  moveToFolder: (id: string, folder: string) => Promise<void>;
  getFolders: () => string[];
}

/** Max rows to store in a bookmark to prevent bloated storage. */
const MAX_BOOKMARK_ROWS = 100;

/** Parse a raw API response (with result_json string) into a SavedQuery with result_data. */
function parseRawSavedQuery(raw: RawSavedQuery): SavedQuery {
  const { result_json, execution_time_ms, folder, ...rest } = raw;
  let result_data: SavedQueryResultData | undefined;
  if (result_json) {
    try {
      result_data = JSON.parse(result_json) as SavedQueryResultData;
    } catch {
      // Ignore malformed JSON
    }
  }
  return { ...rest, result_data, execution_time_ms, folder: folder ?? "" };
}

/** Raw API shape (result_json is a JSON string from the backend). */
interface RawSavedQuery {
  id: string;
  name: string;
  query: string;
  created_at: string;
  result_json?: string | null;
  execution_time_ms?: number | null;
  folder?: string;
}

export const useSavedQueryStore = create<SavedQueryState & SavedQueryActions>()((set, get) => ({
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

  saveQuery: async (name: string, query: string, resultData?: SavedQueryResultData, executionTimeMs?: number | null, folder?: string) => {
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
    const raw = await apiPost<RawSavedQuery>("/saved-queries", {
      name,
      query,
      result_json,
      execution_time_ms: executionTimeMs ?? undefined,
      folder: folder ?? "",
    });
    const saved = parseRawSavedQuery(raw);
    set((state) => ({ queries: [saved, ...state.queries] }));
    return saved;
  },

  deleteQuery: async (id: string) => {
    await apiDelete(`/saved-queries/${id}`);
    set((state) => ({ queries: state.queries.filter((q) => q.id !== id) }));
  },

  moveToFolder: async (id: string, folder: string) => {
    await apiPatch(`/saved-queries/${id}/folder`, { folder });
    set((state) => ({
      queries: state.queries.map((q) =>
        q.id === id ? { ...q, folder } : q
      ),
    }));
  },

  getFolders: () => {
    const folders = new Set<string>();
    for (const q of get().queries) {
      if (q.folder) folders.add(q.folder);
    }
    return Array.from(folders).sort();
  },
}));
