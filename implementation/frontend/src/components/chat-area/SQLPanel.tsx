// Implements: spec/frontend/chat_area/sql_panel/plan.md
//
// CodeMirror 6 read-only SQL display with syntax highlighting.
// Slide animation on open/close, copy button, close via X/Escape.

import { useEffect, useRef, useState, useCallback } from "react";
import { useCodeMirror } from "@/hooks/useCodeMirror";

interface SQLPanelProps {
  sql: string;
  onClose: () => void;
}

export function SQLPanel({ sql: sqlContent, onClose }: SQLPanelProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Determine if dark mode is active by checking the document class
  const isDark = document.documentElement.classList.contains("dark");

  // CodeMirror editor lifecycle
  useCodeMirror(editorContainerRef, sqlContent, isDark);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sqlContent);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }, [sqlContent]);

  return (
    <div
      data-testid="sql-panel"
      className="border-t flex flex-col"
      style={{
        height: "40%",
        borderColor: "var(--color-border, #e5e7eb)",
        backgroundColor: "var(--color-surface, #ffffff)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--color-border, #e5e7eb)" }}
      >
        <span className="text-sm font-medium">SQL Query</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={copied ? "Copied!" : "Copy SQL"}
            onClick={handleCopy}
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            aria-label="Close SQL panel"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* CodeMirror container */}
      <div
        ref={editorContainerRef}
        data-testid="codemirror-container"
        className="flex-1 overflow-y-auto"
      />
    </div>
  );
}
