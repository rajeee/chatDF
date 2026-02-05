---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Account Specification

## Scope

### In Scope
- Signed-in account display
- Sign-out trigger
- Sign-in page (shown when not authenticated)

### Out of Scope
- OAuth flow implementation (see backend/auth/spec.md)
- Session management (see backend/auth/spec.md)
- Referral key validation (see backend/auth/spec.md)

### Assumptions
- Google OAuth is the only sign-in method (V1)
- All users must be authenticated — no guest/anonymous access
- New users need a valid referral key to sign up

## Behavior

### Sign-In Page
- Displayed when user is not authenticated (no valid session)
- This is the app's landing page for unauthenticated users
- Content:
  - App logo and name (ChatDF)
  - Brief description: "Chat with your data using natural language"
  - "Sign in with Google" button (Google branded)
  - Referral key input field (text input, placeholder: "Enter referral key")
  - Note: "New users need a referral key to sign up"
- Referral key field:
  - Required for new users, ignored for returning users
  - If new user signs in without key: error message "A referral key is required for new accounts"
  - If invalid/used key: error message "Invalid or already used referral key"
  - Returning users can leave the field empty

### Signed-In State (in left panel)
- Displays:
  - User avatar (from Google profile, circular, small ~32px)
  - Display name (from Google profile)
  - Email address (muted/smaller text)
  - "Sign out" button (text link style, not prominent)

### Sign-Out Flow
1. User clicks "Sign out"
2. No confirmation dialog needed
3. Session invalidated on backend
4. Frontend redirects to sign-in page

### Layout
- Sign-in page: full-screen, centered content
- Signed-in state: positioned at the bottom of the left panel
- Compact — single section, not expandable
- Visually distinct from other sections (subtle separator above)
