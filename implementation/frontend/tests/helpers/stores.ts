// Store preset helpers for setting Zustand stores to specific states
// before rendering components under test.
//
// Store shapes from spec/frontend/plan.md:
//   chatStore:    { activeConversationId, messages[], streamingTokens, isStreaming, ... }
//   datasetStore: { datasets[], loadingDatasets }
//   uiStore:      { leftPanelOpen, sqlModalOpen, activeSqlExecutions, sqlResultModalIndex, schemaModalDatasetId }

import { useChatStore, type Message, type SqlExecution } from "@/stores/chatStore";
import { useDatasetStore, type Dataset } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";

// Re-export types for convenience
export type { Message } from "@/stores/chatStore";
export type { Dataset } from "@/stores/datasetStore";

/**
 * Reset all Zustand stores to their initial state.
 * Call this in beforeEach to ensure test isolation.
 */
export function resetAllStores(): void {
  useChatStore.getState().reset();
  useDatasetStore.getState().reset();
  useUiStore.setState({
    leftPanelOpen: true,
    sqlModalOpen: false,
    activeSqlExecutions: [],
    sqlResultModalIndex: null,
    schemaModalDatasetId: null,
    comparisonDatasetIds: null,
    settingsModalOpen: false,
  });
}

/**
 * Set the chat store to a streaming state with given messages and
 * partial streaming content.
 */
export function setChatStreaming(
  messages: Message[],
  streamingTokens = ""
): void {
  useChatStore.setState({
    messages,
    isStreaming: true,
    streamingTokens,
  });
}

/**
 * Set the chat store to an idle state with the given messages.
 */
export function setChatIdle(
  conversationId: string,
  messages: Message[] = []
): void {
  useChatStore.setState({
    activeConversationId: conversationId,
    messages,
    isStreaming: false,
    streamingTokens: "",
    streamingMessageId: null,
    loadingPhase: "idle",
  });
}

/**
 * Set the dataset store with given datasets already loaded.
 */
export function setDatasetsLoaded(datasets: Dataset[]): void {
  useDatasetStore.setState({ datasets });
}

/**
 * Set the UI store to a specific panel state.
 */
export function setUiState(state: Partial<{
  leftPanelOpen: boolean;
  sqlModalOpen: boolean;
  activeSqlExecutions: SqlExecution[];
  sqlResultModalIndex: number | null;
  schemaModalDatasetId: string | null;
  comparisonDatasetIds: string[] | null;
}>): void {
  useUiStore.setState(state);
}
