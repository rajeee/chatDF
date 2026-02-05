---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Authentication Plan

## Authlib OAuth Client Setup
Implements: [spec.md#Google-OAuth-Flow](./spec.md#google-oauth-flow)

`auth_service.py` creates an Authlib `OAuth` instance at module level:
- `oauth = OAuth()` with `starlette` integration
- `oauth.register("google", ...)` configured with `client_id`, `client_secret`, `authorize_url`, `access_token_url`, `userinfo_endpoint`, `client_kwargs={"scope": "openid email profile"}`
- Configuration values read from `Settings` singleton

## OAuth State Management
Implements: [spec.md#Security-Considerations](./spec.md#security-considerations)

OAuth state (CSRF token) management via Authlib's built-in Starlette session integration:
- `SessionMiddleware` added to FastAPI app with a secret key (derived from `google_client_secret`)
- Authlib stores the `state` parameter in the Starlette session automatically
- The optional `referral_key` is also stored in the session before redirect so it survives the OAuth round-trip
- Session data is encrypted in a signed cookie (Starlette default behavior)

## Endpoint: `POST /auth/google`
Implements: [spec.md#Sign-Up-Flow](./spec.md#sign-up-flow)

Function signature: `async def google_login(request: Request, body: GoogleLoginRequest, db = Depends(get_db))`

`GoogleLoginRequest` Pydantic model: `referral_key: str | None = None`

Flow:
1. Store `referral_key` in `request.session` (if provided)
2. Call `oauth.google.authorize_redirect(request, callback_url)` which returns a redirect response with `state` parameter
3. Return the redirect URL as JSON: `{"redirect_url": str}`

## Endpoint: `GET /auth/google/callback`
Implements: [spec.md#Google-OAuth-Flow](./spec.md#google-oauth-flow), [spec.md#Referral-Keys](./spec.md#referral-keys)

Function signature: `async def google_callback(request: Request, db = Depends(get_db))`

Flow:
1. Call `oauth.google.authorize_access_token(request)` to exchange code for tokens (Authlib validates `state` automatically)
2. Extract user info: `email`, `name`, `picture` from token's `userinfo`
3. Query `users` table by `google_id` (derived from `sub` claim in token)
4. **Existing user**: call `auth_service.create_session(db, user_id)` -> set cookie -> redirect to `/`
5. **New user**: retrieve `referral_key` from `request.session`
   - Call `auth_service.validate_referral_key(db, key)` — returns False if missing, invalid, or already used
   - If invalid: redirect to `/sign-in?error=invalid_referral_key`
   - If valid: call `auth_service.create_user(db, google_info)`, then `auth_service.mark_key_used(db, key, user_id)`, then `create_session` -> set cookie -> redirect to `/`

## Session Token Generation
Implements: [spec.md#Session-Management](./spec.md#session-management)

`auth_service.create_session(db, user_id) -> str`:
1. Generate token: `str(uuid.uuid4())`
2. Calculate `expires_at`: `datetime.utcnow() + timedelta(days=settings.session_duration_days)`
3. Insert into `sessions` table: `(id, user_id, token, expires_at, created_at)`
4. Return token string

## httpOnly Cookie Configuration
Implements: [spec.md#Session-Management](./spec.md#session-management)

Cookie set on successful auth callback response:
- `key`: `"session_token"`
- `value`: UUID token string
- `httponly`: `True`
- `secure`: `True` (HTTPS only; `False` in dev via config flag)
- `samesite`: `"lax"`
- `max_age`: `7 * 24 * 3600` (7 days in seconds)
- `path`: `"/"`

Cookie cleared on logout by setting `max_age=0`.

## Referral Key Validation
Implements: [spec.md#Referral-Keys](./spec.md#referral-keys)

`auth_service.validate_referral_key(db, key: str) -> bool`:
1. Query `referral_keys` table where `key = ? AND used_by IS NULL`
2. Return `True` if row exists, `False` otherwise

`auth_service.mark_key_used(db, key: str, user_id: str)`:
1. Update `referral_keys` set `used_by = user_id, used_at = now()` where `key = ?`

## `get_current_user` Dependency
Implements: [spec.md#Unauthenticated-Access](./spec.md#unauthenticated-access)

`async def get_current_user(request: Request, db = Depends(get_db)) -> User`:
1. Read `session_token` from `request.cookies.get("session_token")`
2. If missing: raise `HTTPException(status_code=401, detail="Not authenticated")`
3. Query `sessions` join `users` where `token = ? AND expires_at > now()`
4. If no result: raise `HTTPException(status_code=401, detail="Session expired")`
5. Refresh session: update `expires_at` to `now() + 7 days`
6. Return `User(id=..., email=..., name=..., avatar_url=...)`

## WebSocket Authentication
Implements: [spec.md#Security-Considerations](./spec.md#security-considerations)

WebSocket connections cannot reliably send cookies on upgrade. Instead:
- Client connects to `ws://host/ws?token={session_token}`
- `websocket.py` router extracts `token` from query params
- Calls `auth_service.validate_session(db, token) -> User | None`
- If `None`: close WebSocket with code `4001` (custom code for auth failure)
- If valid: proceed with connection, associate `user_id` with connection

`auth_service.validate_session(db, token: str) -> User | None`:
- Same logic as `get_current_user` but returns `None` instead of raising

## Scope

### In Scope
- Authlib OAuth client configuration and flow
- Session creation, validation, refresh, deletion
- Referral key validation
- Cookie management
- WebSocket auth via query param

### Out of Scope
- Database schema for users/sessions/referral_keys (see database/plan.md)
- Frontend sign-in UI (see frontend/auth/plan.md)
- Rate limiting (see rate_limiting/plan.md)
