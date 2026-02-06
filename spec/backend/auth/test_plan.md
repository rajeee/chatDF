---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Authentication Test Plan

## Fixtures (`tests/auth/conftest.py`)

### `mock_oauth` — Mocked Authlib OAuth client

Patches `auth_service.oauth.google` to avoid real Google API calls:

- `authorize_redirect`: Returns a mock redirect URL with a known `state` parameter
- `authorize_access_token`: Returns a mock token dict with `userinfo` containing `sub`, `email`, `name`, `picture`
- State validation handled by storing the expected state in test session

```python
@pytest.fixture
def mock_oauth(monkeypatch):
    mock_google = AsyncMock()
    mock_google.authorize_redirect = AsyncMock(return_value=RedirectResponse("/callback"))
    mock_google.authorize_access_token = AsyncMock(return_value={
        "userinfo": {"sub": "google_123", "email": "user@test.com", "name": "Test User", "picture": None}
    })
    monkeypatch.setattr("app.services.auth_service.oauth.google", mock_google)
    return mock_google
```

### `valid_referral_key` — Unused referral key in database

```python
@pytest.fixture
async def valid_referral_key(db):
    key = make_referral_key(used_by=None)
    await insert_referral_key(db, key)
    return key
```

### `used_referral_key` — Already-redeemed referral key

```python
@pytest.fixture
async def used_referral_key(db, test_user):
    key = make_referral_key(used_by=test_user["id"])
    await insert_referral_key(db, key)
    return key
```

### `expired_session` — Session with `expires_at` in the past

```python
@pytest.fixture
async def expired_session(db, test_user):
    session = make_session(
        user_id=test_user["id"],
        expires_at=(datetime.utcnow() - timedelta(hours=1)).isoformat()
    )
    await insert_session(db, session)
    return session
```

## Test Implementation by Scenario

### OAuth Flow Tests (`test_oauth.py`)

Tests: [test.md#OAUTH-1 through OAUTH-6](./test.md)

| Scenario | Approach |
|----------|----------|
| OAUTH-1 | POST `/auth/google` with `mock_oauth`. Assert response contains `redirect_url`. Assert `authorize_redirect` called. |
| OAUTH-2 | Pre-seed user with known `google_id`. Mock callback with matching `sub`. Assert session created in DB, cookie set in response. |
| OAUTH-3 | No user in DB. Mock callback. Provide `valid_referral_key` in session. Assert user created, key marked used, session created. |
| OAUTH-4 | No user in DB. No referral key in session. Assert redirect to `/sign-in?error=...`, no user or session created. |
| OAUTH-5 | No user in DB. Provide `used_referral_key`. Assert redirect with error, no user created. |
| OAUTH-6 | Manually set a different `state` value in the request vs what `mock_oauth` expects. Assert 403 returned. |

**Asserting cookie properties**: After callback, inspect response headers for `Set-Cookie`. Parse cookie string to verify `httponly`, `secure`, `samesite=lax`, `path=/`.

### Referral Key Tests (`test_referral.py`)

Tests: [test.md#REFERRAL-1 through REFERRAL-3](./test.md)

| Scenario | Approach |
|----------|----------|
| REFERRAL-1 | Call `validate_referral_key` + `mark_key_used` directly on `auth_service`. Assert DB state: `used_by` set, `used_at` populated. |
| REFERRAL-2 | Pass a key whose `used_by` is already set. Assert `validate_referral_key` returns `False`. |
| REFERRAL-3 | Pre-seed user. Mock OAuth callback for existing user. Assert session created regardless of referral key presence. |

### Session Tests (`test_session.py`)

Tests: [test.md#SESSION-1 through SESSION-7](./test.md)

| Scenario | Approach |
|----------|----------|
| SESSION-1 | After successful OAuth, inspect `Set-Cookie` header. Assert `httponly` and `secure` flags present. |
| SESSION-2 | After session creation, query DB for session record. Assert `expires_at` is ~7 days from now (within 1 second tolerance). |
| SESSION-3 | Make a request with valid session. Then query DB. Assert `expires_at` was extended from original value. |
| SESSION-4 | Use `expired_session` fixture. Call `GET /auth/me`. Assert 401. |
| SESSION-5 | Create two sessions for same user (different UUIDs). Assert both valid, both return 200 on `/auth/me`. |
| SESSION-6 | Run two auth callbacks concurrently via `asyncio.gather`. Assert both succeed, two session rows in DB. |
| SESSION-7 | Test with no cookie, empty cookie value, random string cookie. All return 401. |

### Logout Tests (`test_logout.py`)

Tests: [test.md#LOGOUT-1, LOGOUT-2](./test.md)

| Scenario | Approach |
|----------|----------|
| LOGOUT-1 | Call `POST /auth/logout` with `authed_client`. Assert 200. Query sessions table — session row deleted. Assert `Set-Cookie` clears cookie (max-age=0). |
| LOGOUT-2 | Call `POST /auth/logout` with no session cookie. Assert 401. |

### Security Tests (`test_security.py`)

Tests: [test.md#UNAUTH-1, SECURITY-1](./test.md)

| Scenario | Approach |
|----------|----------|
| UNAUTH-1 | Iterate over all non-auth endpoints. For each, send request without session cookie. Assert 401. Parameterize with `@pytest.mark.parametrize`. |
| SECURITY-1 | Create a WebSocket test client with mismatched `Origin` header. Assert connection rejected. Test with missing origin, wrong origin, and correct origin. |

## Scope

### In Scope
- All test scenarios from auth/test.md
- OAuth mock setup and cookie verification
- Session lifecycle testing (create, refresh, expire, delete)
- Referral key validation at the service layer

### Out of Scope
- Real Google OAuth calls (always mocked)
- Frontend sign-in UI rendering (see frontend test plan)
