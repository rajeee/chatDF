// Implements: spec/frontend/plan.md#component-hierarchy (Header)
//
// Header bar with hamburger toggle for left panel and app title.

import { useUiStore } from "@/stores/uiStore";

export function Header() {
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  return (
    <header
      data-testid="header"
      className="flex items-center h-12 px-4 border-b"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-bg)",
      }}
    >
      <button
        data-testid="toggle-left-panel"
        onClick={toggleLeftPanel}
        className="p-1 mr-3 rounded hover:bg-opacity-10 hover:bg-gray-500"
        aria-label="Toggle left panel"
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
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
        ChatDF
      </span>
    </header>
  );
}
