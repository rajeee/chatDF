// Implements: spec/frontend/plan.md#state-management-architecture (datasetStore)
import { create } from "zustand";

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

interface DatasetState {
  datasets: Dataset[];
  loadingDatasets: Set<string>;
  loadingStartTimes: Record<string, number>;
}

interface DatasetActions {
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  renameDataset: (id: string, name: string) => void;
  refreshSchema: (id: string) => void;
  setConversationDatasets: (conversationId: string, datasets: Dataset[]) => void;
  getLoadingStartTime: (id: string) => number | undefined;
  reset: () => void;
}

const initialState: DatasetState = {
  datasets: [],
  loadingDatasets: new Set<string>(),
  loadingStartTimes: {},
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

  reset: () =>
    set({
      datasets: [],
      loadingDatasets: new Set<string>(),
      loadingStartTimes: {},
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
