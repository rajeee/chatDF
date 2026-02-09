// Implements: spec/frontend/left_panel/chat_history/plan.md
//
// Conversation list with selection, inline rename, delete with confirmation.
// TanStack Query for GET /conversations, sorted by updated_at desc.
// Supports pinning conversations to the top of the sidebar.
// Virtualizes the list when 40+ conversations for scroll performance.

import { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue } from "react";
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
import { getDateGroup } from "@/utils/dateGroups";

interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  dataset_count: number;
  message_count: number;
  last_message_preview: string | null;
  is_pinned?: boolean;
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
}

/** Inline SVG pin icon (thumbtack). */
function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7" />
      <path d="M5 11h14l-1.5 6h-11z" />
    </svg>
  );
}

/** Threshold for enabling virtualization (total flat items including headers). */
const VIRTUAL_THRESHOLD = 40;
/** Estimated height in px for a conversation item. */
const ITEM_HEIGHT = 64;
/** Estimated height in px for a group header. */
const HEADER_HEIGHT = 28;
/** Number of extra items rendered above/below the visible window. */
const BUFFER_SIZE = 5;

/**
 * Lightweight scroll-based virtualization hook.
 * Only activates when `enabled` is true (i.e. item count >= threshold).
 * Returns the visible slice indices and spacer heights.
 */
