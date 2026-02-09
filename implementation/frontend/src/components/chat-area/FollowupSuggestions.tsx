import { memo, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";

interface FollowupSuggestionsProps {
  onSendPrompt: (text: string) => void;
}

function FollowupSuggestionsComponent({ onSendPrompt }: FollowupSuggestionsProps) {
  const suggestions = useChatStore((s) => s.followupSuggestions);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const handleClick = useCallback(
    (suggestion: string) => {
      useChatStore.getState().setFollowupSuggestions([]);
      onSendPrompt(suggestion);
    },
    [onSendPrompt]
  );

  if (suggestions.length === 0 || isStreaming) return null;

  return (
    <div
      data-testid="followup-suggestions"
      className="flex flex-wrap gap-2 px-4 pb-2 justify-center"
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          data-testid={`followup-${index}`}
          className="px-3 py-1.5 rounded-full text-xs cursor-pointer transition-colors"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={() => handleClick(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

export const FollowupSuggestions = memo(FollowupSuggestionsComponent);
