// Implements: spec/frontend/plan.md#layout-implementation (RightPanel container)
//
// Container for DatasetInput + DatasetCard list.
// 300px fixed width.

import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { DatasetInput } from "./DatasetInput";
import { DatasetCard } from "./DatasetCard";
import { SchemaModal } from "./SchemaModal";

export function RightPanel() {
  const conversationId = useChatStore((s) => s.activeConversationId);
  const datasets = useDatasetStore((s) => s.datasets);

  return (
    <aside
      data-testid="right-panel"
      className="flex flex-col w-[300px] min-w-[300px] border-l"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-bg)",
      }}
    >
      <div className="flex flex-col h-full p-4">
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
    </aside>
  );
}
