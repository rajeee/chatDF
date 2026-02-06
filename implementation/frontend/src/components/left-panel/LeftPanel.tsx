// Implements: spec/frontend/plan.md#layout-implementation (LeftPanel container)
//
// Container for ChatHistory, Settings, UsageStats, Account sections.
// Controlled by uiStore.leftPanelOpen.
// 260px width when open, 0px when collapsed with overflow:hidden.

import { useUiStore } from "@/stores/uiStore";
import { ChatHistory } from "./ChatHistory";
import { Settings } from "./Settings";
import { UsageStats } from "./UsageStats";
import { Account } from "./Account";

export function LeftPanel() {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);

  return (
    <aside
      data-testid="left-panel"
      className={`flex flex-col overflow-hidden transition-all duration-200 ${
        leftPanelOpen ? "w-[260px] min-w-[260px]" : "w-0 min-w-0"
      } lg:relative lg:z-auto ${
        leftPanelOpen ? "fixed inset-y-0 left-0 z-40 lg:static" : ""
      }`}
      style={{
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex flex-col h-full p-4">
        <ChatHistory />
        <div className="mt-4">
          <Settings />
        </div>
        <div className="mt-4">
          <UsageStats />
        </div>
        <div className="mt-auto">
          <Account />
        </div>
      </div>
    </aside>
  );
}
