// Implements: spec/frontend/plan.md#layout-implementation (RightPanel container)
//
// Container for DatasetInput + DatasetCard list.
// Resizable via drag handle on left edge.

import { useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";
import { DatasetInput } from "./DatasetInput";
import { DatasetCard } from "./DatasetCard";
import { SchemaModal } from "./SchemaModal";
import { PresetSourcesModal } from "./PresetSourcesModal";

export function RightPanel() {
  const conversationId = useChatStore((s) => s.activeConversationId);
  const datasets = useDatasetStore((s) => s.datasets);
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth);
  const isDragging = useRef(false);

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

  return (
    <aside
      data-testid="right-panel"
      className="flex flex-col border-l relative sticky top-12 self-start"
      style={{
        width: rightPanelWidth,
        minWidth: rightPanelWidth,
        height: "calc(100vh - 3rem)",
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-bg)",
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400/50 transition-colors"
        style={{ zIndex: 10 }}
      />
      <div className="flex flex-col h-full p-4 overflow-y-auto">
        <DatasetInput
          conversationId={conversationId ?? ""}
          datasetCount={datasets.length}
        />
        <div className="mt-4 flex flex-col gap-2 overflow-y-auto">
          {datasets.map((dataset) => (
            <DatasetCard key={dataset.id} dataset={dataset} />
          ))}
        </div>
      </div>
      <SchemaModal />
      <PresetSourcesModal />
    </aside>
  );
}
