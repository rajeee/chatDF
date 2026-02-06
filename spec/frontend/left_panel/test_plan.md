---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Left Panel Test Plan

## Test Files

| File | Test Spec Scenarios | Component Under Test |
|------|-------------------|---------------------|
| `LeftPanel.test.tsx` | LP-* | `LeftPanel.tsx` |
| `ChatHistory.test.tsx` | CH-* | `ChatHistory.tsx` |
| `Settings.test.tsx` | ST-* | `Settings.tsx` |
| `UsageStats.test.tsx` | US-* | `UsageStats.tsx` |
| `Account.test.tsx` | AC-* | `Account.tsx`, `SignIn.tsx` |

## LeftPanel Tests (`LeftPanel.test.tsx`)

Tests: [test.md#LP-COLLAPSE-1 through LP-SECTION-1](./test.md)

| Scenario | Approach |
|----------|----------|
| LP-COLLAPSE-1 | Render with `uiStore.leftPanelOpen = true`. Click hamburger/collapse button. Assert panel width transitions to 0 or panel gets `hidden` class. |
| LP-COLLAPSE-2 | Render collapsed. Click expand button. Assert panel expanded (width 260px or visible). |
| LP-RESPONSIVE-1 | Mock `window.innerWidth = 1200` (desktop). Render. Assert `uiStore.leftPanelOpen` defaults to `true`. |
| LP-RESPONSIVE-2 | Mock `window.innerWidth = 900` (tablet). Render. Assert `uiStore.leftPanelOpen` defaults to `false`. |
| LP-OVERLAY-1 | At tablet width, expand panel. Assert overlay backdrop visible. Click backdrop. Assert panel collapses. |
| LP-NEWCHAT-1 | Click "New Chat" button. Assert `POST /conversations` called. Assert new conversation appears in history. |
| LP-SECTION-1 | Render expanded panel. Assert sections appear in correct order: New Chat button, Chat History, (spacer), Settings, Usage Stats, Account. |

## ChatHistory Tests (`ChatHistory.test.tsx`)

Tests: [test.md#CH-LIST-1 through CH-DELETE-2](./test.md)

| Scenario | Approach |
|----------|----------|
| CH-LIST-1 | MSW returns 3 conversations sorted by `updated_at`. Render. Assert 3 items in list, most recent first. |
| CH-LIST-2 | Assert conversation titles truncated with ellipsis when exceeding container width (check `text-overflow: ellipsis` or visual truncation). |
| CH-LIST-3 | Assert relative timestamps shown (e.g., "2 hours ago", "Yesterday"). |
| CH-SELECT-1 | Click a conversation item. Assert `activeConversationId` updated in store. Assert selected item has active/highlighted styling. |
| CH-RENAME-1 | Double-click a conversation title. Assert inline input appears with current title. Type new title, press Enter. Assert `PATCH /conversations/:id` called with new title. |
| CH-RENAME-2 | Double-click, press Escape. Assert rename cancelled, original title restored. |
| CH-DELETE-1 | Click delete button on a conversation. Assert confirmation prompt appears (inline). Click confirm. Assert `DELETE /conversations/:id` called. Assert item removed from list. |
| CH-DELETE-2 | Delete the active conversation. Assert chat area shows empty/onboarding state. |
| CH-EMPTY-1 | MSW returns empty conversations array. Assert empty state message shown. |

**Inline rename**: Use `userEvent.dblClick` to trigger rename mode. Use `userEvent.type` + `userEvent.keyboard("{Enter}")` to confirm.

**Relative timestamps**: The component likely uses a date formatting utility. Mock `Date.now()` or use a known date to assert predictable relative strings.

## Settings Tests (`Settings.test.tsx`)

Tests: [test.md#ST-THEME-1 through ST-HELP-1](./test.md)

| Scenario | Approach |
|----------|----------|
| ST-THEME-1 | Render Settings. Assert three-way toggle (Light/Dark/System) visible. Click "Dark". Assert `document.documentElement.classList.contains("dark")`. Assert `localStorage.getItem("theme") === "dark"`. |
| ST-THEME-2 | Click "System". Mock `matchMedia("(prefers-color-scheme: dark)")` to return true. Assert dark class applied. |
| ST-CLEAR-1 | Click "Clear All Conversations". Assert confirmation modal appears. Click confirm. Assert `DELETE /conversations` (bulk) called. Assert conversation list empty after mutation. |
| ST-CLEAR-2 | Click "Clear All", then cancel. Assert no API call made. |
| ST-ABOUT-1 | Click "About" link. Assert modal with app info visible. Close via X or Escape. |
| ST-HELP-1 | Click "Help" link. Assert modal with help content visible. |

## UsageStats Tests (`UsageStats.test.tsx`)

Tests: [test.md#US-BAR-1 through US-UPDATE-1](./test.md)

| Scenario | Approach |
|----------|----------|
| US-BAR-1 | MSW returns usage at 50%. Assert progress bar at ~50% width. Assert bar color is blue (normal). |
| US-BAR-2 | MSW returns 85% usage. Assert bar color is amber (warning). |
| US-BAR-3 | MSW returns 100% usage. Assert bar color is red (exceeded). |
| US-EXPAND-1 | Click usage stats header. Assert expanded view shows: tokens used (formatted), tokens remaining, reset countdown. |
| US-FORMAT-1 | Assert numbers formatted with `Intl.NumberFormat` (e.g., "4,250,000 / 5,000,000"). |
| US-COUNTDOWN-1 | MSW returns `resets_in_seconds: 3600`. Assert "Resets in ~1 hour" shown. |
| US-UPDATE-1 | Simulate WebSocket `rate_limit_warning` with updated usage. Assert progress bar and numbers update without page reload. |

**WebSocket update**: Use the MSW WebSocket mock to send a `rate_limit_warning` message. Assert the query cache is updated and the component re-renders.

## Account Tests (`Account.test.tsx`)

Tests: [test.md#AC-SIGNIN-1 through AC-SIGNOUT-2](./test.md)

| Scenario | Approach |
|----------|----------|
| AC-SIGNIN-1 | Render `SignIn` page. Assert Google sign-in button visible. Assert referral key input field present. |
| AC-SIGNIN-2 | Enter referral key, click Google sign-in. Assert `POST /auth/google` called with `referral_key` in body. |
| AC-SIGNIN-3 | Render `SignIn` at route `/sign-in?error=invalid_referral_key`. Assert error message displayed. |
| AC-DISPLAY-1 | MSW returns user with name and avatar. Render `Account`. Assert avatar image, display name, and email shown. |
| AC-DISPLAY-2 | MSW returns user with `avatar_url: null`. Assert fallback avatar (initials or placeholder icon). |
| AC-SIGNOUT-1 | Click "Sign Out" button. Assert `POST /auth/logout` called. Assert TanStack Query cache cleared. Assert navigation to `/sign-in`. |
| AC-SIGNOUT-2 | After sign out, assert Zustand stores reset to initial state. |

**Navigation assertion**: Use `MemoryRouter` and check current location via a test helper or by asserting that the `SignIn` component is rendered.

## Scope

### In Scope
- All left panel test scenarios from left_panel/test.md
- Component rendering in various states
- User interactions (click, double-click, keyboard)
- Store and query cache integration
- Responsive behavior simulation

### Out of Scope
- Backend logic for conversations/auth (MSW provides responses)
- WebSocket connection management (tested in state tests)
- E2E cross-panel flows (see top-level test_plan.md)
