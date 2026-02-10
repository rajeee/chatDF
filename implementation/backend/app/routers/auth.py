"""Auth router — Google OAuth, session info, logout.

Implements: spec/backend/rest_api/plan.md#routers/auth.py
Implements: spec/backend/auth/plan.md
"""

from __future__ import annotations

import aiosqlite
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import get_settings
from app.dependencies import get_current_user, get_db
from app.models import GoogleLoginRequest, SuccessResponse, UserResponse
from app.services import auth_service

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Authlib OAuth client
# Implements: spec/backend/auth/plan.md#Authlib-OAuth-Client-Setup
# ---------------------------------------------------------------------------

oauth = OAuth()

_settings = get_settings()
oauth.register(
    name="google",
    client_id=_settings.google_client_id,
    client_secret=_settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SESSION_COOKIE_MAX_AGE = 7 * 24 * 3600  # 7 days in seconds

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_session_data(request: Request) -> dict:
    """Read the Starlette session data from the request.

    This is extracted as a standalone function so it can be patched in tests
    without needing to wire up real Starlette session middleware.
    """
    return dict(request.session)


def _set_session_cookie(response, token: str) -> None:
    """Set the session_token httpOnly cookie on *response*.

    Implements: spec/backend/auth/plan.md#httpOnly-Cookie-Configuration
    """
    settings = get_settings()
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=SESSION_COOKIE_MAX_AGE,
        path="/",
    )


def _clear_session_cookie(response) -> None:
    """Clear the session_token cookie on *response*."""
    settings = get_settings()
    response.delete_cookie(
        key="session_token",
        path="/",
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
    )


# ---------------------------------------------------------------------------
# POST /auth/google
# Implements: spec/backend/auth/plan.md#Endpoint-POST-authgoogle
# ---------------------------------------------------------------------------


@router.post("/google")
async def google_login(
    request: Request,
    body: GoogleLoginRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    """Initiate Google OAuth flow. Returns a redirect URL."""
    # Store referral_key in session for use after callback
    if body.referral_key:
        request.session["referral_key"] = body.referral_key

    # Build the callback URL
    callback_url = str(request.url_for("google_callback"))

    # Get the redirect response from Authlib
    redirect_response = await oauth.google.authorize_redirect(request, callback_url)

    # Extract the redirect URL from the response
    redirect_url = redirect_response.headers.get("location", "")

    return {"redirect_url": redirect_url}


# ---------------------------------------------------------------------------
# GET /auth/google/callback
# Implements: spec/backend/auth/plan.md#Endpoint-GET-authgooglecallback
# ---------------------------------------------------------------------------


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
):
    """Handle Google OAuth callback."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(url="/sign-in?error=oauth_error", status_code=302)

    userinfo = token.get("userinfo", {})

    # Retrieve the referral_key from the session
    session_data = _get_session_data(request)
    referral_key = session_data.get("referral_key")

    # Delegate to auth_service
    result = await auth_service.google_callback(
        userinfo=userinfo,
        referral_key=referral_key,
        db=db,
    )

    if result["error"] is not None:
        return RedirectResponse(
            url=f"/sign-in?error={result['error']}", status_code=302
        )

    # Success: set cookie and redirect to app
    response = RedirectResponse(url="/", status_code=302)
    _set_session_cookie(response, result["session_token"])
    return response


# ---------------------------------------------------------------------------
# GET /auth/me
# Implements: spec/backend/rest_api/plan.md#routers/auth.py
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: dict = Depends(get_current_user),
) -> UserResponse:
    """Return the currently authenticated user's info."""
    return UserResponse(
        user_id=user["id"],
        email=user["email"],
        name=user["name"],
        avatar_url=user.get("avatar_url"),
    )


# ---------------------------------------------------------------------------
# POST /auth/logout
# Implements: spec/backend/rest_api/plan.md#routers/auth.py
# ---------------------------------------------------------------------------


@router.post("/logout", response_model=SuccessResponse)
async def logout(
    request: Request,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Invalidate the current session and clear the cookie."""
    session_token = request.cookies.get("session_token")
    if session_token:
        await auth_service.delete_session(db, session_token)

    response = JSONResponse(content={"success": True})
    _clear_session_cookie(response)
    return response


# ---------------------------------------------------------------------------
# POST /auth/dev-login  (development only — bypasses Google OAuth)
# ---------------------------------------------------------------------------


class DevLoginRequest(BaseModel):
    referral_key: str


@router.post("/dev-login")
async def dev_login(
    body: DevLoginRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    """Validate referral key and create a dev user + session directly."""
    dev_google_id = "dev-user-local"
    cursor = await db.execute(
        "SELECT id FROM users WHERE google_id = ?", (dev_google_id,)
    )
    existing = await cursor.fetchone()

    if existing:
        # Returning dev user — skip referral key check
        user_id = existing["id"]
    else:
        # New dev user — require valid referral key
        key_valid = await auth_service.validate_referral_key(db, body.referral_key)
        if not key_valid:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_referral_key"},
            )

        from uuid import uuid4
        from datetime import datetime, timezone

        user_id = str(uuid4())
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, dev_google_id, "dev@localhost", "Dev User", None, now, now),
        )
        await db.commit()
        await auth_service.mark_key_used(db, body.referral_key, user_id)

    session_token = await auth_service.create_session(db, user_id)

    response = JSONResponse(content={"success": True})
    _set_session_cookie(response, session_token)
    return response
