// Implements: spec/frontend/plan.md#state-management-architecture (uiStore)
import { create } from "zustand";
import type { SqlExecution } from "@/stores/chatStore";

interface UiState {
  leftPanelOpen: boolean;
  sqlModalOpen: boolean;
  activeSqlExecutions: SqlExecution[];
  sqlResultModalIndex: number | null;
  schemaModalDatasetId: string | null;
}

interface UiActions {
  toggleLeftPanel: () => void;
  openSqlModal: (executions: SqlExecution[]) => void;
  closeSqlModal: () => void;
  openSqlResultModal: (index: number) => void;
  closeSqlResultModal: () => void;
  openSchemaModal: (datasetId: string) => void;
  closeSchemaModal: () => void;
}

export const useUiStore = create<UiState & UiActions>()((set) => ({
  leftPanelOpen: true,
  sqlModalOpen: false,
  activeSqlExecutions: [],
  sqlResultModalIndex: null,
  schemaModalDatasetId: null,

  toggleLeftPanel: () =>
    set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),

  openSqlModal: (executions) =>
    set({ sqlModalOpen: true, activeSqlExecutions: executions, sqlResultModalIndex: null }),

  closeSqlModal: () =>
    set({ sqlModalOpen: false, activeSqlExecutions: [], sqlResultModalIndex: null }),

  openSqlResultModal: (index) =>
    set({ sqlResultModalIndex: index }),

  closeSqlResultModal: () =>
    set({ sqlResultModalIndex: null }),

  openSchemaModal: (datasetId) =>
    set({ schemaModalDatasetId: datasetId }),

  closeSchemaModal: () =>
    set({ schemaModalDatasetId: null }),
}));
