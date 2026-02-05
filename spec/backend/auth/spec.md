---
status: draft
last_updated: 2026-02-05
parent: ../spec.md
---

# Authentication Specification

## Scope

### In Scope
- Google OAuth 2.0 flow
- Referral key sign-up gating
- Session management
- Logout behavior

### Out of Scope
- Frontend account UI (see frontend/left_panel/account/spec.md)
- Rate limiting (see rate_limiting/spec.md)
- Password-based auth, other OAuth providers (not in V1)

### Assumptions
- Google OAuth 2.0 Authorization Code flow
- Server-side API key only (no user-provided keys)
- All users must be authenticated — no anonymous/guest access
- Sign-up requires a valid, unused referral key

## Behavior

### Sign-Up Flow (New Users)
1. User navigates to app, sees sign-in page
2. User clicks "Sign in with Google"
3. Google OAuth popup opens, user authenticates
4. Backend receives Google user info (email, name, avatar)
5. Backend checks if user exists in `users` table by `google_id`
6. **New user**: backend checks for valid referral key
   - If no referral key provided: return error "Referral key required"
   - If invalid/used key: return error "Invalid referral key"
   - If valid key: create user, mark key as used, create session
7. **Existing user**: create session directly (no key needed)
8. Returns session token to frontend as httpOnly cookie

### Referral Keys
- Each key is a unique string (e.g., UUID or short alphanumeric code)
- Single-use: once redeemed by a user, it cannot be reused
- Keys created by admin (seeded in database or via admin tool)
- `referral_keys` table tracks: key, created_by, used_by, timestamps
- New users must provide a key during their first OAuth sign-in
- Returning users skip the key check entirely

### Google OAuth Flow
1. Frontend calls `POST /auth/google` to get redirect URL
2. Frontend opens Google OAuth popup with redirect URL
3. Google redirects to `GET /auth/google/callback` with authorization code
4. Backend exchanges authorization code for access tokens with Google
5. Backend extracts user info from Google tokens (email, name, avatar)
6. Backend creates or updates user record in `users` table
7. Backend creates session in `sessions` table
8. Returns session token to frontend as httpOnly cookie

### Session Management
- Session token stored as httpOnly, secure cookie
- Session duration: 7 days from creation
- Session refreshed on activity (extends expiry on each authenticated request)
- Session validation: lookup in `sessions` table, verify `expires_at` > now
- Multiple sessions allowed per user (different devices)

### Logout
- `POST /auth/logout` endpoint
- Deletes session from `sessions` table
- Clears session cookie on client
- Frontend redirects to sign-in page

### Unauthenticated Access
- All app routes require authentication
- Unauthenticated requests receive 401 response
- Frontend redirects to sign-in page on 401
- Sign-in page is the only publicly accessible page

### Security Considerations
- Session tokens are cryptographically random UUIDs
- httpOnly cookies prevent XSS access to session tokens
- CSRF protection: validate Origin header on WebSocket upgrade
- OAuth state parameter used to prevent CSRF in OAuth flow
- No password storage (Google OAuth only)
- Referral keys are not sensitive (they only gate sign-up, not access)
