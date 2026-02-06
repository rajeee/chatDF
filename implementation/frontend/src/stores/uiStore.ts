// Implements: spec/frontend/plan.md#state-management-architecture (uiStore)
import { create } from "zustand";

interface UiState {
  leftPanelOpen: boolean;
  sqlPanelOpen: boolean;
  activeSqlContent: string | null;
  schemaModalDatasetId: string | null;
}

interface UiActions {
  toggleLeftPanel: () => void;
  openSqlPanel: (sql: string) => void;
  closeSqlPanel: () => void;
  openSchemaModal: (datasetId: string) => void;
  closeSchemaModal: () => void;
}

export const useUiStore = create<UiState & UiActions>()((set) => ({
  leftPanelOpen: true,
  sqlPanelOpen: false,
  activeSqlContent: null,
  schemaModalDatasetId: null,

  toggleLeftPanel: () =>
    set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),

  openSqlPanel: (sql) =>
    set({ sqlPanelOpen: true, activeSqlContent: sql }),

  closeSqlPanel: () =>
    set({ sqlPanelOpen: false, activeSqlContent: null }),

  openSchemaModal: (datasetId) =>
    set({ schemaModalDatasetId: datasetId }),

  closeSchemaModal: () =>
    set({ schemaModalDatasetId: null }),
}));
