---
status: draft
last_updated: 2026-02-05
tests:
  - ./spec.md
  - ./chat_history/spec.md
  - ./settings/spec.md
  - ./usage_stats/spec.md
  - ./account/spec.md
---

# Left Panel Test Specification

## Scope

### In Scope
- Left panel container (collapse/expand, responsive defaults, New Chat)
- Chat History component (list, selection, rename, delete, empty state)
- Settings component (theme toggle, clear conversations, about, help)
- Usage Stats component (progress bar, expanded view, real-time updates)
- Account component (sign-in page, signed-in state, sign-out)

### Out of Scope
- Backend conversation persistence (see backend tests)
- OAuth flow implementation (see backend/auth tests)
- Rate limiting logic (see backend tests)
- Theme CSS token values (see theme plan)

---

## 1. Left Panel Container

Tests: [spec.md#behavior](./spec.md#behavior)

### 1.1 Collapse/Expand

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LP-01 | Hamburger icon toggles panel | Clicking hamburger icon in app header toggles left panel visibility |
| LP-02 | Collapsed panel is fully hidden | When collapsed, panel has 0px width (no icon strip in V1) |
| LP-03 | Expanded panel width | When expanded, panel renders at ~260px width |
| LP-04 | Collapse animation | Panel slides out with smooth transition (~200ms) |
| LP-05 | Chat area fills freed space | When panel collapses, chat area expands to occupy released width |

### 1.2 Responsive Defaults

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LP-06 | Desktop default (>=1024px) | Left panel expanded by default on first load |
| LP-07 | Tablet default (<1024px) | Left panel collapsed by default on first load |
| LP-08 | Mobile overlay behavior | On mobile, expanded panel overlays content (no push) |
| LP-09 | Manual toggle overrides default | User can manually toggle regardless of viewport size |
| LP-10 | Panel state persisted | Expanded/collapsed state saved in localStorage |

### 1.3 New Chat Button

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LP-11 | New Chat button visible | "New Chat" button visible at top of panel when expanded |
| LP-12 | New Chat creates conversation | Clicking creates a fresh conversation, sets it as active |
| LP-13 | New Chat clears chat area | Chat area clears messages, shows appropriate empty state |
| LP-14 | New Chat keeps datasets | Datasets from previous conversation remain loaded |
| LP-15 | Previous conversation in list | Previous conversation stays in the history list after New Chat |

### 1.4 Section Ordering

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LP-16 | Sections in fixed order | Sections stacked: New Chat, Chat History, Settings, Usage Stats, Account (bottom) |

---

## 2. Chat History

Tests: [chat_history/spec.md](./chat_history/spec.md)

### 2.1 Conversation List Display

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CH-01 | List sorted by recent activity | Conversations ordered newest first by most recent activity |
| CH-02 | Title truncation | Titles longer than ~50 characters truncated with ellipsis |
| CH-03 | Relative timestamps | Each item shows relative time: "2h ago", "yesterday", "3 days ago" |
| CH-04 | Active conversation highlighted | Currently active conversation has distinct background color |
| CH-05 | List scrolls independently | Long conversation list scrolls within the chat history section |
| CH-06 | No pagination | Continuous scroll, no page breaks or "load more" |

### 2.2 Conversation Selection

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CH-07 | Click loads conversation | Clicking a conversation loads its messages in chat area |
| CH-08 | Click loads associated datasets | Clicking also loads associated datasets in right panel |
| CH-09 | Previous highlight removed | Clicking a different conversation removes highlight from previous |

### 2.3 Title Generation

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CH-10 | Title from first message | Title auto-generated from first ~50 characters of first user message |
| CH-11 | Inline rename via double-click | Double-clicking a title enters inline edit mode |
| CH-12 | Rename saves immediately | Title change saved immediately on confirm (blur or Enter) |

### 2.4 Deletion

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CH-13 | Delete via hover X icon | Hovering a conversation item reveals X icon; clicking it initiates delete |
| CH-14 | Confirmation required | Confirmation dialog shown: "Delete this conversation?" |
| CH-15 | Confirm deletes conversation | Confirming removes conversation from list immediately |
| CH-16 | Cancel preserves conversation | Canceling confirmation keeps conversation intact |
| CH-17 | Delete active shows empty state | If active conversation deleted, chat area shows onboarding/empty state |

### 2.5 Empty State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CH-18 | No conversations message | When no conversations exist, shows "No conversations yet" |
| CH-19 | New user sees empty state | First-time sign-in shows empty state in chat history |

---

## 3. Settings

Tests: [settings/spec.md](./settings/spec.md)

### 3.1 Theme Toggle

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ST-01 | Three-way toggle present | Toggle offers Light, Dark, and System options |
| ST-02 | Current selection indicated | Active theme mode visually highlighted in the toggle |
| ST-03 | Light mode immediate effect | Selecting Light applies light theme immediately, no reload |
| ST-04 | Dark mode immediate effect | Selecting Dark applies dark theme immediately, no reload |
| ST-05 | System mode follows OS | Selecting System applies theme matching current OS preference |
| ST-06 | Theme persisted | Theme preference saved to localStorage on change |

### 3.2 Clear All Conversations

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ST-07 | Button present | "Clear all conversations" button visible in settings |
| ST-08 | Confirmation dialog | Clicking shows dialog: "This will permanently delete all your conversations. This action cannot be undone." |
| ST-09 | Dialog has Cancel and Delete All | Two buttons: "Cancel" (closes dialog) and "Delete All" (red, destructive) |
| ST-10 | Cancel closes dialog | Clicking Cancel closes dialog with no side effects |
| ST-11 | Delete All clears everything | Confirming deletes all conversations, chat area returns to onboarding |

### 3.3 About Modal

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ST-12 | About link present | "About ChatDF" link or button visible in settings |
| ST-13 | Modal opens with content | Clicking opens modal with app name, version, description |
| ST-14 | Close via X button | X button in modal closes it |
| ST-15 | Close via Escape | Pressing Escape closes the About modal |
| ST-16 | Close via backdrop click | Clicking outside the modal closes it |

### 3.4 Help Modal

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ST-17 | Help link present | "Help" link or button visible in settings |
| ST-18 | Modal shows keyboard shortcuts | Help modal lists: Enter (send), Shift+Enter (new line), Escape (close) |
| ST-19 | Modal shows tips | Help modal shows usage tips (load parquet URL, ask follow-ups, Show SQL) |
| ST-20 | Close via X, Escape, or backdrop | All three close methods work identically |

---

## 4. Usage Stats

Tests: [usage_stats/spec.md](./usage_stats/spec.md)

### 4.1 Progress Bar Display

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| US-01 | Progress bar visible | Horizontal progress bar shown in usage stats section |
| US-02 | Bar label shows usage | Label displays fraction: e.g., "1.2M / 5M tokens" |
| US-03 | Normal state (0-80%) | Bar uses default accent color (blue) |
| US-04 | Warning state (80-99%) | Bar changes to warning color (amber/yellow) |
| US-05 | Limit reached (100%) | Bar turns red, text shows "Daily limit reached" |

### 4.2 Expanded View

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| US-06 | Click expands details | Clicking the usage section expands to show detailed view |
| US-07 | Tokens used formatted | Shows tokens used with thousands separator (e.g., "1,245,320") |
| US-08 | Tokens remaining shown | Shows remaining tokens as formatted number |
| US-09 | Reset countdown | Shows countdown: "Resets in 4h 23m" |
| US-10 | Click again collapses | Clicking again collapses back to progress bar only |

### 4.3 Real-Time Updates

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| US-11 | Updates during streaming | Usage bar updates in real-time as chat response streams |
| US-12 | WebSocket triggers state change | `rate_limit_warning` WebSocket message updates bar state |
| US-13 | No polling | Usage updates arrive via WebSocket push, not periodic polling |

---

## 5. Account

Tests: [account/spec.md](./account/spec.md)

### 5.1 Sign-In Page

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| AC-01 | Shown when unauthenticated | Sign-in page displayed when user has no valid session |
| AC-02 | App branding displayed | Logo, app name "ChatDF", and description visible |
| AC-03 | Google sign-in button | "Sign in with Google" button present with Google branding |
| AC-04 | Referral key field | Text input with placeholder "Enter referral key" visible |
| AC-05 | Referral key note | Note text: "New users need a referral key to sign up" |
| AC-06 | Missing key error (new user) | New user without key sees: "A referral key is required for new accounts" |
| AC-07 | Invalid key error | Invalid/used key shows: "Invalid or already used referral key" |
| AC-08 | Returning user ignores key | Returning users can sign in with empty referral key field |
| AC-09 | Full-screen centered layout | Sign-in page is full-screen with centered content |

### 5.2 Signed-In State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| AC-10 | Avatar displayed | User avatar from Google profile shown (circular, ~32px) |
| AC-11 | Display name shown | User's Google display name visible |
| AC-12 | Email shown | User's email displayed in muted/smaller text |
| AC-13 | Sign out button | "Sign out" text link visible (not a prominent button) |
| AC-14 | Account at panel bottom | Account section positioned at the bottom of the left panel |

### 5.3 Sign-Out Flow

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| AC-15 | No confirmation on sign-out | Clicking "Sign out" immediately initiates sign-out (no dialog) |
| AC-16 | Redirect to sign-in | After sign-out, user is redirected to the sign-in page |
| AC-17 | Session invalidated | Backend session is invalidated; re-visiting `/` redirects to sign-in |
