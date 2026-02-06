"""Auth endpoint tests (AUTH-EP-1 through AUTH-EP-9).

Tests: spec/backend/rest_api/test.md#auth-endpoint-tests
Verifies: spec/backend/rest_api/plan.md#routers/auth.py
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.factories import make_referral_key, make_session, make_user
from tests.rest_api.conftest import (
    assert_error_response,
    assert_success_response,
    insert_referral_key,
    insert_session,
    insert_user,
)


# ---------------------------------------------------------------------------
# AUTH-EP-1: POST /auth/google returns redirect_url
# Tests: spec/backend/rest_api/test.md#AUTH-EP-1
# ---------------------------------------------------------------------------


class TestGoogleLogin:
    """POST /auth/google endpoint."""

    @pytest.mark.asyncio
    async def test_returns_redirect_url(self, fresh_db):
        """AUTH-EP-1: POST /auth/google with referral_key returns redirect_url."""
        from app.main import app

        app.state.db = fresh_db

        # Mock the OAuth client so we don't need real Google credentials
        mock_redirect_response = MagicMock()
        mock_redirect_response.headers = {
            "location": "https://accounts.google.com/o/oauth2/auth?state=abc123"
        }

        with patch("app.routers.auth.oauth") as mock_oauth:
            mock_oauth.google.authorize_redirect = AsyncMock(
                return_value=mock_redirect_response
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                response = await client.post(
                    "/auth/google",
                    json={"referral_key": "test-key"},
                )

            assert response.status_code == 200
            body = response.json()
            assert "redirect_url" in body
            assert "google" in body["redirect_url"].lower()

    @pytest.mark.asyncio
    async def test_returns_redirect_url_without_key(self, fresh_db):
        """AUTH-EP-1 edge case: POST /auth/google without referral_key still returns redirect_url."""
        from app.main import app

        app.state.db = fresh_db

        mock_redirect_response = MagicMock()
        mock_redirect_response.headers = {
            "location": "https://accounts.google.com/o/oauth2/auth?state=abc123"
        }

        with patch("app.routers.auth.oauth") as mock_oauth:
            mock_oauth.google.authorize_redirect = AsyncMock(
                return_value=mock_redirect_response
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                response = await client.post(
                    "/auth/google",
                    json={},
                )

            assert response.status_code == 200
            body = response.json()
            assert "redirect_url" in body


# ---------------------------------------------------------------------------
# AUTH-EP-2: GET /auth/google/callback - Existing User
# Tests: spec/backend/rest_api/test.md#AUTH-EP-2
# ---------------------------------------------------------------------------


class TestGoogleCallbackExistingUser:
    """GET /auth/google/callback for existing users."""

    @pytest.mark.asyncio
    async def test_existing_user_sets_cookie_and_redirects(self, fresh_db):
        """AUTH-EP-2: Callback with valid code for existing user sets cookie and redirects."""
        from app.main import app

        app.state.db = fresh_db

        # Seed an existing user
        user = make_user(id="existing-user-1", google_id="google_existing")
        await insert_user(fresh_db, user)

        # Mock the Authlib OAuth exchange
        mock_token = {
            "userinfo": {
                "sub": "google_existing",
                "email": "existing@test.com",
                "name": "Existing User",
                "picture": "https://example.com/avatar.jpg",
            }
        }

        with patch("app.routers.auth.oauth") as mock_oauth:
            mock_oauth.google.authorize_access_token = AsyncMock(
                return_value=mock_token
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport,
                base_url="http://test",
                follow_redirects=False,
            ) as client:
                response = await client.get(
                    "/auth/google/callback",
                    params={"code": "valid-code", "state": "valid-state"},
                )

        # Should redirect to /
        assert response.status_code in (302, 307)
        assert response.headers.get("location") == "/"

        # Should set session_token cookie
        set_cookie = response.headers.get("set-cookie", "")
        assert "session_token" in set_cookie
        assert "httponly" in set_cookie.lower()


# ---------------------------------------------------------------------------
# AUTH-EP-3: GET /auth/google/callback - New User with Valid Key
# Tests: spec/backend/rest_api/test.md#AUTH-EP-3
# ---------------------------------------------------------------------------


class TestGoogleCallbackNewUserWithKey:
    """GET /auth/google/callback for new user with valid referral key."""

    @pytest.mark.asyncio
    async def test_new_user_with_valid_key_creates_user(self, fresh_db):
        """AUTH-EP-3: Callback for new user with valid key creates user, sets cookie, redirects."""
        from app.main import app

        app.state.db = fresh_db

        # Seed a valid referral key
        ref_key = make_referral_key(key="valid-ref-key")
        await insert_referral_key(fresh_db, ref_key)

        mock_token = {
            "userinfo": {
                "sub": "google_new_user",
                "email": "new@test.com",
                "name": "New User",
                "picture": "https://example.com/new_avatar.jpg",
            }
        }

        with patch("app.routers.auth.oauth") as mock_oauth:
            mock_oauth.google.authorize_access_token = AsyncMock(
                return_value=mock_token
            )

            # Mock the session to contain the referral key
            with patch("app.routers.auth._get_session_data") as mock_session:
                mock_session.return_value = {"referral_key": "valid-ref-key"}

                transport = ASGITransport(app=app)
                async with AsyncClient(
                    transport=transport,
                    base_url="http://test",
                    follow_redirects=False,
                ) as client:
                    response = await client.get(
                        "/auth/google/callback",
                        params={"code": "valid-code", "state": "valid-state"},
                    )

        # Should redirect to /
        assert response.status_code in (302, 307)
        assert response.headers.get("location") == "/"

        # Should set session_token cookie
        set_cookie = response.headers.get("set-cookie", "")
        assert "session_token" in set_cookie

        # Verify user was created in DB
        cursor = await fresh_db.execute(
            "SELECT * FROM users WHERE google_id = ?", ("google_new_user",)
        )
        row = await cursor.fetchone()
        assert row is not None

        # Verify referral key was marked as used
        cursor = await fresh_db.execute(
            "SELECT used_by FROM referral_keys WHERE key = ?", ("valid-ref-key",)
        )
        key_row = await cursor.fetchone()
        assert key_row["used_by"] is not None


# ---------------------------------------------------------------------------
# AUTH-EP-4: GET /auth/google/callback - New User without Key
# Tests: spec/backend/rest_api/test.md#AUTH-EP-4
# ---------------------------------------------------------------------------


class TestGoogleCallbackNewUserWithoutKey:
    """GET /auth/google/callback for new user without referral key."""

    @pytest.mark.asyncio
    async def test_new_user_without_key_redirects_with_error(self, fresh_db):
        """AUTH-EP-4: Callback for new user without key redirects with error."""
        from app.main import app

        app.state.db = fresh_db

        mock_token = {
            "userinfo": {
                "sub": "google_no_key_user",
                "email": "nokey@test.com",
                "name": "No Key User",
                "picture": None,
            }
        }

        with patch("app.routers.auth.oauth") as mock_oauth:
            mock_oauth.google.authorize_access_token = AsyncMock(
                return_value=mock_token
            )

            # Mock the session to have no referral key
            with patch("app.routers.auth._get_session_data") as mock_session:
                mock_session.return_value = {}

                transport = ASGITransport(app=app)
                async with AsyncClient(
                    transport=transport,
                    base_url="http://test",
                    follow_redirects=False,
                ) as client:
                    response = await client.get(
                        "/auth/google/callback",
                        params={"code": "valid-code", "state": "valid-state"},
                    )

        # Should redirect to /sign-in with error
        assert response.status_code in (302, 307)
        location = response.headers.get("location", "")
        assert "/sign-in" in location
        assert "error=" in location

        # Verify no user was created
        cursor = await fresh_db.execute(
            "SELECT * FROM users WHERE google_id = ?", ("google_no_key_user",)
        )
        row = await cursor.fetchone()
        assert row is None


# ---------------------------------------------------------------------------
# AUTH-EP-5: GET /auth/google/callback - State Mismatch
# Tests: spec/backend/rest_api/test.md#AUTH-EP-5
# ---------------------------------------------------------------------------


class TestGoogleCallbackStateMismatch:
    """GET /auth/google/callback with invalid state."""

    @pytest.mark.asyncio
    async def test_invalid_state_returns_error_redirect(self, fresh_db):
        """AUTH-EP-5: Callback with invalid state redirects to sign-in with error."""
        from app.main import app

        app.state.db = fresh_db

        with patch("app.routers.auth.oauth") as mock_oauth:
            # Authlib raises OAuthError when state mismatches
            from authlib.integrations.starlette_client import OAuthError

            mock_oauth.google.authorize_access_token = AsyncMock(
                side_effect=OAuthError(
                    error="invalid_state", description="State mismatch"
                )
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport,
                base_url="http://test",
                follow_redirects=False,
            ) as client:
                response = await client.get(
                    "/auth/google/callback",
                    params={"code": "some-code", "state": "wrong-state"},
                )

        # Should redirect to sign-in with error
        assert response.status_code in (302, 307)
        location = response.headers.get("location", "")
        assert "/sign-in" in location
        assert "error=" in location


# ---------------------------------------------------------------------------
# AUTH-EP-6: GET /auth/me - Authenticated
# Tests: spec/backend/rest_api/test.md#AUTH-EP-6
# ---------------------------------------------------------------------------


class TestGetMe:
    """GET /auth/me endpoint."""

    @pytest.mark.asyncio
    async def test_returns_user_info(self, authed_client, test_user):
        """AUTH-EP-6: GET /auth/me with valid session returns user info."""
        response = await authed_client.get("/auth/me")
        body = assert_success_response(response, 200)

        assert body["user_id"] == test_user["id"]
        assert body["email"] == test_user["email"]
        assert body["name"] == test_user["name"]
        assert "avatar_url" in body


# ---------------------------------------------------------------------------
# AUTH-EP-7: GET /auth/me - Unauthenticated
# Tests: spec/backend/rest_api/test.md#AUTH-EP-7
# ---------------------------------------------------------------------------


class TestGetMeUnauthenticated:
    """GET /auth/me without session."""

    @pytest.mark.asyncio
    async def test_returns_401(self, fresh_db):
        """AUTH-EP-7: GET /auth/me without session cookie returns 401."""
        from app.main import app

        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            response = await client.get("/auth/me")

        assert_error_response(response, 401)


# ---------------------------------------------------------------------------
# AUTH-EP-8: POST /auth/logout - Authenticated
# Tests: spec/backend/rest_api/test.md#AUTH-EP-8
# ---------------------------------------------------------------------------


class TestLogout:
    """POST /auth/logout endpoint."""

    @pytest.mark.asyncio
    async def test_logout_returns_success(self, authed_client):
        """AUTH-EP-8: POST /auth/logout with valid session returns {success: true}."""
        response = await authed_client.post("/auth/logout")
        body = assert_success_response(response, 200)
        assert body["success"] is True

    @pytest.mark.asyncio
    async def test_logout_clears_cookie(self, authed_client):
        """AUTH-EP-9 (partial): POST /auth/logout clears session cookie."""
        response = await authed_client.post("/auth/logout")
        assert response.status_code == 200

        # Check that the response clears the cookie
        set_cookie = response.headers.get("set-cookie", "")
        assert "session_token" in set_cookie
        # Cookie should be cleared (max-age=0 or expires in the past)
        cookie_lower = set_cookie.lower()
        assert (
            "max-age=0" in cookie_lower
            or 'session_token=""' in cookie_lower
            or "session_token=;" in cookie_lower
        )

    @pytest.mark.asyncio
    async def test_logout_deletes_session_from_db(
        self, fresh_db, test_session, authed_client
    ):
        """AUTH-EP-8: POST /auth/logout deletes session from database."""
        response = await authed_client.post("/auth/logout")
        assert response.status_code == 200

        # Verify session was deleted from DB
        cursor = await fresh_db.execute(
            "SELECT * FROM sessions WHERE id = ?", (test_session["id"],)
        )
        row = await cursor.fetchone()
        assert row is None


# ---------------------------------------------------------------------------
# AUTH-EP-9: POST /auth/logout - Unauthenticated
# Tests: spec/backend/rest_api/test.md#AUTH-EP-9
# ---------------------------------------------------------------------------


class TestLogoutUnauthenticated:
    """POST /auth/logout without session."""

    @pytest.mark.asyncio
    async def test_returns_401(self, fresh_db):
        """AUTH-EP-9: POST /auth/logout without session cookie returns 401."""
        from app.main import app

        app.state.db = fresh_db
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            response = await client.post("/auth/logout")

        assert_error_response(response, 401)
