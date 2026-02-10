"""Comprehensive tests for app.exceptions — domain exception classes.

Tests: NotFoundError, ForbiddenError, RateLimitError, ConflictError
Verifies: spec/backend/rest_api/plan.md#error-response-standardization
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# NotFoundError
# ---------------------------------------------------------------------------


class TestNotFoundError:
    """Tests for NotFoundError domain exception."""

    def test_instantiation_with_message(self):
        from app.exceptions import NotFoundError

        err = NotFoundError("Conversation not found")
        assert err.message == "Conversation not found"

    def test_str_representation(self):
        from app.exceptions import NotFoundError

        err = NotFoundError("Dataset not found")
        assert str(err) == "Dataset not found"

    def test_inherits_from_exception(self):
        from app.exceptions import NotFoundError

        assert issubclass(NotFoundError, Exception)

    def test_is_instance_of_exception(self):
        from app.exceptions import NotFoundError

        err = NotFoundError("missing")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        from app.exceptions import NotFoundError

        with pytest.raises(NotFoundError) as exc_info:
            raise NotFoundError("User not found")
        assert exc_info.value.message == "User not found"

    def test_can_be_caught_as_exception(self):
        from app.exceptions import NotFoundError

        with pytest.raises(Exception):
            raise NotFoundError("generic catch")

    def test_empty_message(self):
        from app.exceptions import NotFoundError

        err = NotFoundError("")
        assert err.message == ""
        assert str(err) == ""

    def test_long_message(self):
        from app.exceptions import NotFoundError

        msg = "x" * 500
        err = NotFoundError(msg)
        assert err.message == msg


# ---------------------------------------------------------------------------
# ForbiddenError
# ---------------------------------------------------------------------------


class TestForbiddenError:
    """Tests for ForbiddenError domain exception."""

    def test_instantiation_with_message(self):
        from app.exceptions import ForbiddenError

        err = ForbiddenError("Not authorized")
        assert err.message == "Not authorized"

    def test_str_representation(self):
        from app.exceptions import ForbiddenError

        err = ForbiddenError("Access denied")
        assert str(err) == "Access denied"

    def test_inherits_from_exception(self):
        from app.exceptions import ForbiddenError

        assert issubclass(ForbiddenError, Exception)

    def test_is_instance_of_exception(self):
        from app.exceptions import ForbiddenError

        err = ForbiddenError("forbidden")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        from app.exceptions import ForbiddenError

        with pytest.raises(ForbiddenError) as exc_info:
            raise ForbiddenError("You do not own this conversation")
        assert exc_info.value.message == "You do not own this conversation"

    def test_can_be_caught_as_exception(self):
        from app.exceptions import ForbiddenError

        with pytest.raises(Exception):
            raise ForbiddenError("generic catch")

    def test_empty_message(self):
        from app.exceptions import ForbiddenError

        err = ForbiddenError("")
        assert err.message == ""


# ---------------------------------------------------------------------------
# RateLimitError
# ---------------------------------------------------------------------------


class TestRateLimitError:
    """Tests for RateLimitError domain exception."""

    def test_instantiation_with_message_and_resets_in_seconds(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("Rate limit exceeded", resets_in_seconds=120)
        assert err.message == "Rate limit exceeded"
        assert err.resets_in_seconds == 120

    def test_str_representation(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("Too many requests", resets_in_seconds=60)
        assert str(err) == "Too many requests"

    def test_inherits_from_exception(self):
        from app.exceptions import RateLimitError

        assert issubclass(RateLimitError, Exception)

    def test_is_instance_of_exception(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("limit", resets_in_seconds=10)
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        from app.exceptions import RateLimitError

        with pytest.raises(RateLimitError) as exc_info:
            raise RateLimitError("Exceeded", resets_in_seconds=3600)
        assert exc_info.value.message == "Exceeded"
        assert exc_info.value.resets_in_seconds == 3600

    def test_can_be_caught_as_exception(self):
        from app.exceptions import RateLimitError

        with pytest.raises(Exception):
            raise RateLimitError("generic", resets_in_seconds=1)

    def test_resets_in_seconds_is_keyword_only(self):
        """resets_in_seconds must be passed as keyword argument."""
        from app.exceptions import RateLimitError

        with pytest.raises(TypeError):
            RateLimitError("msg", 120)  # type: ignore[misc]

    def test_resets_in_seconds_required(self):
        """Omitting resets_in_seconds raises TypeError."""
        from app.exceptions import RateLimitError

        with pytest.raises(TypeError):
            RateLimitError("msg")  # type: ignore[call-arg]

    def test_resets_in_seconds_zero(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("reset now", resets_in_seconds=0)
        assert err.resets_in_seconds == 0

    def test_resets_in_seconds_large_value(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("long wait", resets_in_seconds=86400)
        assert err.resets_in_seconds == 86400

    def test_empty_message_with_resets(self):
        from app.exceptions import RateLimitError

        err = RateLimitError("", resets_in_seconds=30)
        assert err.message == ""
        assert str(err) == ""


# ---------------------------------------------------------------------------
# ConflictError
# ---------------------------------------------------------------------------


class TestConflictError:
    """Tests for ConflictError domain exception."""

    def test_instantiation_with_message(self):
        from app.exceptions import ConflictError

        err = ConflictError("Generation already in progress")
        assert err.message == "Generation already in progress"

    def test_str_representation(self):
        from app.exceptions import ConflictError

        err = ConflictError("Duplicate action")
        assert str(err) == "Duplicate action"

    def test_inherits_from_exception(self):
        from app.exceptions import ConflictError

        assert issubclass(ConflictError, Exception)

    def test_is_instance_of_exception(self):
        from app.exceptions import ConflictError

        err = ConflictError("conflict")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        from app.exceptions import ConflictError

        with pytest.raises(ConflictError) as exc_info:
            raise ConflictError("Already exists")
        assert exc_info.value.message == "Already exists"

    def test_can_be_caught_as_exception(self):
        from app.exceptions import ConflictError

        with pytest.raises(Exception):
            raise ConflictError("generic catch")

    def test_empty_message(self):
        from app.exceptions import ConflictError

        err = ConflictError("")
        assert err.message == ""


# ---------------------------------------------------------------------------
# Cross-exception tests
# ---------------------------------------------------------------------------


class TestExceptionDistinctness:
    """Verify each exception type is distinct and does not accidentally catch others."""

    def test_not_found_is_not_forbidden(self):
        from app.exceptions import ForbiddenError, NotFoundError

        assert not issubclass(NotFoundError, ForbiddenError)
        assert not issubclass(ForbiddenError, NotFoundError)

    def test_rate_limit_is_not_conflict(self):
        from app.exceptions import ConflictError, RateLimitError

        assert not issubclass(RateLimitError, ConflictError)
        assert not issubclass(ConflictError, RateLimitError)

    def test_not_found_does_not_catch_forbidden(self):
        from app.exceptions import ForbiddenError, NotFoundError

        with pytest.raises(ForbiddenError):
            try:
                raise ForbiddenError("forbidden")
            except NotFoundError:
                pytest.fail("NotFoundError should not catch ForbiddenError")

    def test_all_four_are_distinct(self):
        from app.exceptions import ConflictError, ForbiddenError, NotFoundError, RateLimitError

        types = [NotFoundError, ForbiddenError, RateLimitError, ConflictError]
        for i, t1 in enumerate(types):
            for j, t2 in enumerate(types):
                if i != j:
                    assert not issubclass(t1, t2), f"{t1.__name__} should not be subclass of {t2.__name__}"
