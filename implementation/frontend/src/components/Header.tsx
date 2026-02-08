// Implements: spec/frontend/plan.md#component-hierarchy (Header)
//
// Header bar with app title. Hamburger toggle moved into LeftPanel.
// On mobile (<lg): shows datasets toggle button on the right.

import { useUiStore } from "@/stores/uiStore";

export function Header() {
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);

  return (
    <header
      data-testid="header"
      className="flex items-center justify-between h-12 px-4 border-b sticky top-0 z-20"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 1px 2px var(--color-shadow)",
      }}
    >
      <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
        ChatDF
      </span>

      {/* Datasets toggle button — mobile only */}
      <button
        data-testid="toggle-right-panel"
        onClick={toggleRightPanel}
        className="lg:hidden p-1.5 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
        aria-label="Toggle datasets panel"
        title="Datasets"
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
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </button>
    </header>
  );
}
