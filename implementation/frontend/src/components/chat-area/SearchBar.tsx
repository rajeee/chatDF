// SearchBar component for searching/filtering messages within a conversation.
// Appears at the top of the message list when activated via Ctrl/Cmd+Shift+F.
// Debounces input by 150ms, shows match count with prev/next navigation,
// and supports Enter/Shift+Enter to jump between matches.

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";

/** Scroll to a matched message and briefly highlight it. */
function scrollToMatch(messageId: string) {
  const el = document.querySelector(`[data-testid="message-row-${messageId}"]`);
  if (!el) return;
  el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  // Brief highlight pulse
  el.classList.add("search-focus-ring");
  setTimeout(() => el.classList.remove("search-focus-ring"), 1500);
}

export function SearchBar() {
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const messages = useChatStore((s) => s.messages);

  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(searchQuery);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute matched message IDs
  const matchedIds = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchQuery]);

  const matchCount = matchedIds.length;

  // Reset index and scroll to first match when matches change
  useEffect(() => {
    if (matchCount > 0) {
      setCurrentIndex(0);
      scrollToMatch(matchedIds[0]);
    } else {
      setCurrentIndex(-1);
    }
  }, [matchCount, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const goToNext = useCallback(() => {
    if (matchCount === 0) return;
    const next = currentIndex + 1 >= matchCount ? 0 : currentIndex + 1;
    setCurrentIndex(next);
    scrollToMatch(matchedIds[next]);
  }, [matchCount, currentIndex, matchedIds]);

  const goToPrev = useCallback(() => {
    if (matchCount === 0) return;
    const prev = currentIndex - 1 < 0 ? matchCount - 1 : currentIndex - 1;
    setCurrentIndex(prev);
    scrollToMatch(matchedIds[prev]);
  }, [matchCount, currentIndex, matchedIds]);

  // Keyboard: Escape closes, Enter goes next, Shift+Enter goes prev
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        goToNext();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        goToPrev();
      }
    },
    [handleClose, goToNext, goToPrev]
  );

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

        {/* Match count + navigation */}
        {searchQuery.length > 0 && (
          <div className="flex items-center gap-1">
            <span
              data-testid="search-match-count"
              className="text-xs whitespace-nowrap tabular-nums"
              style={{ color: matchCount > 0 ? "var(--color-text-secondary)" : "var(--color-error)" }}
            >
              {matchCount > 0
                ? `${currentIndex + 1} of ${matchCount}`
                : "No matches"}
            </span>

            {/* Prev / Next buttons */}
            <button
              data-testid="search-prev-btn"
              onClick={goToPrev}
              disabled={matchCount === 0}
              className="p-0.5 rounded hover:bg-gray-500/10 active:scale-90 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              data-testid="search-next-btn"
              onClick={goToNext}
              disabled={matchCount === 0}
              className="p-0.5 rounded hover:bg-gray-500/10 active:scale-90 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Next match"
              title="Next match (Enter)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
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
