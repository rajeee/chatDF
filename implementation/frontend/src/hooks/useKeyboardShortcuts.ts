// Global keyboard shortcuts for ChatDF
// - "/" - Focus chat input (like Discord/Slack)
// - "Ctrl/Cmd+K" - Focus chat input (industry standard like Linear, Notion, GitHub)
// - "Ctrl/Cmd+B" - Toggle left sidebar
// - "Ctrl/Cmd+E" - Toggle right (dataset) panel
// - "Ctrl/Cmd+P" - Toggle pin on active conversation
// - "Ctrl/Cmd+Shift+F" - Toggle message search
// - "Ctrl/Cmd+Enter" - Send message (when chat input is focused)
// - "Ctrl/Cmd+Shift+L" - Toggle theme (light/dark/system)

import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/api/client";
import { useTheme } from "@/hooks/useTheme";

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
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const queryClient = useQueryClient();

  useEffect(() => {
    const themeController = useTheme();
    try {
      themeController.init();
    } catch {
      // In test environments, matchMedia may not be available.
    }

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

      // Ctrl/Cmd+K - Focus chat input (industry standard pattern)
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && chatInputRef?.current) {
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

      // Ctrl/Cmd+E - Toggle right (dataset) panel
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        toggleRightPanel();
        return;
      }

      // Ctrl/Cmd+P - Toggle pin on active conversation
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        const activeId = useChatStore.getState().activeConversationId;
        if (activeId) {
          const data = queryClient.getQueryData<{ conversations: Array<{ id: string; is_pinned?: boolean }> }>(["conversations"]);
          const conv = data?.conversations.find((c) => c.id === activeId);
          if (conv) {
            const newPinned = !conv.is_pinned;
            // Optimistic update
            queryClient.setQueryData(["conversations"], (old: typeof data) => {
              if (!old) return old;
              return { ...old, conversations: old.conversations.map((c) => c.id === activeId ? { ...c, is_pinned: newPinned } : c) };
            });
            // Fire API call
            apiPatch(`/conversations/${activeId}/pin`, { is_pinned: newPinned }).catch(() => {
              // Rollback on error
              queryClient.setQueryData(["conversations"], data);
            }).finally(() => {
              void queryClient.invalidateQueries({ queryKey: ["conversations"] });
            });
          }
        }
        return;
      }

      // Ctrl/Cmd+Shift+F - Toggle message search
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        const { searchOpen, setSearchOpen } = useChatStore.getState();
        setSearchOpen(!searchOpen);
        return;
      }

      // Ctrl/Cmd+Shift+L - Toggle theme (light/dark/system)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "L") {
        e.preventDefault();
        themeController.toggleTheme();
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      themeController.destroy();
    };
  }, [chatInputRef, toggleLeftPanel, toggleRightPanel, queryClient]);
}
