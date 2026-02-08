// Implements: spec/frontend/plan.md#layout-implementation (LeftPanel container)
//
// Container for ChatHistory, Settings, UsageStats, Account sections.
// Controlled by uiStore.leftPanelOpen.
// Resizable via drag handle on right edge. Collapsible to 48px strip.

import { useCallback, useRef } from "react";
import { useUiStore } from "@/stores/uiStore";
import { ChatHistory } from "./ChatHistory";
import { Settings } from "./Settings";
import { UsageStats } from "./UsageStats";
import { Account } from "./Account";

function HamburgerIcon() {
  return (
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
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function LeftPanel() {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const leftPanelWidth = useUiStore((s) => s.leftPanelWidth);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const setLeftPanelWidth = useUiStore((s) => s.setLeftPanelWidth);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = leftPanelWidth;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setLeftPanelWidth(startWidth + delta);
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
    [leftPanelWidth, setLeftPanelWidth]
  );

  // Collapsed state: 48px strip with hamburger only
  if (!leftPanelOpen) {
    return (
      <aside
        data-testid="left-panel"
        className="flex flex-col items-center pt-3 sticky top-12 self-start border-r transition-all duration-300 ease-in-out"
        style={{
          width: 48,
          minWidth: 48,
          height: "calc(100vh - 3rem)",
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <button
          data-testid="toggle-left-panel"
          onClick={toggleLeftPanel}
          className="p-1 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
          aria-label="Toggle left panel"
          title="Toggle sidebar (⌘/Ctrl+B)"
        >
          <HamburgerIcon />
        </button>
      </aside>
    );
  }

  // Expanded state: full sidebar with hamburger + content + resize handle
  return (
    <aside
      data-testid="left-panel"
      className="flex flex-col relative sticky top-12 self-start border-r transition-all duration-300 ease-in-out"
      style={{
        width: leftPanelWidth,
        minWidth: leftPanelWidth,
        height: "calc(100vh - 3rem)",
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex flex-col h-full p-4 overflow-y-auto animate-panel-content-fade-in">
        <div className="flex items-center mb-3">
          <button
            data-testid="toggle-left-panel"
            onClick={toggleLeftPanel}
            className="p-1 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
            aria-label="Toggle left panel"
            title="Toggle sidebar (⌘/Ctrl+B)"
          >
            <HamburgerIcon />
          </button>
        </div>
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
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400/50 transition-colors"
        style={{ zIndex: 10 }}
      />
    </aside>
  );
}
