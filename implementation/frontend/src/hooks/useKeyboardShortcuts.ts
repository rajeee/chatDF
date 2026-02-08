// Global keyboard shortcuts for ChatDF
// - "/" - Focus chat input (like Discord/Slack)
// - "Ctrl/Cmd+B" - Toggle left sidebar
// - "Ctrl/Cmd+Enter" - Send message (when chat input is focused)

import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";

export interface ChatInputHandle {
  focus: () => void;
  sendMessage: () => void;
}

interface UseKeyboardShortcutsOptions {
  /** Ref to chat input handle */
  chatInputRef?: React.RefObject<ChatInputHandle>;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { chatInputRef } = options;
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // "/" - Focus chat input (when not already in an input)
      if (e.key === "/" && !isInputFocused && chatInputRef?.current) {
        e.preventDefault();
        chatInputRef.current.focus();
        return;
      }

      // Ctrl/Cmd+B - Toggle left sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleLeftPanel();
        return;
      }

      // Ctrl/Cmd+Enter - Send message (from chat input)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && isInputFocused) {
        const isChatInput = target.getAttribute("aria-label") === "Message input";
        if (isChatInput && chatInputRef?.current) {
          e.preventDefault();
          chatInputRef.current.sendMessage();
          return;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [chatInputRef, toggleLeftPanel]);
}
