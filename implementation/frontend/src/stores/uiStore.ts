// Implements: spec/frontend/plan.md#state-management-architecture (uiStore)
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SqlExecution } from "@/stores/chatStore";

interface UiState {
  leftPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  messageDensity: "compact" | "normal" | "spacious";
  sqlModalOpen: boolean;
  activeSqlExecutions: SqlExecution[];
  sqlResultModalIndex: number | null;
  sqlResultViewMode: "table" | "chart";
  chartModalExecution: SqlExecution | null;
  schemaModalDatasetId: string | null;
  previewModalDatasetId: string | null;
  presetModalOpen: boolean;
  reasoningModalOpen: boolean;
  activeReasoning: string;
  shortcutsModalOpen: boolean;
}

interface UiActions {
  toggleLeftPanel: () => void;
  setLeftPanelWidth: (w: number) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (w: number) => void;
  setMessageDensity: (density: "compact" | "normal" | "spacious") => void;
  openSqlModal: (executions: SqlExecution[]) => void;
  closeSqlModal: () => void;
  openSqlResultModal: (index: number) => void;
  closeSqlResultModal: () => void;
  openSqlChartModal: (executions: SqlExecution[], index: number) => void;
  openChartModal: (execution: SqlExecution) => void;
  closeChartModal: () => void;
  openSchemaModal: (datasetId: string) => void;
  closeSchemaModal: () => void;
  openPreviewModal: (datasetId: string) => void;
  closePreviewModal: () => void;
  openPresetModal: () => void;
  closePresetModal: () => void;
  openReasoningModal: (reasoning: string) => void;
  closeReasoningModal: () => void;
  openShortcutsModal: () => void;
  closeShortcutsModal: () => void;
}

export const useUiStore = create<UiState & UiActions>()(
  persist(
    (set) => ({
      leftPanelOpen: true,
      leftPanelWidth: 260,
      rightPanelOpen: true,
      rightPanelWidth: 300,
      messageDensity: "normal" as const,
      sqlModalOpen: false,
      activeSqlExecutions: [],
      sqlResultModalIndex: null,
      sqlResultViewMode: "table" as const,
      chartModalExecution: null,
      schemaModalDatasetId: null,
      previewModalDatasetId: null,
      presetModalOpen: false,
      reasoningModalOpen: false,
      activeReasoning: "",
      shortcutsModalOpen: false,

      toggleLeftPanel: () =>
        set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),

      setLeftPanelWidth: (w) =>
        set({ leftPanelWidth: Math.max(180, Math.min(400, w)) }),

      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      setRightPanelWidth: (w) =>
        set({ rightPanelWidth: Math.max(200, Math.min(500, w)) }),

      setMessageDensity: (density) => set({ messageDensity: density }),

      openSqlModal: (executions) =>
        set({ sqlModalOpen: true, activeSqlExecutions: executions, sqlResultModalIndex: null, sqlResultViewMode: "table" }),

      closeSqlModal: () =>
        set({ sqlModalOpen: false, activeSqlExecutions: [], sqlResultModalIndex: null, sqlResultViewMode: "table" }),

      openSqlResultModal: (index) =>
        set({ sqlResultModalIndex: index }),

      closeSqlResultModal: () =>
        set({ sqlResultModalIndex: null }),

      openSqlChartModal: (executions, index) =>
        set({ sqlModalOpen: true, activeSqlExecutions: executions, sqlResultModalIndex: index, sqlResultViewMode: "chart" }),

      openChartModal: (execution) =>
        set({ chartModalExecution: execution }),

      closeChartModal: () =>
        set({ chartModalExecution: null }),

      openSchemaModal: (datasetId) =>
        set({ schemaModalDatasetId: datasetId }),

      closeSchemaModal: () =>
        set({ schemaModalDatasetId: null }),

      openPreviewModal: (datasetId) =>
        set({ previewModalDatasetId: datasetId }),

      closePreviewModal: () =>
        set({ previewModalDatasetId: null }),

      openPresetModal: () =>
        set({ presetModalOpen: true }),

      closePresetModal: () =>
        set({ presetModalOpen: false }),

      openReasoningModal: (reasoning) =>
        set({ reasoningModalOpen: true, activeReasoning: reasoning }),

      closeReasoningModal: () =>
        set({ reasoningModalOpen: false, activeReasoning: "" }),

      openShortcutsModal: () =>
        set({ shortcutsModalOpen: true }),

      closeShortcutsModal: () =>
        set({ shortcutsModalOpen: false }),
    }),
    {
      name: "chatdf-ui-preferences",
      partialize: (state) => ({
        leftPanelOpen: state.leftPanelOpen,
        leftPanelWidth: state.leftPanelWidth,
        rightPanelOpen: state.rightPanelOpen,
        rightPanelWidth: state.rightPanelWidth,
        messageDensity: state.messageDensity,
      }),
    }
  )
);
