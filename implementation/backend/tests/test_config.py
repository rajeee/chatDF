"""Tests for app.config — Settings class and get_settings() singleton.

Tests: spec/backend/test.md#CONFIG-1,2
Verifies: spec/backend/plan.md#Configuration
"""

from __future__ import annotations

import sys
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REQUIRED_ENV = {
    "GEMINI_API_KEY": "test-gemini-key",
    "GOOGLE_CLIENT_ID": "test-client-id",
    "GOOGLE_CLIENT_SECRET": "test-client-secret",
}

# Optional env vars that may be present in the real environment / .env file.
# Tests that verify defaults must ensure these are absent.
OPTIONAL_ENV_KEYS = [
    "DATABASE_URL",
    "CORS_ORIGINS",
    "TOKEN_LIMIT",
    "WORKER_MEMORY_LIMIT",
    "WORKER_POOL_SIZE",
    "SESSION_DURATION_DAYS",
    "SECURE_COOKIES",
]


def _set_required_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set only the required env vars so Settings can be constructed.

    Also removes any optional env vars that might leak from the host
    environment so that class-level defaults are exercised.
    """
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    for key in OPTIONAL_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


# ---------------------------------------------------------------------------
# CONFIG-1: Defaults are correct when only required fields provided
# ---------------------------------------------------------------------------


class TestSettingsDefaults:
    """When only the three required env vars are set, all optional fields
    should fall back to their documented defaults.

    We pass ``_env_file=None`` to prevent pydantic-settings from reading the
    real ``.env`` file that may be present in the working directory.
    """

    def test_database_url_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.database_url == "sqlite:///chatdf.db"

    def test_cors_origins_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.cors_origins == "http://localhost:5173"

    def test_token_limit_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.token_limit == 5_000_000

    def test_worker_memory_limit_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.worker_memory_limit == 512

    def test_worker_pool_size_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.worker_pool_size == 4

    def test_session_duration_days_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.session_duration_days == 7

    def test_required_fields_populated(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.gemini_api_key == "test-gemini-key"
        assert settings.google_client_id == "test-client-id"
        assert settings.google_client_secret == "test-client-secret"


# ---------------------------------------------------------------------------
# CONFIG-1: Env var override works
# ---------------------------------------------------------------------------


class TestSettingsOverride:
    """Setting optional env vars should override defaults.

    We pass ``_env_file=None`` so only the explicit monkeypatched env vars
    are considered, not values from a ``.env`` file on disk.
    """

    def test_override_database_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        monkeypatch.setenv("DATABASE_URL", "sqlite:///custom.db")
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.database_url == "sqlite:///custom.db"

    def test_override_cors_origins(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        monkeypatch.setenv("CORS_ORIGINS", "http://example.com,http://other.com")
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.cors_origins == "http://example.com,http://other.com"

    def test_override_token_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        monkeypatch.setenv("TOKEN_LIMIT", "1000000")
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.token_limit == 1_000_000

    def test_override_worker_memory_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        monkeypatch.setenv("WORKER_MEMORY_LIMIT", "1024")
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.worker_memory_limit == 1024

    def test_override_worker_pool_size(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        monkeypatch.setenv("WORKER_POOL_SIZE", "8")
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.worker_pool_size == 8

    def test_override_session_duration_days(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        monkeypatch.setenv("SESSION_DURATION_DAYS", "30")
        from app.config import Settings

        settings = Settings(_env_file=None)
        assert settings.session_duration_days == 30


# ---------------------------------------------------------------------------
# CONFIG-2: Missing required fields raise validation error
# ---------------------------------------------------------------------------


class TestSettingsMissingRequired:
    """Omitting any of the three required env vars should raise a
    ``ValidationError`` from pydantic-settings.

    We pass ``_env_file=None`` to prevent pydantic-settings from
    falling back to the ``.env`` file which supplies all three keys.
    """

    def test_missing_gemini_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "id")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        from pydantic import ValidationError

        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings(_env_file=None)

    def test_missing_google_client_id(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
        monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
        from pydantic import ValidationError

        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings(_env_file=None)

    def test_missing_google_client_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "id")
        monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
        from pydantic import ValidationError

        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings(_env_file=None)

    def test_missing_all_required(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
        monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
        from pydantic import ValidationError

        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings(_env_file=None)


# ---------------------------------------------------------------------------
# Singleton pattern: get_settings() returns the same object
# ---------------------------------------------------------------------------


class TestGetSettingsSingleton:
    """``get_settings()`` uses ``lru_cache`` so it returns the same instance."""

    def test_same_instance_returned(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import get_settings

        # Clear cache so the test env vars are picked up
        get_settings.cache_clear()

        first = get_settings()
        second = get_settings()
        assert first is second

    def test_cache_clear_produces_new_instance(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_required_env(monkeypatch)
        from app.config import get_settings

        get_settings.cache_clear()
        first = get_settings()

        get_settings.cache_clear()
        second = get_settings()

        # After clearing the cache a new object should be created
        assert first is not second
        # But both should have the same values
        assert first.gemini_api_key == second.gemini_api_key
