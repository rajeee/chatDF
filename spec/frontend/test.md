---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Frontend Test Specification

## Scope

### In Scope
- Three-panel layout rendering and structure
- Routing between sign-in and protected app shell
- Zustand store behavior on conversation switching
- WebSocket event routing to correct stores
- Theme application across all components
- Responsive layout at desktop and tablet breakpoints

### Out of Scope
- Individual component internals (see child test specs)
- Backend API behavior
- E2E user flows (see e2e test spec)

---

## 1. Three-Panel Layout

Tests: [spec.md#layout](./spec.md#layout)

### 1.1 Layout Structure

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-L-01 | App shell renders three panels | Left panel, chat area, and right panel all present in the DOM |
| FE-L-02 | Chat area fills remaining horizontal space | Chat area occupies all space between left and right panels |
| FE-L-03 | Right panel is always visible | Right panel rendered with fixed width (~280px), no collapse toggle |
| FE-L-04 | Left panel default width | Left panel renders at ~260px when expanded |
| FE-L-05 | Panels ordered correctly | Left panel first, chat area center, right panel last (DOM order) |

### 1.2 Panel Interaction

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-L-06 | Collapsing left panel expands chat area | When left panel collapses, chat area expands to fill freed space |
| FE-L-07 | Collapse animation duration | Left panel collapse/expand transition completes in ~200ms |
| FE-L-08 | Expand animation | Left panel slides in from left at ~260px width with smooth transition |

---

## 2. Routing

Tests: [spec.md](./spec.md), [plan.md#frontend-routing](../plan.md#frontend-routing)

### 2.1 Sign-In Route

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-R-01 | Unauthenticated user visits `/` | Redirected to `/sign-in` |
| FE-R-02 | Unauthenticated user visits `/sign-in` | Sign-in page renders (Google button, referral key field) |
| FE-R-03 | Sign-in page is public | No authentication required to view `/sign-in` |

### 2.2 Protected Route

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-R-04 | Authenticated user visits `/` | App shell renders with three-panel layout |
| FE-R-05 | Authenticated user visits `/sign-in` | Redirected to `/` (already signed in) |
| FE-R-06 | Session expires mid-use | User redirected to `/sign-in` on next API failure (401) |
| FE-R-07 | Unknown route visited | Redirects to `/` (authenticated) or `/sign-in` (unauthenticated) |

---

## 3. State Management

Tests: [spec.md](./spec.md), [plan.md#state-management-split](../plan.md#state-management-split)

### 3.1 Zustand Store Reset on Conversation Switch

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-S-01 | Switch from conversation A to B | `chatStore.messages` cleared and repopulated with conversation B messages |
| FE-S-02 | Switch conversation resets streaming state | `chatStore.isStreaming` set to `false`, `streamingTokens` cleared |
| FE-S-03 | Switch conversation resets datasets | `datasetStore.datasets` cleared and repopulated with conversation B datasets |
| FE-S-04 | Switch conversation resets SQL panel | `uiStore.sqlPanelOpen` set to `false`, `activeSqlContent` cleared |
| FE-S-05 | Active conversation ID updates | `chatStore.activeConversationId` reflects newly selected conversation |

### 3.2 TanStack Query Cache

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-S-06 | Conversations list stale after 30s | Re-fetches conversation list when data older than 30 seconds |
| FE-S-07 | User info cached for 5 minutes | Does not re-fetch `/auth/me` within 5-minute window |
| FE-S-08 | Mutation invalidates related queries | Creating a conversation invalidates `["conversations"]` query key |
| FE-S-09 | Deleting conversation invalidates list | Delete mutation triggers refetch of conversations list |

### 3.3 New Chat Store Behavior

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-S-10 | New Chat resets chat store | Chat store messages cleared, no active conversation ID |
| FE-S-11 | New Chat retains datasets | Dataset store keeps loaded datasets after New Chat |

---

## 4. WebSocket Event Routing

Tests: [plan.md#websocket-architecture](../plan.md#websocket-architecture)

### 4.1 Event Dispatch

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-W-01 | `chat_token` event received | Token appended to `chatStore.streamingTokens` |
| FE-W-02 | `chat_complete` event received | `chatStore.isStreaming` set to `false`, final message stored |
| FE-W-03 | `chat_error` event received | Error state set in `chatStore`, loading indicator replaced |
| FE-W-04 | `dataset_loaded` event received | Dataset updated in `datasetStore` with loaded state and schema |
| FE-W-05 | `dataset_error` event received | Dataset updated in `datasetStore` with error state and message |
| FE-W-06 | `usage_update` event received | Usage data updated, `["usage"]` TanStack query invalidated |
| FE-W-07 | `rate_limit_warning` event received | Warning state propagated to usage stats display |
| FE-W-08 | `query_status` event received | Loading state indicator in chat area transitions to correct phase |

### 4.2 Connection Lifecycle

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-W-09 | User authenticates | WebSocket connection opened with session token as query param |
| FE-W-10 | User logs out | WebSocket connection closed cleanly |
| FE-W-11 | Connection drops unexpectedly | Reconnect attempted with exponential backoff (1s, 2s, 4s, max 30s) |
| FE-W-12 | Reconnection succeeds | Stores receive events normally after reconnect |

---

## 5. Theme Application

Tests: [spec.md#theme](./spec.md#theme), [theme/spec.md](./theme/spec.md)

### 5.1 Theme Rendering

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-T-01 | Light mode applied | `<html>` element does NOT have `dark` class; light colors visible |
| FE-T-02 | Dark mode applied | `<html>` element has `dark` class; dark colors visible |
| FE-T-03 | System mode follows OS light | When OS is light, app renders in light mode |
| FE-T-04 | System mode follows OS dark | When OS is dark, app renders in dark mode |
| FE-T-05 | Theme persisted in localStorage | Selected theme mode saved; survives page reload |
| FE-T-06 | No saved preference defaults to System | First-time visitor gets System mode |

### 5.2 Theme Switching

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-T-07 | Switch light to dark | All panels update colors immediately, no page reload |
| FE-T-08 | Switch theme during streaming | Streaming message and loading indicators reflect new theme |
| FE-T-09 | OS preference changes in System mode | App theme updates automatically without user action |
| FE-T-10 | Explicit mode ignores OS changes | If user selects "Dark", OS switching to light has no effect |

### 5.3 Cross-Component Consistency

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-T-11 | All panels use theme tokens | Left panel, chat area, and right panel colors derived from theme |
| FE-T-12 | Modals follow theme | Schema modal and confirmation dialogs use current theme colors |
| FE-T-13 | WCAG AA contrast in light mode | Text-to-background contrast ratio meets 4.5:1 minimum |
| FE-T-14 | WCAG AA contrast in dark mode | Text-to-background contrast ratio meets 4.5:1 minimum |

---

## 6. Responsive Layout

Tests: [spec.md#responsive-behavior](./spec.md#responsive-behavior)

### 6.1 Desktop (1024px and above)

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-RL-01 | Desktop viewport (>=1024px) | Left panel expanded by default |
| FE-RL-02 | Three panels side-by-side | All three panels visible simultaneously on desktop |
| FE-RL-03 | Manually collapse on desktop | Left panel collapses when hamburger clicked, stays collapsed |

### 6.2 Tablet (below 1024px)

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-RL-04 | Tablet viewport (<1024px) | Left panel collapsed by default |
| FE-RL-05 | Expand left panel on tablet | Panel overlays content (no push behavior) |
| FE-RL-06 | Right panel always visible on tablet | Right panel remains visible at fixed width |
| FE-RL-07 | Chat area fills available space on tablet | Chat area takes full width minus right panel when left is collapsed |

### 6.3 State Persistence

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| FE-RL-08 | Panel state persisted in localStorage | Manual toggle state survives page reload |
| FE-RL-09 | Resize from desktop to tablet | Left panel collapses if no saved preference |
| FE-RL-10 | Resize from tablet to desktop | Left panel expands if no saved preference |
