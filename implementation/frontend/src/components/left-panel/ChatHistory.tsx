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

  const { data } = useQuery({
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

  function handleSelect(id: string) {
    setActiveConversation(id);
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
        className="mb-2 px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
      >
        + New Chat
      </button>

      {conversations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm opacity-50">
          No conversations yet
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto space-y-0.5">
          {conversations.map((conv) => (
            <li
              key={conv.id}
              data-testid="conversation-item"
              data-active={activeConversationId === conv.id ? "true" : "false"}
              className={`group relative flex items-center px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
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
                  className="flex-1 bg-transparent border border-blue-400 rounded px-1 py-0 text-sm outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span
                    className="flex-1 truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClick(conv);
                    }}
                  >
                    {conv.title}
                  </span>

                  {confirmingDeleteId === conv.id ? (
                    <span
                      className="flex items-center gap-1 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>Delete?</span>
                      <button
                        className="text-red-500 hover:text-red-700 font-medium"
                        onClick={() => handleConfirmDelete(conv.id)}
                      >
                        Yes
                      </button>
                      <button
                        className="hover:opacity-70 font-medium"
                        onClick={handleCancelDelete}
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      data-testid={`delete-conversation-${conv.id}`}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 text-xs hover:text-red-500 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(conv.id);
                      }}
                    >
                      X
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
