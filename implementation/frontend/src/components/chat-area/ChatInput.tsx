// Implements: spec/frontend/chat_area/chat_input/plan.md
//
// Auto-resizing textarea with Enter to send, Shift+Enter for newline,
// 2000 char limit with counter at 1800+, send/stop button toggle,
// disabled when daily rate limit reached.

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useChatStore } from "@/stores/chatStore";
import { QueryHistoryDropdown } from "./QueryHistoryDropdown";

const CHAR_LIMIT = 2000;
const CHAR_COUNTER_THRESHOLD = 1800;

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
}

// Expose textarea element, send functionality, and input value setter
export interface ChatInputHandle {
  focus: () => void;
  sendMessage: () => void;
  setInputValue: (value: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  ({ onSend, onStop }, ref) => {
    const [inputValue, setInputValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isStreaming = useChatStore((s) => s.isStreaming);
    const dailyLimitReached = useChatStore((s) => s.dailyLimitReached);
    const loadingPhase = useChatStore((s) => s.loadingPhase);

    const charCount = inputValue.length;
    const trimmedEmpty = inputValue.trim().length === 0;
    const isSending = loadingPhase === "thinking" && !isStreaming;
    const isReady = !trimmedEmpty && !dailyLimitReached && !isSending;

    // Auto-focus on mount
    useEffect(() => {
      textareaRef.current?.focus();
    }, []);

  // Auto-resize textarea height
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, CHAR_LIMIT);
    setInputValue(value);
    // Defer resize to after state update
    requestAnimationFrame(resizeTextarea);
  };

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || dailyLimitReached) return;
    onSend(trimmed);
    setInputValue("");
    // Reset textarea height after clearing and re-focus
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.focus();
      }
    });
  }, [inputValue, dailyLimitReached, onSend]);

  // Expose focus, sendMessage, and setInputValue methods to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      sendMessage: handleSend,
      setInputValue: (value: string) => {
        setInputValue(value);
        requestAnimationFrame(resizeTextarea);
      },
    }),
    [handleSend, resizeTextarea]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        handleSend();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      textareaRef.current?.blur();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData("text/plain");
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = inputValue;
    const newValue = currentValue.slice(0, start) + pastedText + currentValue.slice(end);

    if (newValue.length > CHAR_LIMIT) {
      e.preventDefault();
      const truncated = newValue.slice(0, CHAR_LIMIT);
      setInputValue(truncated);
      requestAnimationFrame(resizeTextarea);
    }
  };

  const placeholder = dailyLimitReached
    ? "Daily limit reached"
    : "Ask a question about your data... (⏎ to send • ⇧⏎ for new line)";

  const showCounter = charCount > CHAR_COUNTER_THRESHOLD;

  // Progressive color warning based on character count
  const getCounterColor = () => {
    if (charCount >= 1950) return "text-red-500"; // Very close to limit
    if (charCount >= 1900) return "text-orange-500"; // Warning zone
    return "text-gray-500"; // Normal
  };

  const formattedCount = charCount.toLocaleString();
  const formattedLimit = CHAR_LIMIT.toLocaleString();

  const handleSelectQuery = useCallback((query: string) => {
    setInputValue(query);
    requestAnimationFrame(() => {
      resizeTextarea();
      textareaRef.current?.focus();
    });
  }, [resizeTextarea]);

    return (
      <div className="relative flex flex-col gap-1">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            aria-label="Message input"
            className="flex-1 resize-none rounded-lg border px-2 py-1.5 sm:px-3 sm:py-2 text-sm max-h-[7.5rem] overflow-y-auto focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] focus:outline-none transition-shadow"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-text)",
            }}
            rows={1}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={dailyLimitReached}
          />

          <QueryHistoryDropdown
            onSelectQuery={handleSelectQuery}
            disabled={dailyLimitReached || isStreaming}
          />

          {isStreaming ? (
            <button
              type="button"
              aria-label="Stop generating"
              title="Stop generating (Esc)"
              className="flex-shrink-0 rounded-lg p-2 transition-all duration-150 hover:bg-[var(--color-error)]/10 active:scale-95"
              onClick={onStop}
            >
              {/* Square stop icon */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="4" y="4" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              title="Send message (⏎)"
              className={`flex-shrink-0 rounded-lg p-2 transition-all duration-150 hover:bg-[var(--color-accent)]/10 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${isReady ? "send-btn-glow" : ""}`}
              onClick={handleSend}
              disabled={trimmedEmpty || dailyLimitReached || isSending}
              data-sending={isSending}
            >
              {isSending ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="animate-spin"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M3.105 2.289a.75.75 0 0 1 .814.073l13 10a.75.75 0 0 1 0 1.176l-13 10A.75.75 0 0 1 2.75 23V1a.75.75 0 0 1 .355-.711Z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {showCounter && (
          <span
            data-testid="char-counter"
            className={`text-xs text-right transition-all duration-300 animate-fade-in ${getCounterColor()}`}
          >
            {formattedCount} / {formattedLimit}
          </span>
        )}
      </div>
    );
  }
);

ChatInput.displayName = "ChatInput";
