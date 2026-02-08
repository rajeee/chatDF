// Reasoning modal: displays the model's internal reasoning/thinking tokens.
// Pattern follows PresetSourcesModal — fixed overlay, backdrop close, Escape close.

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useUiStore } from "@/stores/uiStore";

export function ReasoningModal() {
  const isOpen = useUiStore((s) => s.reasoningModalOpen);
  const reasoning = useUiStore((s) => s.activeReasoning);
  const closeModal = useUiStore((s) => s.closeReasoningModal);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        className="rounded-lg shadow-xl flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          width: "min(700px, 90vw)",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-lg font-semibold">Reasoning</h2>
          <button
            onClick={closeModal}
            className="p-1 rounded hover:bg-opacity-10 hover:bg-gray-500"
            aria-label="Close"
          >
            <svg
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{reasoning}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
