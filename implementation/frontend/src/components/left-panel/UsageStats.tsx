// Implements: spec/frontend/left_panel/usage_stats/plan.md
//
// Progress bar showing token usage with color states:
// normal (blue), warning (amber at 80%), limit (red at 100%).
// TanStack Query for GET /usage with 60s stale time.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/client";

interface UsageResponse {
  tokens_used: number;
  token_limit: number;
  window_reset_at: string;
  warning_threshold_pct: number;
}

function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    // Show decimal only if not a whole number
    return millions % 1 === 0 ? `${millions}M` : `${parseFloat(millions.toFixed(1))}M`;
  }
  if (n >= 1_000) {
    const thousands = n / 1_000;
    return thousands % 1 === 0 ? `${thousands}k` : `${parseFloat(thousands.toFixed(1))}k`;
  }
  return String(n);
}

function formatTokensFull(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

type BarState = "normal" | "warning" | "limit";

function getBarState(percent: number): BarState {
  if (percent >= 100) return "limit";
  if (percent >= 80) return "warning";
  return "normal";
}

const barColors: Record<BarState, string> = {
  normal: "bg-blue-500",
  warning: "bg-amber-500",
  limit: "bg-red-500",
};

export function UsageStats() {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiGet<UsageResponse>("/usage"),
    staleTime: 60_000,
  });

  if (!data) {
    return null;
  }

  const percent = Math.min((data.tokens_used / data.token_limit) * 100, 100);
  const barState = getBarState(percent);
  const remaining = Math.max(data.token_limit - data.tokens_used, 0);

  const compactLabel = `${formatTokensCompact(data.tokens_used)} / ${formatTokensCompact(data.token_limit)} tokens`;

  return (
    <div className="text-sm">
      <button
        data-testid="usage-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left"
      >
        {/* Progress bar track */}
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-1">
          <div
            data-testid="usage-progress-bar"
            data-state={barState}
            className={`h-full rounded-full transition-all ${barColors[barState]}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Compact label */}
        <span data-testid="usage-label" className="text-xs opacity-70">
          {compactLabel}
        </span>

        {barState === "limit" && (
          <span className="block text-xs text-red-500 font-medium mt-0.5">
            Daily limit reached
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div data-testid="usage-expanded" className="mt-2 text-xs space-y-1 opacity-70">
          <div>
            Used: {formatTokensFull(data.tokens_used)} tokens
          </div>
          <div>
            Remaining: {formatTokensFull(remaining)} tokens
          </div>
          <div>
            Resets: {new Date(data.window_reset_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
