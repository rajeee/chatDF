---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Usage Stats Plan

## Component Structure

Implements: [spec.md#default-view-collapsed](./spec.md#default-view-collapsed), [spec.md#expanded-view](./spec.md#expanded-view)

File: `frontend/src/components/left-panel/UsageStats.tsx`

```
<UsageStats>
  <button onClick={toggleExpanded}>     # clickable section header
    <ProgressBar percent={percent} state={barState} />
    <span>{label}</span>                 # e.g. "1.2M / 5M tokens"
  </button>
  {expanded &&
    <ExpandedDetails
      used={tokensUsed}
      remaining={tokensRemaining}
      resetsIn={resetCountdown}
    />
  }
</UsageStats>
```

## Data Fetching

Implements: [spec.md#updates](./spec.md#updates)

- Initial load via TanStack Query: `useQuery({ queryKey: ["usage"], queryFn: fetchUsage })`. Stale time: 60 seconds.
- Real-time updates via WebSocket events (`usage_update`) routed through `useWebSocket` hook. On `usage_update`, the hook calls `queryClient.setQueryData(["usage"], newData)` to update the cache directly (no refetch needed).
- On `rate_limit_warning` event: same cache update, which triggers re-render with new bar state.

## Progress Bar States

Implements: [spec.md#progress-bar-states](./spec.md#progress-bar-states)

- Computed from `percent = (tokensUsed / 5_000_000) * 100`.
- State derived in component:
  - `percent < 80` → `"normal"` → Tailwind class `bg-blue-500`
  - `80 <= percent < 100` → `"warning"` → `bg-amber-500`
  - `percent >= 100` → `"limit"` → `bg-red-500` + text "Daily limit reached"
- Bar rendered as a `<div>` with `width: ${percent}%` inside a track `<div>`.

## Expanded View

Implements: [spec.md#expanded-view](./spec.md#expanded-view)

- Local state `expanded: boolean`, toggled by clicking the usage section.
- Shows formatted numbers using `Intl.NumberFormat` (e.g., "1,245,320").
- "Resets in" countdown: computed from `resetTime` returned by the API. Updated every minute via `setInterval` while expanded. Formatted as "Xh Ym".

## Number Formatting

- Helper function `formatTokens(n: number): string` in component file.
- For the compact label: values over 1M shown as "X.XM", under 1M as "XXXk".

## Scope

### In Scope
- Usage display, progress bar, expanded details
- TanStack Query + WebSocket hybrid data strategy

### Out of Scope
- Rate limiting enforcement (backend)
- WebSocket connection management (handled by useWebSocket hook)
