"""Domain exception classes for ChatDF.

These exceptions are raised by service-layer code and translated into
HTTP error responses by exception handlers registered in ``main.py``.

Implements: spec/backend/rest_api/plan.md#error-response-standardization
"""

from __future__ import annotations


class NotFoundError(Exception):
    """Raised when a requested resource does not exist."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class RateLimitError(Exception):
    """Raised when the user has exceeded their token usage limit."""

    def __init__(self, message: str, *, resets_in_seconds: int) -> None:
        super().__init__(message)
        self.message = message
        self.resets_in_seconds = resets_in_seconds


class ConflictError(Exception):
    """Raised when an action conflicts with current state (e.g., duplicate generation)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message
