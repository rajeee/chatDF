// Implements: spec/frontend/plan.md#layout-implementation (RightPanel container)
//
// Container for DatasetInput + DatasetCard list, with Discover and Pinned tabs.
// Resizable via drag handle on left edge.
// Below 1024px (lg): renders as fixed overlay from right side, toggled via Header button.
// On desktop (>=1024px): always visible inline panel with resize handle.

import { useCallback, useMemo, useRef, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useUiStore, type RightPanelTab } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import { apiPost } from "@/api/client";
import { DatasetInput } from "./DatasetInput";
import { DatasetCard } from "./DatasetCard";
import { DatasetSearch } from "./DatasetSearch";
import { DatasetCatalog } from "./DatasetCatalog";
import { SchemaModal } from "./SchemaModal";
import { PreviewModal } from "./PreviewModal";
import { ComparisonModal } from "./ComparisonModal";
import { PresetSourcesModal } from "./PresetSourcesModal";
import { RunSqlPanel } from "./RunSqlPanel";
import { DatasetDiscoveryPanel } from "./DatasetDiscoveryPanel";
import { PinnedResultsPanel } from "./PinnedResultsPanel";

export function RightPanel() {
  const conversationId = useChatStore((s) => s.activeConversationId);
  const allDatasets = useDatasetStore((s) => s.datasets);
  const datasets = useMemo(
    () => filterDatasetsByConversation(allDatasets, conversationId),
    [allDatasets, conversationId]
  );
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
  const rightPanelTab = useUiStore((s) => s.rightPanelTab);
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth);
  const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const openComparisonModal = useUiStore((s) => s.openComparisonModal);
  const readyDatasets = useMemo(
    () => datasets.filter((d) => d.status === "ready"),
    [datasets]
  );
  const isDragging = useRef(false);

  const swipeRef = useSwipeToDismiss({
    direction: "right",
    onDismiss: toggleRightPanel,
    enabled: rightPanelOpen,
  });

  const addDataset = useDatasetStore((s) => s.addDataset);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { success: toastSuccess, error: toastError } = useToastStore();
  const [searchLoading, setSearchLoading] = useState(false);

  const handleLoadFromSearch = useCallback(
    async (url: string) => {
      if (searchLoading) return;
      setSearchLoading(true);
      try {
        let convId = conversationId;
        if (!convId) {
          const newConv = await apiPost<{ id: string }>("/conversations");
          convId = newConv.id;
          setActiveConversation(convId);
        }

        const response = await apiPost<{ dataset_id: string; status: string }>(
          `/conversations/${convId}/datasets`,
          { url }
        );

        const alreadyExists = useDatasetStore
          .getState()
          .datasets.some((d) => d.id === response.dataset_id);
        if (!alreadyExists) {
          addDataset({
            id: response.dataset_id,
            conversation_id: convId!,
            url,
            name: "",
            row_count: 0,
            column_count: 0,
            schema_json: "{}",
            status: "loading",
            error_message: null,
          });
        }
        toastSuccess("Dataset added from Hugging Face");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load dataset";
        toastError(message);
      } finally {
        setSearchLoading(false);
      }
    },
    [conversationId, searchLoading, addDataset, setActiveConversation, toastSuccess, toastError]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = rightPanelWidth;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (ev: MouseEvent) => {
        // Dragging left = wider (negative delta = larger width)
        const delta = startX - ev.clientX;
        setRightPanelWidth(startWidth + delta);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [rightPanelWidth, setRightPanelWidth]
  );

  // On mobile: hidden by default, shown as fixed overlay when rightPanelOpen is true
  // On desktop (lg+): always visible as inline panel
  const mobileClasses = rightPanelOpen
    ? "fixed top-12 right-0 bottom-0 z-40 animate-slide-in-right"
    : "hidden";
  // lg: overrides mobile positioning to be inline
  const desktopClasses = "lg:flex lg:relative lg:sticky lg:top-12 lg:self-start lg:z-auto lg:animate-none";

  return (
    <aside
      ref={swipeRef as React.RefObject<HTMLElement>}
      data-testid="right-panel"
      className={`flex-col border-l transition-all duration-300 ease-in-out ${mobileClasses} ${desktopClasses}`}
      style={{
        width: rightPanelWidth,
        minWidth: rightPanelWidth,
        height: "calc(100vh - 3rem)",
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "-1px 0 3px var(--color-shadow)",
      }}
    >
      {/* Resize handle (desktop only) — wider hit area with visible feedback line */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group transition-colors hidden lg:block"
        style={{ zIndex: 10 }}
      >
        <div className="absolute left-1 top-0 w-[2px] h-full transition-all duration-150 opacity-0 group-hover:opacity-100 bg-[var(--color-accent)] shadow-[0_0_6px_var(--color-accent)]" />
      </div>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Close button (mobile only) */}
        <div className="flex items-center justify-end px-4 pt-3 pb-0 lg:hidden">
          <button
            data-testid="close-right-panel"
            onClick={toggleRightPanel}
            className="p-1 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
            aria-label="Close datasets panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex border-b px-4 pt-2 shrink-0"
          style={{ borderColor: "var(--color-border)" }}
          data-testid="right-panel-tabs"
        >
          {([
            { key: "datasets" as RightPanelTab, label: "Datasets", icon: (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            )},
            { key: "discover" as RightPanelTab, label: "Discover", icon: (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            )},
            { key: "pinned" as RightPanelTab, label: "Pinned", icon: (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l0 5" />
                <path d="M5 12l14 0" />
                <path d="M12 22l0-5" />
                <path d="M9 7l1.5 5H12h1.5L15 7a3 3 0 0 0-6 0z" />
                <line x1="12" y1="17" x2="12" y2="22" />
              </svg>
            )},
          ]).map((tab) => (
            <button
              key={tab.key}
              data-testid={`right-panel-tab-${tab.key}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors"
              style={{
                borderColor: rightPanelTab === tab.key ? "var(--color-accent)" : "transparent",
                color: rightPanelTab === tab.key ? "var(--color-accent)" : "var(--color-text-muted)",
              }}
              onClick={() => setRightPanelTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {rightPanelTab === "datasets" && (
            <>
              <DatasetInput
                conversationId={conversationId ?? ""}
                datasetCount={datasets.length}
              />
              <div className="mt-4 flex flex-col gap-2 overflow-y-auto">
                {datasets.length === 0 ? (
                  <div
                    data-testid="datasets-empty-state"
                    className="flex flex-col items-center justify-center py-12 px-4 text-center"
                  >
                    <svg
                      className="w-16 h-16 mb-4 opacity-20 empty-state-float"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "var(--color-text)" }}
                    >
                      No datasets yet
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Add a dataset to get started
                    </p>
                  </div>
                ) : (
                  datasets.map((dataset, index) => (
                    <DatasetCard key={dataset.id} dataset={dataset} index={index} />
                  ))
                )}
              </div>
              {readyDatasets.length >= 2 && (
                <div className="mt-3 flex gap-2">
                  <button
                    data-testid="compare-datasets-button"
                    onClick={() =>
                      openComparisonModal([readyDatasets[0].id, readyDatasets[1].id])
                    }
                    className="flex-1 flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium hover:brightness-110 active:scale-[0.98] transition-all duration-150"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    Compare
                  </button>
                </div>
              )}
              {datasets.length > 0 && conversationId && (
                <RunSqlPanel conversationId={conversationId} />
              )}
            </>
          )}

          {rightPanelTab === "discover" && (
            <>
              <DatasetDiscoveryPanel />
              <DatasetSearch
                onLoad={handleLoadFromSearch}
                loading={searchLoading}
              />
              <DatasetCatalog
                onLoad={handleLoadFromSearch}
                loading={searchLoading}
              />
            </>
          )}

          {rightPanelTab === "pinned" && (
            <PinnedResultsPanel />
          )}
        </div>
      </div>
      <SchemaModal />
      <PreviewModal />
      <ComparisonModal />
      <PresetSourcesModal />
    </aside>
  );
}
