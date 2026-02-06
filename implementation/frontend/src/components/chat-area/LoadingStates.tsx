// Implements: spec/frontend/chat_area/loading_states/plan.md
//
// Three-phase loading indicator shown within assistant message bubbles.
// Props-driven (no store dependencies). Handles timeout detection internally.

import { useState, useEffect, useRef } from "react";

interface LoadingStatesProps {
  phase: "thinking" | "executing" | "formatting";
  phaseStartTime: number;
}

const PHASE_LABELS: Record<string, string> = {
  thinking: "Thinking...",
  executing: "Running query...",
  formatting: "Preparing response...",
};

const DELAY_THRESHOLD_MS = 30_000;
const TIMEOUT_THRESHOLD_MS = 60_000;

export function LoadingStates({ phase, phaseStartTime }: LoadingStatesProps) {
  const [isDelayed, setIsDelayed] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset states when phase or phaseStartTime changes
    setIsDelayed(false);
    setIsTimedOut(false);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - phaseStartTime;
      if (elapsed >= TIMEOUT_THRESHOLD_MS) {
        setIsTimedOut(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      } else if (elapsed >= DELAY_THRESHOLD_MS) {
        setIsDelayed(true);
      }
    }, 1_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [phase, phaseStartTime]);

  if (isTimedOut) {
    return (
      <div data-testid="loading-timeout-error" className="flex items-center gap-2 text-sm" style={{ color: "var(--color-error)" }}>
        <span>Request timed out. Please try again.</span>
      </div>
    );
  }

  const label = isDelayed ? "Taking longer than expected..." : PHASE_LABELS[phase];

  return (
    <div data-testid="loading-states" className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text)", opacity: 0.7 }}>
      {phase === "thinking" ? (
        <span data-testid="loading-dots" className="inline-flex gap-0.5">
          <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
        </span>
      ) : (
        <svg
          data-testid="loading-spinner"
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
}
