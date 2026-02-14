// Standalone thinking indicator bubble displayed in the message list
// when the AI is processing (loadingPhase === "thinking") before any
// streaming tokens arrive. Gives immediate visual feedback after the
// user sends a message.

export function ThinkingBubble() {
  return (
    <div
      data-testid="thinking-bubble"
      className="flex flex-col items-start message-appear"
    >
      <div
        className="thinking-indicator relative max-w-[80%] rounded-lg px-4 py-2 overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 1px 2px var(--color-shadow)",
        }}
      >
        {/* Shimmer sweep background */}
        <div
          className="thinking-indicator-shimmer absolute inset-0 pointer-events-none"
          aria-hidden="true"
        />
        {/* Animated dots */}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
            style={{
              backgroundColor: "var(--color-text-secondary, var(--color-text))",
              opacity: 0.5,
              animationDelay: "0ms",
              animationDuration: "1.2s",
            }}
          />
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
            style={{
              backgroundColor: "var(--color-text-secondary, var(--color-text))",
              opacity: 0.5,
              animationDelay: "200ms",
              animationDuration: "1.2s",
            }}
          />
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
            style={{
              backgroundColor: "var(--color-text-secondary, var(--color-text))",
              opacity: 0.5,
              animationDelay: "400ms",
              animationDuration: "1.2s",
            }}
          />
        </div>
      </div>
    </div>
  );
}
