// Implements: spec/frontend/plan.md#component-hierarchy (Header)
//
// Header bar with app title. Hamburger toggle moved into LeftPanel.

export function Header() {
  return (
    <header
      data-testid="header"
      className="flex items-center h-12 px-4 border-b sticky top-0 z-20"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-bg)",
      }}
    >
      <span className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
        ChatDF
      </span>
    </header>
  );
}
