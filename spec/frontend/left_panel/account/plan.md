---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Account Plan

## Component Structure

Implements: [spec.md#signed-in-state](./spec.md#signed-in-state-in-left-panel)

File: `frontend/src/components/left-panel/Account.tsx`

```
<Account>
  <img src={user.avatarUrl} />         # 32px circular avatar
  <div>
    <span>{user.displayName}</span>    # primary text
    <span>{user.email}</span>          # muted, smaller text
  </div>
  <button onClick={handleSignOut}>Sign out</button>
</Account>
```

## User Data

Implements: [spec.md#signed-in-state](./spec.md#signed-in-state-in-left-panel)

- Reads from `useAuth` hook, which wraps TanStack Query: `useQuery({ queryKey: ["user"], queryFn: fetchCurrentUser })`.
- `fetchCurrentUser` calls `GET /auth/me`. Returns `{ id, displayName, email, avatarUrl }`.
- Stale time: 5 minutes (user data rarely changes within a session).
- If query returns 401, `ProtectedRoute` handles redirect to `/sign-in`.

## Sign-Out Flow

Implements: [spec.md#sign-out-flow](./spec.md#sign-out-flow)

- "Sign out" button triggers `signOutMutation` (`POST /auth/sign-out`).
- On success:
  1. `queryClient.clear()` — removes all cached queries.
  2. Zustand stores reset to initial state (`chatStore.reset()`, `datasetStore.reset()`, `uiStore.reset()`).
  3. WebSocket connection closed via `useWebSocket` cleanup.
  4. `navigate("/sign-in")` via React Router.
- No confirmation dialog required (per spec).

## Sign-In Page

Implements: [spec.md#sign-in-page](./spec.md#sign-in-page)

File: `frontend/src/components/auth/SignIn.tsx`

- Full-screen centered layout (`flex items-center justify-center min-h-screen`).
- Contains:
  - App logo and title.
  - Description text.
  - Referral key `<input>` with local state. Placeholder: "Enter referral key".
  - "Sign in with Google" button: navigates to `GET /auth/google?referral_key={key}` which starts the OAuth redirect.
- Error display: local state `error: string | null`, set from URL query param `?error=...` after failed OAuth callback redirect.

## Layout

Implements: [spec.md#layout](./spec.md#layout)

- Account section is the last item in the left panel flex column.
- Horizontal layout: avatar on left, name/email stacked in center, sign-out on right.
- `border-t` above for visual separation from UsageStats.
- `py-3 px-4` padding, compact single row.

## Scope

### In Scope
- User info display from auth query
- Sign-out action and cleanup
- Sign-in page component structure

### Out of Scope
- OAuth redirect handling (backend)
- Session cookie management (handled by browser + backend)
