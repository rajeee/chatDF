// Implements: spec/frontend/chat_area/loading_states/plan.md
//
// Three-phase loading indicator shown within assistant message bubbles.
// Props-driven (no store dependencies). Handles timeout detection internally.
// Color-coded phases: thinking (violet), executing (blue), formatting (green).

import { useState, useEffect, useRef } from "react";

interface LoadingStatesProps {
  phase: "thinking" | "executing" | "formatting";
  phaseStartTime: number;
}

const PHASES = ["thinking", "executing", "formatting"] as const;

const PHASE_CONFIG: Record<
  string,
  { label: string; color: string; darkColor: string }
> = {
  thinking: { label: "Thinking...", color: "#7c3aed", darkColor: "#a78bfa" },
  executing: { label: "Running query...", color: "#2563eb", darkColor: "#60a5fa" },
  formatting: { label: "Preparing response...", color: "#059669", darkColor: "#34d399" },
};

const DELAY_THRESHOLD_MS = 30_000;
const TIMEOUT_THRESHOLD_MS = 60_000;

function ThinkingIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="loading-dots"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7l1 4h4l1-4c2-1.5 4-4 4-7a7 7 0 0 0-7-7z" />
      <line x1="10" y1="22" x2="14" y2="22" />
    </svg>
  );
}

function ExecutingIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="loading-spinner"
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
    </svg>
  );
}

function FormattingIcon({ color }: { color: string }) {
  return (
    <svg
      data-testid="loading-spinner"
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
    </svg>
  );
}

function PhaseProgress({
  currentPhase,
}: {
  currentPhase: "thinking" | "executing" | "formatting";
}) {
  const currentIdx = PHASES.indexOf(currentPhase);
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  return (
    <div data-testid="phase-progress" className="flex items-center gap-1">
      {PHASES.map((p, i) => {
        const config = PHASE_CONFIG[p];
        const isCompleted = i < currentIdx;
        const isActive = i === currentIdx;
        const color = isDark ? config.darkColor : config.color;

        return (
          <div key={p} className="flex items-center gap-1">
            <div
              data-testid={`phase-step-${p}`}
              className="rounded-full transition-all duration-300"
              style={{
                width: isActive ? 16 : 6,
                height: 6,
                backgroundColor: isCompleted || isActive ? color : "var(--color-border)",
                opacity: isCompleted ? 0.5 : 1,
              }}
            />
            {i < PHASES.length - 1 && (
              <div
                className="transition-colors duration-300"
                style={{
                  width: 8,
                  height: 1,
                  backgroundColor: isCompleted ? color : "var(--color-border)",
                  opacity: isCompleted ? 0.5 : 0.3,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LoadingStates({ phase, phaseStartTime }: LoadingStatesProps) {
  const [isDelayed, setIsDelayed] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

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

  const config = PHASE_CONFIG[phase];
  const phaseColor = isDark ? config.darkColor : config.color;
  const label = isDelayed ? "Taking longer than expected..." : config.label;

  const icon =
    phase === "thinking" ? (
      <ThinkingIcon color={phaseColor} />
    ) : phase === "executing" ? (
      <ExecutingIcon color={phaseColor} />
    ) : (
      <FormattingIcon color={phaseColor} />
    );

  return (
    <div data-testid="loading-states" className="flex flex-col gap-1.5">
      <div
        className="inline-flex items-center gap-2 text-sm rounded-full px-3 py-1 w-fit"
        style={{
          color: phaseColor,
          backgroundColor: `${phaseColor}12`,
        }}
      >
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <PhaseProgress currentPhase={phase} />
    </div>
  );
}
