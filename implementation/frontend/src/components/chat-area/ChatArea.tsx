// Implements: spec/frontend/plan.md#component-hierarchy (ChatArea)
//
// Conditional rendering based on state:
// - No datasets AND no messages -> OnboardingGuide placeholder
// - Datasets exist but no messages -> Suggested prompts placeholder
// - Otherwise -> MessageList + ChatInput placeholder
// Also includes SQL panel overlay placeholder.

import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";

export function ChatArea() {
  const messages = useChatStore((s) => s.messages);
  const datasets = useDatasetStore((s) => s.datasets);
  const sqlPanelOpen = useUiStore((s) => s.sqlPanelOpen);

  const hasDatasets = datasets.length > 0;
  const hasMessages = messages.length > 0;

  return (
    <section
      data-testid="chat-area"
      className="relative flex flex-col flex-1 min-w-0"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Main content area - conditional rendering */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasDatasets && !hasMessages && (
          <div
            data-testid="onboarding-placeholder"
            className="flex-1 flex items-center justify-center"
          >
            <span className="text-sm opacity-50">OnboardingGuide area</span>
          </div>
        )}

        {hasDatasets && !hasMessages && (
          <div
            data-testid="suggested-prompts-placeholder"
            className="flex-1 flex items-center justify-center"
          >
            <span className="text-sm opacity-50">Suggested prompts area</span>
          </div>
        )}

        {hasMessages && (
          <div
            data-testid="message-list-placeholder"
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto">
              <span className="text-sm opacity-50 p-4 block">
                MessageList area
              </span>
            </div>
            <div className="p-4 border-t" style={{ borderColor: "var(--color-surface)" }}>
              <span className="text-sm opacity-50">ChatInput area</span>
            </div>
          </div>
        )}
      </div>

      {/* SQL Panel overlay placeholder */}
      {sqlPanelOpen && (
        <div
          data-testid="sql-panel-placeholder"
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          <span className="text-sm opacity-50">SQL Panel overlay</span>
        </div>
      )}
    </section>
  );
}
