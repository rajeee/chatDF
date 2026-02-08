// Implements: spec/frontend/plan.md#layout-implementation (RightPanel container)
//
// Container for DatasetInput + DatasetCard list.
// Resizable via drag handle on left edge.
// Below 1024px (lg): renders as fixed overlay from right side, toggled via Header button.
// On desktop (>=1024px): always visible inline panel with resize handle.

import { useCallback, useMemo, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import { DatasetInput } from "./DatasetInput";
import { DatasetCard } from "./DatasetCard";
import { SchemaModal } from "./SchemaModal";
import { PresetSourcesModal } from "./PresetSourcesModal";

export function RightPanel() {
  const conversationId = useChatStore((s) => s.activeConversationId);
  const allDatasets = useDatasetStore((s) => s.datasets);
  const datasets = useMemo(
    () => filterDatasetsByConversation(allDatasets, conversationId),
    [allDatasets, conversationId]
  );
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const isDragging = useRef(false);

  const swipeRef = useSwipeToDismiss({
    direction: "right",
    onDismiss: toggleRightPanel,
    enabled: rightPanelOpen,
  });

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
      {/* Resize handle (desktop only) */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400/50 transition-colors hidden lg:block"
        style={{ zIndex: 10 }}
      />
      <div className="flex flex-col h-full p-4 overflow-y-auto">
        {/* Close button and title (mobile only) */}
        <div className="flex items-center justify-between mb-3 lg:hidden">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Datasets
          </span>
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
      </div>
      <SchemaModal />
      <PresetSourcesModal />
    </aside>
  );
}
