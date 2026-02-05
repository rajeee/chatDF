---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Usage Stats Specification

## Scope

### In Scope
- Token usage display
- Progress bar behavior
- Warning and limit states
- Expandable details

### Out of Scope
- Rate limiting logic (see backend/rate_limiting/spec.md)
- Token counting implementation (see backend/llm/spec.md)

### Assumptions
- Usage data fetched via REST API on panel load and updated via WebSocket during conversation

## Behavior

### Default View (Collapsed)
- Shows daily token usage as a horizontal progress bar
- Bar label: percentage used or fraction (e.g., "1.2M / 5M tokens")
- Token limit: 5,000,000 tokens/day for all users

### Progress Bar States
- **Normal** (0-80%): Default theme color (blue/accent)
- **Warning** (80-99%): Warning color (amber/yellow)
- **Limit reached** (100%): Red bar + text message "Daily limit reached"

### Expanded View
- Click/tap the usage section to expand details
- Expanded shows:
  - Tokens used today: formatted number (e.g., "1,245,320")
  - Tokens remaining: formatted number
  - Resets in: countdown (e.g., "Resets in 4h 23m")
- Click again to collapse back to progress bar only

### Rolling Window
- 24-hour rolling window (not calendar day)
- Reset time calculated from oldest token usage record in window

### Updates
- Usage updates in real-time as chat responses stream in
- WebSocket `rate_limit_warning` messages trigger bar state changes
- No polling needed — server pushes usage updates
