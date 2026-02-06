---
status: draft
last_updated: 2026-02-05
tests: ./spec.md
---

# Authentication Test Specification

Tests: [auth/spec.md](./spec.md)

## Scope

### In Scope
- Google OAuth 2.0 flow (initiate, callback)
- Referral key validation and redemption
- Session creation, validation, refresh, and expiry
- Logout behavior
- Unauthenticated access enforcement
- Security properties (CSRF state, Origin header, cookie flags)

### Out of Scope
- Frontend sign-in UI (see frontend/left_panel/account/spec.md)
- Rate limiting (see rate_limiting/test.md)
- REST endpoint details (see rest_api/test.md)

---

## Test Scenarios

### OAUTH-1: Initiate Google OAuth Flow
Tests: [spec.md#google-oauth-flow](./spec.md#google-oauth-flow)

- Scenario: Frontend calls POST /auth/google
- Expected: Returns a redirect_url pointing to Google's consent screen, includes state parameter for CSRF protection
- Edge cases:
  - Missing OAuth configuration on server: returns 500

### OAUTH-2: Callback for Existing User
Tests: [spec.md#google-oauth-flow](./spec.md#google-oauth-flow)

- Scenario: Google redirects to callback with valid authorization code for a user whose google_id exists in the users table
- Expected: Session created in sessions table, session token set as httpOnly secure cookie, user redirected to app, last_login_at updated
- Edge cases:
  - Authorization code already used or expired: returns 400

### OAUTH-3: Callback for New User with Valid Referral Key
Tests: [spec.md#sign-up-flow-new-users](./spec.md#sign-up-flow-new-users)

- Scenario: Google redirects to callback for a user not in the users table, referral key was provided in the initiation step and is valid and unused
- Expected: New user created in users table, referral key marked as used (used_by set, used_at set), session created, session token set as httpOnly secure cookie, user redirected to app
- Edge cases:
  - Google returns minimal profile info (no avatar): user created with null avatar_url

### OAUTH-4: Callback for New User without Referral Key
Tests: [spec.md#sign-up-flow-new-users](./spec.md#sign-up-flow-new-users)

- Scenario: Google redirects to callback for a new user, no referral key was provided
- Expected: Redirect to app with error parameter "Referral key required", no user created, no session created

### OAUTH-5: Callback for New User with Invalid Referral Key
Tests: [spec.md#sign-up-flow-new-users](./spec.md#sign-up-flow-new-users)

- Scenario: Google redirects to callback for a new user, referral key provided but it is invalid (does not exist) or already used
- Expected: Redirect to app with error parameter "Invalid referral key", no user created, no session created
- Edge cases:
  - Key exists but used_by is already set: treated as invalid
  - Key string is empty: treated as not provided

### OAUTH-6: CSRF State Parameter Validation
Tests: [spec.md#security-considerations](./spec.md#security-considerations)

- Scenario: Callback receives a state parameter that does not match what was sent in the initiation step
- Expected: Returns 403, no session created
- Edge cases:
  - State parameter missing entirely: returns 403

---

### REFERRAL-1: Valid Referral Key Creates User
Tests: [spec.md#referral-keys](./spec.md#referral-keys)

- Scenario: New user provides a valid, unused referral key during OAuth callback
- Expected: User record created, key.used_by set to new user's id, key.used_at set to current timestamp

### REFERRAL-2: Used Referral Key Rejected
Tests: [spec.md#referral-keys](./spec.md#referral-keys)

- Scenario: New user provides a referral key that has already been redeemed
- Expected: Sign-up rejected with "Invalid referral key" error

### REFERRAL-3: Returning Users Skip Key Check
Tests: [spec.md#referral-keys](./spec.md#referral-keys)

- Scenario: Existing user signs in via OAuth (google_id already in users table)
- Expected: Session created without checking for referral key, regardless of whether one was provided

---

### SESSION-1: Session Token in httpOnly Cookie
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: User successfully authenticates
- Expected: Session token returned as a cookie with httpOnly=true and secure=true flags

### SESSION-2: Session Expiry at 7 Days
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: Session created for a user
- Expected: expires_at set to 7 days from creation time

### SESSION-3: Session Refresh on Activity
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: Authenticated user makes a request with a valid session
- Expected: Session expires_at extended (refreshed) by 7 days from the time of the request
- Edge cases:
  - Multiple rapid requests: each refreshes the expiry

### SESSION-4: Expired Session Returns 401
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: User makes a request with a session whose expires_at is in the past
- Expected: Returns 401, session not refreshed
- Edge cases:
  - Session expired 1 second ago: still returns 401

### SESSION-5: Multiple Sessions per User
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: Same user authenticates from two different devices
- Expected: Two separate session records in sessions table, both valid, each with independent expiry

### SESSION-6: Concurrent Sign-In Attempts
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: Two OAuth callbacks for the same user arrive near-simultaneously
- Expected: Both succeed, two sessions created, no data corruption

### SESSION-7: Missing or Malformed Session Cookie
Tests: [spec.md#session-management](./spec.md#session-management)

- Scenario: Request arrives with no cookie, or with a cookie value that is not a valid session token format
- Expected: Returns 401
- Edge cases:
  - Cookie name correct but value is empty string: returns 401
  - Cookie name correct but value is random gibberish: returns 401
  - Cookie name missing entirely: returns 401

---

### LOGOUT-1: Session Deleted on Logout
Tests: [spec.md#logout](./spec.md#logout)

- Scenario: Authenticated user calls POST /auth/logout
- Expected: Session record deleted from sessions table, session cookie cleared (set to expired)

### LOGOUT-2: Logout While Unauthenticated
Tests: [spec.md#logout](./spec.md#logout)

- Scenario: Unauthenticated user calls POST /auth/logout
- Expected: Returns 401

---

### UNAUTH-1: All Non-Auth Endpoints Require Authentication
Tests: [spec.md#unauthenticated-access](./spec.md#unauthenticated-access)

- Scenario: Unauthenticated request (no session cookie) to any endpoint other than POST /auth/google and GET /auth/google/callback
- Expected: Returns 401 with consistent error format

---

### SECURITY-1: Origin Header Validation on WebSocket
Tests: [spec.md#security-considerations](./spec.md#security-considerations)

- Scenario: WebSocket upgrade request arrives with an Origin header not matching allowed origins
- Expected: Connection rejected
- Edge cases:
  - Origin header missing: connection rejected
  - Origin matches one of the CORS_ORIGINS: connection allowed
