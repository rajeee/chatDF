import { useCallback, useEffect, useRef } from "react";
import { useUiStore } from "@/stores/uiStore";

const SHORTCUTS = [
  { keys: ["/"], description: "Focus chat input" },
  { keys: ["Ctrl", "K"], description: "Focus chat input" },
  { keys: ["Ctrl", "B"], description: "Toggle left sidebar" },
  { keys: ["Ctrl", "E"], description: "Toggle dataset panel" },
  { keys: ["Ctrl", "P"], description: "Toggle pin on conversation" },
  { keys: ["Ctrl", "Enter"], description: "Send message / Run SQL" },
  { keys: ["Ctrl", "Shift", "F"], description: "Search messages" },
  { keys: ["Enter"], description: "Next search match" },
  { keys: ["Shift", "Enter"], description: "Previous search match" },
  { keys: ["Ctrl", "Shift", "L"], description: "Toggle theme" },
  { keys: ["?"], description: "Show this help" },
  { keys: ["Esc"], description: "Unfocus chat input / Close modal" },
  { keys: ["↑", "↓"], description: "Navigate conversations" },
];

// On Mac, show ⌘ instead of Ctrl
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);

export function KeyboardShortcutsModal() {
  const isOpen = useUiStore((s) => s.shortcutsModalOpen);
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    useUiStore.getState().closeShortcutsModal();
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  // Show command key on Mac, Ctrl on others
  function formatKey(key: string) {
    if (key === "Ctrl" && isMac) return "\u2318";
    return key;
  }

  return (
    <div
      data-testid="keyboard-shortcuts-modal"
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      <div
        className="rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 modal-scale-enter"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={close}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {SHORTCUTS.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between text-sm" data-testid="shortcut-row">
              <span className="opacity-70">{shortcut.description}</span>
              <span className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
                    {j > 0 && <span className="opacity-30 mx-0.5">+</span>}
                    <kbd
                      className="inline-block px-1.5 py-0.5 text-xs font-mono rounded"
                      style={{
                        backgroundColor: "var(--color-bg)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      {formatKey(key)}
                    </kbd>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
