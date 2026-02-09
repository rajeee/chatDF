// SearchBar component for searching/filtering messages within a conversation.
// Appears at the top of the message list when activated via Ctrl/Cmd+Shift+F.
// Debounces input by 150ms, shows match count, and supports Escape to close.

import { useRef, useEffect, useCallback, useState } from "react";
import { useChatStore } from "@/stores/chatStore";

export function SearchBar() {
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const messages = useChatStore((s) => s.messages);

  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus when mounted
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sync local value when store query changes externally (e.g., on close/reset)
  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  // Debounced update to the store
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 150);
    },
    [setSearchQuery]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setSearchOpen(false);
  }, [setSearchOpen]);

  // Escape key closes search
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [handleClose]
  );

  // Count matches
  const matchCount =
    searchQuery.length > 0
      ? messages.filter((m) =>
          m.content.toLowerCase().includes(searchQuery.toLowerCase())
        ).length
      : 0;

  return (
    <div
      data-testid="search-bar"
      className="search-bar-enter px-2 sm:px-4 pt-2"
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        }}
      >
        {/* Magnifying glass icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          ref={inputRef}
          data-testid="search-input"
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          aria-label="Search messages"
          className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-50"
          style={{ color: "var(--color-text)" }}
        />

        {/* Match count */}
        {searchQuery.length > 0 && (
          <span
            data-testid="search-match-count"
            className="text-xs whitespace-nowrap"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {matchCount} {matchCount === 1 ? "match" : "matches"}
          </span>
        )}

        {/* Close button */}
        <button
          data-testid="search-close-btn"
          onClick={handleClose}
          className="p-0.5 rounded hover:bg-gray-500/10 active:scale-90 transition-all duration-150"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Close search"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
