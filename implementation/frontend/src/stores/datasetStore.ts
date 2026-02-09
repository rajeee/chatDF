// Implements: spec/frontend/plan.md#state-management-architecture (datasetStore)
import { create } from "zustand";
import { apiPost } from "@/api/client";

export interface Dataset {
  id: string;
  conversation_id: string;
  url: string;
  name: string;
  row_count: number;
  column_count: number;
  schema_json: string;
  status: "loading" | "ready" | "error";
  error_message: string | null;
  file_size_bytes?: number | null;
}

export interface ColumnProfile {
  name: string;
  null_count: number;
  null_percent: number;
  unique_count: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  min_length?: number | null;
  max_length?: number | null;
}

interface DatasetState {
  datasets: Dataset[];
  loadingDatasets: Set<string>;
  loadingStartTimes: Record<string, number>;
  columnProfiles: Record<string, ColumnProfile[]>;
  isProfiling: Record<string, boolean>;
}

interface DatasetActions {
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  renameDataset: (id: string, name: string) => void;
  refreshSchema: (id: string) => void;
  setConversationDatasets: (conversationId: string, datasets: Dataset[]) => void;
  getLoadingStartTime: (id: string) => number | undefined;
  profileDataset: (conversationId: string, datasetId: string) => Promise<void>;
  setColumnProfiles: (datasetId: string, profiles: ColumnProfile[]) => void;
  reset: () => void;
}

const initialState: DatasetState = {
  datasets: [],
  loadingDatasets: new Set<string>(),
  loadingStartTimes: {},
  columnProfiles: {},
  isProfiling: {},
};

export const useDatasetStore = create<DatasetState & DatasetActions>()((set) => ({
  ...initialState,

  addDataset: (dataset) =>
    set((state) => ({
      datasets: [...state.datasets, dataset],
      loadingStartTimes:
        dataset.status === "loading"
          ? { ...state.loadingStartTimes, [dataset.id]: Date.now() }
          : state.loadingStartTimes,
    })),

  removeDataset: (id) =>
    set((state) => {
      const { [id]: _, ...remainingTimes } = state.loadingStartTimes;
      return {
        datasets: state.datasets.filter((d) => d.id !== id),
        loadingStartTimes: remainingTimes,
      };
    }),

  updateDataset: (id, updates) =>
    set((state) => {
      const shouldClearTime =
        updates.status === "ready" || updates.status === "error";
      const loadingStartTimes = shouldClearTime
        ? (() => {
            const { [id]: _, ...rest } = state.loadingStartTimes;
            return rest;
          })()
        : state.loadingStartTimes;
      return {
        datasets: state.datasets.map((d) =>
          d.id === id ? { ...d, ...updates } : d
        ),
        loadingStartTimes,
      };
    }),

  renameDataset: (id, name) =>
    set((state) => ({
      datasets: state.datasets.map((d) =>
        d.id === id ? { ...d, name } : d
      ),
    })),

  refreshSchema: (id) =>
    set((state) => ({
      loadingDatasets: new Set(state.loadingDatasets).add(id),
    })),

  setConversationDatasets: (conversationId, datasets) =>
    set((state) => ({
      // Replace datasets for this conversation, keep others
      datasets: [
        ...state.datasets.filter((d) => d.conversation_id !== conversationId),
        ...datasets,
      ],
    })),

  getLoadingStartTime: (id) => useDatasetStore.getState().loadingStartTimes[id],

  profileDataset: async (conversationId, datasetId) => {
    // Skip if already profiled (e.g., via auto-profile on load)
    const existing = useDatasetStore.getState().columnProfiles[datasetId];
    if (existing && existing.length > 0) return;

    set((state) => ({
      isProfiling: { ...state.isProfiling, [datasetId]: true },
    }));
    try {
      const result = await apiPost<{ profiles: ColumnProfile[] }>(
        `/conversations/${conversationId}/datasets/${datasetId}/profile`
      );
      set((state) => ({
        columnProfiles: { ...state.columnProfiles, [datasetId]: result.profiles },
        isProfiling: { ...state.isProfiling, [datasetId]: false },
      }));
    } catch {
      set((state) => ({
        isProfiling: { ...state.isProfiling, [datasetId]: false },
      }));
    }
  },

  setColumnProfiles: (datasetId, profiles) =>
    set((state) => ({
      columnProfiles: { ...state.columnProfiles, [datasetId]: profiles },
      isProfiling: { ...state.isProfiling, [datasetId]: false },
    })),

  reset: () =>
    set({
      datasets: [],
      loadingDatasets: new Set<string>(),
      loadingStartTimes: {},
      columnProfiles: {},
      isProfiling: {},
    }),
}));

/** Filter datasets for a specific conversation (use with useMemo in components) */
export function filterDatasetsByConversation(
  datasets: Dataset[],
  conversationId: string | null
): Dataset[] {
  return conversationId
    ? datasets.filter((d) => d.conversation_id === conversationId)
    : [];
}