function useVirtualList(
  containerRef: React.RefObject<HTMLElement | null>,
  items: ReadonlyArray<{ type: "header" | "conversation" }>,
  enabled: boolean,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const handleScroll = () => setScrollTop(el.scrollTop);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    el.addEventListener("scroll", handleScroll, { passive: true });
    observer.observe(el);
    setContainerHeight(el.clientHeight);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, [containerRef, enabled]);

  // Pre-compute cumulative heights so mixed header/item sizes are handled.
  const cumulativeHeights = useMemo(() => {
    const heights: number[] = [];
    let total = 0;
    for (const item of items) {
      total += item.type === "header" ? HEADER_HEIGHT : ITEM_HEIGHT;
      heights.push(total);
    }
    return heights;
  }, [items]);

  const totalHeight = cumulativeHeights.length > 0 ? cumulativeHeights[cumulativeHeights.length - 1] : 0;

  if (!enabled) {
    return {
      startIndex: 0,
      endIndex: items.length,
      topPadding: 0,
      bottomPadding: 0,
      totalHeight,
    };
  }

  // Binary search for the first item whose cumulative bottom edge > scrollTop.
  let lo = 0;
  let hi = cumulativeHeights.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulativeHeights[mid] <= scrollTop) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const firstVisible = lo;

  // Find last item whose top edge < scrollTop + containerHeight.
  const bottomEdge = scrollTop + containerHeight;
  let lastVisible = firstVisible;
  while (lastVisible < cumulativeHeights.length - 1 && (cumulativeHeights[lastVisible] - (items[lastVisible].type === "header" ? HEADER_HEIGHT : ITEM_HEIGHT)) < bottomEdge) {
    lastVisible++;
  }

  const startIndex = Math.max(0, firstVisible - BUFFER_SIZE);
  const endIndex = Math.min(items.length, lastVisible + BUFFER_SIZE + 1);
  const topPadding = startIndex > 0 ? cumulativeHeights[startIndex - 1] : 0;
  const bottomPadding = Math.max(0, totalHeight - cumulativeHeights[endIndex - 1]);

  return { startIndex, endIndex, topPadding, bottomPadding, totalHeight };
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

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchStale = searchQuery !== deferredSearchQuery;

  const filteredConversations = deferredSearchQuery.trim()
    ? conversations.filter((conv) => {
        const query = deferredSearchQuery.toLowerCase();
        return (
          conv.title.toLowerCase().includes(query) ||
          (conv.last_message_preview?.toLowerCase().includes(query) ?? false)
        );
      })
    : conversations;

  interface ConversationGroup {
    label: string;
    conversations: ConversationSummary[];
  }

  const groupedConversations = useMemo(() => {
    const groups: ConversationGroup[] = [];

    // Separate pinned from non-pinned
    const pinned = filteredConversations.filter((c) => c.is_pinned);
    const unpinned = filteredConversations.filter((c) => !c.is_pinned);

    // Add "Pinned" group first if there are pinned conversations
    if (pinned.length > 0) {
      groups.push({ label: "Pinned", conversations: pinned });
    }

    // Group remaining conversations by date
    const groupOrder = ["Today", "Yesterday", "This Week", "This Month", "Older"];
    const grouped = new Map<string, ConversationSummary[]>();

    for (const conv of unpinned) {
      const group = getDateGroup(conv.updated_at);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)!.push(conv);
    }

    for (const label of groupOrder) {
      const convs = grouped.get(label);
      if (convs && convs.length > 0) {
        groups.push({ label, conversations: convs });
      }
    }

    return groups;
  }, [filteredConversations]);

  type FlatItem =
    | { type: "header"; label: string }
    | { type: "conversation"; conv: ConversationSummary };

  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];
    for (const group of groupedConversations) {
      items.push({ type: "header", label: group.label });
      for (const conv of group.conversations) {
        items.push({ type: "conversation", conv });
      }
    }
    return items;
  }, [groupedConversations]);

  const listRef = useRef<HTMLUListElement>(null);
  const virtualEnabled = flatItems.length >= VIRTUAL_THRESHOLD;
  const { startIndex, endIndex, topPadding, bottomPadding } = useVirtualList(
    listRef,
    flatItems,
    virtualEnabled,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  const editInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveConversation(id);
      // On mobile (<1024px), close the left panel overlay after selecting
      if (leftPanelOpen && window.innerWidth < 1024) {
        toggleLeftPanel();
      }
    },
    [setActiveConversation, leftPanelOpen, toggleLeftPanel],
  );

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const conversationIds = useMemo(
    () =>
      flatItems
        .filter((i): i is Extract<FlatItem, { type: "conversation" }> => i.type === "conversation")
        .map((i) => i.conv.id),
    [flatItems],
  );

  // Reset focused index when the list or search changes
  useEffect(() => {
    setFocusedIndex(null);
  }, [searchQuery, flatItems]);

  // Keyboard handler for the list
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (conversationIds.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, conversationIds.length - 1);
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
      } else if (e.key === "Enter") {
        if (focusedIndex !== null && focusedIndex < conversationIds.length) {
          handleSelect(conversationIds[focusedIndex]);
        }
      } else if (e.key === "Escape") {
        setFocusedIndex(null);
      }
    },
    [conversationIds, focusedIndex, handleSelect],
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex < conversationIds.length) {
      const el = itemRefs.current.get(conversationIds[focusedIndex]);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex, conversationIds]);

  // On list focus, set focusedIndex to the active conversation or first item
  const handleListFocus = useCallback(() => {
    if (focusedIndex !== null) return; // already has focus position
    if (activeConversationId) {
      const idx = conversationIds.indexOf(activeConversationId);
      if (idx !== -1) {
        setFocusedIndex(idx);
        return;
      }
    }
    // Don't auto-set — wait for arrow key
  }, [focusedIndex, activeConversationId, conversationIds]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (activeConversationId) {
      const el = itemRefs.current.get(activeConversationId);
      if (el) {
        requestAnimationFrame(() => {
          if (typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }
    }
  }, [activeConversationId]);

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiPatch(`/conversations/${id}`, { title }),
    onMutate: async ({ id, title }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<ConversationsResponse>(["conversations"]);

      // Optimistically update title in cache
      queryClient.setQueryData<ConversationsResponse>(["conversations"], (old) => {
        if (!old) return old;
        return {
          ...old,
          conversations: old.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        };
      });

      // Close the edit input immediately for snappy feel
      setEditingId(null);

      return { previousData };
    },
    onSuccess: () => {
      success("Conversation renamed");
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["conversations"], context.previousData);
      }
      showError("Failed to rename conversation");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
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

  const pinMutation = useMutation({
    mutationFn: ({ id, is_pinned }: { id: string; is_pinned: boolean }) =>
      apiPatch(`/conversations/${id}/pin`, { is_pinned }),
    onMutate: async ({ id, is_pinned }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<ConversationsResponse>(["conversations"]);

      // Optimistically update
      queryClient.setQueryData<ConversationsResponse>(["conversations"], (old) => {
        if (!old) return old;
        return {
          ...old,
          conversations: old.conversations.map((c) =>
            c.id === id ? { ...c, is_pinned } : c
          ),
        };
      });

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["conversations"], context.previousData);
      }
      showError("Failed to update pin");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<ConversationSummary>("/conversations"),
    onSuccess: (newConv) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConversation(newConv.id);
      setSearchQuery("");
    },
  });

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

  function handlePinToggle(conv: ConversationSummary) {
    pinMutation.mutate({ id: conv.id, is_pinned: !conv.is_pinned });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <button
        data-testid="new-chat-button"
        onClick={() => createMutation.mutate()}
        title="New conversation"
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

      {conversations.length >= 2 && (
        <div className="relative mb-2">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            data-testid="conversation-search"
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
                e.currentTarget.blur();
              }
            }}
            className="w-full pl-7 pr-7 py-1 text-xs rounded border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-text)",
            }}
            aria-label="Search conversations"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-500/20 transition-colors"
              aria-label="Clear search"
              data-testid="conversation-search-clear"
            >
              <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

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
      ) : filteredConversations.length === 0 && searchQuery ? (
        <div className="flex-1 flex items-center justify-center text-sm opacity-50">
          No matches
        </div>
      ) : (
        <ul ref={listRef} className={`flex-1 overflow-y-auto outline-none transition-opacity duration-150${isSearchStale ? " opacity-70" : ""}`} role="listbox" aria-label="Conversations" tabIndex={0} onKeyDown={handleListKeyDown} onFocus={handleListFocus}>
          {topPadding > 0 && <li aria-hidden="true" style={{ height: topPadding }} />}
          {flatItems.slice(startIndex, endIndex).map((item, visibleIdx) => {
            if (item.type === "header") {
              return (
                <li key={`hdr-${item.label}`} role="group" aria-label={item.label}>
                  <div className="text-xs uppercase tracking-wide opacity-40 px-2 pt-3 pb-1 select-none" style={{ color: "var(--color-text)" }}>
                    {item.label}
                  </div>
                </li>
              );
            }
            const conv = item.conv;
            const isKeyboardFocused = focusedIndex !== null && conversationIds[focusedIndex] === conv.id;
            return (
              <li
                key={conv.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(conv.id, el);
                  else itemRefs.current.delete(conv.id);
                }}
                data-testid="conversation-item"
                data-pinned={conv.is_pinned ? "true" : "false"}
                data-active={activeConversationId === conv.id ? "true" : "false"}
                data-keyboard-focus={isKeyboardFocused ? "true" : undefined}
                aria-current={activeConversationId === conv.id ? "page" : undefined}
                className={`group relative flex items-center px-2 py-2 rounded cursor-pointer text-sm transition-all duration-150 border-l-2 ${deferredSearchQuery ? "list-item-enter" : ""} ${
                  activeConversationId === conv.id
                    ? "border-[var(--color-accent)] bg-blue-500/10"
                    : conv.is_pinned
                      ? "border-blue-400/50 hover:bg-gray-500/10 hover:translate-y-[-1px] hover:shadow-sm"
                      : "border-transparent hover:bg-gray-500/10 hover:translate-y-[-1px] hover:shadow-sm"
                }${isKeyboardFocused ? " ring-1 ring-[var(--color-accent)]/40" : ""}`}
                style={deferredSearchQuery ? { animationDelay: `${visibleIdx * 20}ms` } : undefined}
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
                        {conv.is_pinned && (
                          <PinIcon className="w-3 h-3 inline-block mr-1 opacity-50 -mt-0.5" />
                        )}
                        {conv.title || "Untitled"}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs opacity-40">
                        <span
                          className="truncate"
                          data-testid="conversation-time"
                        >
                          {formatRelativeTime(conv.updated_at)}
                        </span>
                        {conv.message_count > 0 && (
                          <span
                            data-testid="message-count-badge"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] leading-4 font-medium shrink-0"
                            style={{
                              backgroundColor: "var(--color-border)",
                              color: "var(--color-text-muted, var(--color-text))",
                            }}
                          >
                            <svg
                              className="w-2.5 h-2.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            {conv.message_count}
                          </span>
                        )}
                      </span>
                      {conv.last_message_preview && (
                        <span
                          className="block text-xs opacity-30 truncate mt-0.5"
                          data-testid="conversation-preview"
                        >
                          {conv.last_message_preview}
                        </span>
                      )}
                    </div>

                    {confirmingDeleteId === conv.id ? (
                      <span
                        className="flex items-center gap-1 text-xs animate-fade-in"
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
                      <span className="flex items-center gap-0.5 absolute right-2">
                        <button
                          data-testid={`pin-conversation-${conv.id}`}
                          className={`touch-action-btn text-xs active:scale-90 transition-all duration-150 ${
                            conv.is_pinned
                              ? "opacity-50 hover:opacity-80 text-blue-400"
                              : "opacity-0 group-hover:opacity-100 hover:text-blue-400"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePinToggle(conv);
                          }}
                          title={conv.is_pinned ? "Unpin conversation" : "Pin conversation"}
                        >
                          <PinIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          data-testid={`delete-conversation-${conv.id}`}
                          className="touch-action-btn opacity-0 group-hover:opacity-100 text-xs hover:text-red-500 active:scale-90 transition-all duration-150"
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
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
          {bottomPadding > 0 && <li aria-hidden="true" style={{ height: bottomPadding }} />}
        </ul>
      )}
    </div>
  );
}
