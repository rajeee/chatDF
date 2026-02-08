// Implements: spec/frontend/left_panel/chat_history/plan.md
//
// Conversation list with selection, inline rename, delete with confirmation.
// TanStack Query for GET /conversations, sorted by updated_at desc.

import { useState, useRef, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete, apiPost } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import { formatRelativeTime } from "@/utils/relativeTime";

interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  dataset_count: number;
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
}

export function ChatHistory() {
  const queryClient = useQueryClient();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { success, error: showError } = useToastStore();

  const { data, isPending } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiGet<ConversationsResponse>("/conversations"),
    staleTime: 30_000,
  });

  const conversations = data?.conversations ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiPatch(`/conversations/${id}`, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      success("Conversation renamed");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to rename conversation";
      showError(message);
    },
    onSettled: () => {
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/conversations/${id}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeConversationId === id) {
        setActiveConversation(null);
      }
      success("Conversation deleted");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to delete conversation";
      showError(message);
    },
    onSettled: () => {
      setConfirmingDeleteId(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<ConversationSummary>("/conversations"),
    onSuccess: (newConv) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConversation(newConv.id);
    },
  });

  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  function handleSelect(id: string) {
    setActiveConversation(id);
    // On mobile (<1024px), close the left panel overlay after selecting
    if (leftPanelOpen && window.innerWidth < 1024) {
      toggleLeftPanel();
    }
  }

  function handleDoubleClick(conv: ConversationSummary) {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }

  function handleRenameSubmit(id: string) {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== conversations.find((c) => c.id === id)?.title) {
      renameMutation.mutate({ id, title: trimmed });
    } else {
      setEditingId(null);
    }
  }

  function handleRenameKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingId(null);
    }
  }

  function handleDeleteClick(id: string) {
    setConfirmingDeleteId(id);
  }

  function handleConfirmDelete(id: string) {
    deleteMutation.mutate(id);
  }

  function handleCancelDelete() {
    setConfirmingDeleteId(null);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <button
        data-testid="new-chat-button"
        onClick={() => createMutation.mutate()}
        className="mb-2 px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 active:scale-95 transition-all duration-150 flex items-center justify-center gap-2"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>New Chat</span>
      </button>

      {isPending ? (
        <ul className="flex-1 overflow-y-auto space-y-0.5">
          {[...Array(3)].map((_, i) => (
            <li
              key={`skeleton-${i}`}
              data-testid="conversation-skeleton"
              className="px-2 py-1.5 rounded"
            >
              <div
                className="h-5 rounded animate-pulse"
                style={{
                  backgroundColor: "var(--color-border)",
                  width: `${70 + Math.random() * 30}%`,
                }}
              />
            </li>
          ))}
        </ul>
      ) : conversations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm opacity-50">
          No conversations yet
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto space-y-0.5" role="listbox" aria-label="Conversations">
          {conversations.map((conv) => (
            <li
              key={conv.id}
              data-testid="conversation-item"
              data-active={activeConversationId === conv.id ? "true" : "false"}
              aria-current={activeConversationId === conv.id ? "page" : undefined}
              className={`group relative flex items-center px-2 py-2 rounded cursor-pointer text-sm transition-colors ${
                activeConversationId === conv.id
                  ? "bg-blue-500/10"
                  : "hover:bg-gray-500/10"
              }`}
              onClick={() => handleSelect(conv.id)}
            >
              {editingId === conv.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleRenameSubmit(conv.id)}
                  onKeyDown={(e) => handleRenameKeyDown(e, conv.id)}
                  className="flex-1 bg-transparent border border-blue-400 rounded px-1 py-0 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div
                    className="flex-1 min-w-0"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClick(conv);
                    }}
                  >
                    <span
                      className={`block truncate${conv.title ? "" : " italic opacity-50"}`}
                    >
                      {conv.title || "Untitled"}
                    </span>
                    <span
                      className="block text-xs opacity-40 truncate"
                      data-testid="conversation-time"
                    >
                      {formatRelativeTime(conv.updated_at)}
                    </span>
                  </div>

                  {confirmingDeleteId === conv.id ? (
                    <span
                      className="flex items-center gap-1 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>Delete?</span>
                      <button
                        data-testid={`confirm-delete-${conv.id}`}
                        className="text-red-500 hover:text-red-700 active:scale-95 font-medium transition-all duration-150 flex items-center gap-1"
                        onClick={() => handleConfirmDelete(conv.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === conv.id ? (
                          <svg
                            className="w-3 h-3 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeOpacity="0.25"
                            />
                            <path
                              d="M12 2 A10 10 0 0 1 22 12"
                              stroke="currentColor"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : null}
                        <span>Yes</span>
                      </button>
                      <button
                        className="hover:opacity-70 active:scale-95 font-medium transition-all duration-150"
                        onClick={handleCancelDelete}
                        disabled={deleteMutation.isPending}
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      data-testid={`delete-conversation-${conv.id}`}
                      className="touch-action-btn absolute right-2 opacity-0 group-hover:opacity-100 text-xs hover:text-red-500 active:scale-90 transition-all duration-150"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(conv.id);
                      }}
                      title="Delete conversation"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
