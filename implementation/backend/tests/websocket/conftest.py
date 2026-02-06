"""WebSocket test configuration.

Creates a minimal FastAPI test app that only mounts the WebSocket router,
avoiding dependencies on the full ``app.main`` module (which may import
modules not yet available during incremental development).
"""

import os

# Set required env vars before any app module imports
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")

import pytest
from fastapi import FastAPI

from app.routers.websocket import router as ws_router
from app.services.connection_manager import ConnectionManager


def create_test_app() -> FastAPI:
    """Build a minimal FastAPI app with only the WebSocket router."""
    test_app = FastAPI()
    test_app.include_router(ws_router)
    return test_app


@pytest.fixture
def ws_test_app():
    """A minimal FastAPI app with only the websocket router mounted."""
    return create_test_app()
