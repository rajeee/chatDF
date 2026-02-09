"""Application configuration loaded from environment variables.

Implements: spec/backend/plan.md#Configuration
"""

from __future__ import annotations

import functools

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """ChatDF backend settings.

    Required fields must be set via environment variables (or ``.env`` file).
    Optional fields have sensible defaults matching the spec.
    """

    # Required
    gemini_api_key: str
    google_client_id: str
    google_client_secret: str

    # Optional with defaults
    database_url: str = "sqlite:///chatdf.db"
    cors_origins: str = "http://localhost:5173"
    token_limit: int = 5_000_000
    worker_memory_limit: int = 512
    worker_pool_size: int = 4
    session_duration_days: int = 7
    secure_cookies: bool = False
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 500

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


@functools.lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (singleton)."""
    return Settings()
