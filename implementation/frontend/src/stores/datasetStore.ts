// Implements: spec/frontend/plan.md#state-management-architecture (datasetStore)
import { create } from "zustand";

export interface Dataset {
  id: string;
  url: string;
  name: string;
  row_count: number;
  column_count: number;
  schema_json: string;
  status: "loading" | "ready" | "error";
  error_message: string | null;
}

interface DatasetState {
  datasets: Dataset[];
  loadingDatasets: Set<string>;
}

interface DatasetActions {
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  renameDataset: (id: string, name: string) => void;
  refreshSchema: (id: string) => void;
  reset: () => void;
}

const initialState: DatasetState = {
  datasets: [],
  loadingDatasets: new Set<string>(),
};

export const useDatasetStore = create<DatasetState & DatasetActions>()((set) => ({
  ...initialState,

  addDataset: (dataset) =>
    set((state) => ({
      datasets: [...state.datasets, dataset],
    })),

  removeDataset: (id) =>
    set((state) => ({
      datasets: state.datasets.filter((d) => d.id !== id),
    })),

  updateDataset: (id, updates) =>
    set((state) => ({
      datasets: state.datasets.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    })),

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

  reset: () =>
    set({
      datasets: [],
      loadingDatasets: new Set<string>(),
    }),
}));
