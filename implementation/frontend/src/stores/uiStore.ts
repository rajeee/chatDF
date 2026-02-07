// Implements: spec/frontend/plan.md#state-management-architecture (uiStore)
import { create } from "zustand";
import type { SqlExecution } from "@/stores/chatStore";

interface UiState {
  leftPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  sqlModalOpen: boolean;
  activeSqlExecutions: SqlExecution[];
  sqlResultModalIndex: number | null;
  schemaModalDatasetId: string | null;
  presetModalOpen: boolean;
}

interface UiActions {
  toggleLeftPanel: () => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  openSqlModal: (executions: SqlExecution[]) => void;
  closeSqlModal: () => void;
  openSqlResultModal: (index: number) => void;
  closeSqlResultModal: () => void;
  openSchemaModal: (datasetId: string) => void;
  closeSchemaModal: () => void;
  openPresetModal: () => void;
  closePresetModal: () => void;
}

export const useUiStore = create<UiState & UiActions>()((set) => ({
  leftPanelOpen: true,
  leftPanelWidth: 260,
  rightPanelWidth: 300,
  sqlModalOpen: false,
  activeSqlExecutions: [],
  sqlResultModalIndex: null,
  schemaModalDatasetId: null,
  presetModalOpen: false,

  toggleLeftPanel: () =>
    set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),

  setLeftPanelWidth: (w) =>
    set({ leftPanelWidth: Math.max(180, Math.min(400, w)) }),

  setRightPanelWidth: (w) =>
    set({ rightPanelWidth: Math.max(200, Math.min(500, w)) }),

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

  openPresetModal: () =>
    set({ presetModalOpen: true }),

  closePresetModal: () =>
    set({ presetModalOpen: false }),
}));
