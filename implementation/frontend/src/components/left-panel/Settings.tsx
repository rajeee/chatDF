// Implements: spec/frontend/left_panel/settings/plan.md
//
// Theme toggle (3-way: light/dark/system), Clear All Conversations with
// confirmation modal, About modal.

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDelete } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useToastStore } from "@/stores/toastStore";

export function Settings() {
  const queryClient = useQueryClient();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { success, error: showError } = useToastStore();

  // Theme
  const theme = useTheme();
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    try {
      theme.init();
      setCurrentTheme(theme.current());
    } catch {
      // In test environments, localStorage may not be available as a function.
      // Fall back to "system" default.
    }
    return () => {
      theme.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleThemeChange(mode: ThemeMode) {
    try {
      theme.setTheme(mode);
    } catch {
      // localStorage may not be available in some environments
    }
    setCurrentTheme(mode);
  }

  // Clear all conversations
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const clearAllMutation = useMutation({
    mutationFn: () => apiDelete("/conversations"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConversation(null);
      setShowClearConfirm(false);
      success("All conversations deleted");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to delete conversations";
      showError(message);
    },
  });

  // About modal
  const [showAbout, setShowAbout] = useState(false);

  const handleEscapeAbout = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && showAbout) {
        setShowAbout(false);
      }
    },
    [showAbout]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscapeAbout);
    return () => document.removeEventListener("keydown", handleEscapeAbout);
  }, [handleEscapeAbout]);

  return (
    <div className="space-y-3 text-sm">
      {/* Theme Toggle */}
      <div>
        <div className="text-xs opacity-50 mb-1">Theme</div>
        <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
          <button
            data-testid="theme-light"
            onClick={() => handleThemeChange("light")}
            className={`flex-1 px-2 py-1 text-xs transition-colors ${
              currentTheme === "light"
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            Light
          </button>
          <button
            data-testid="theme-dark"
            onClick={() => handleThemeChange("dark")}
            className={`flex-1 px-2 py-1 text-xs transition-colors ${
              currentTheme === "dark"
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            Dark
          </button>
          <button
            data-testid="theme-system"
            onClick={() => handleThemeChange("system")}
            className={`flex-1 px-2 py-1 text-xs transition-colors ${
              currentTheme === "system"
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            System
          </button>
        </div>
      </div>

      {/* Clear All Conversations */}
      <div>
        {showClearConfirm ? (
          <div className="p-2 border border-red-300 rounded bg-red-50 dark:bg-red-900/20">
            <p className="text-xs mb-2">
              This will permanently delete all conversations. This action cannot
              be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-2 py-1 text-xs rounded border hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => clearAllMutation.mutate()}
                className="flex-1 px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
              >
                Delete All
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
          >
            Clear all conversations
          </button>
        )}
      </div>

      {/* About Link */}
      <div>
        <button
          onClick={() => setShowAbout(true)}
          className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          About
        </button>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowAbout(false)}
        >
          <div
            data-testid="about-modal"
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">ChatDF</h2>
              <button
                data-testid="close-about-modal"
                onClick={() => setShowAbout(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                X
              </button>
            </div>
            <p className="text-sm opacity-70">
              Conversational data analysis powered by AI. Upload datasets and
              ask questions in natural language.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
