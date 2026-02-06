---
status: draft
last_updated: 2026-02-05
tests: ./test.md
verifies: ./plan.md
---

# Rate Limiting Test Plan

## Fixtures (`tests/rate_limiting/conftest.py`)

### `seed_token_usage` — Helper to insert token_usage records at specific timestamps

```python
async def seed_token_usage(db, user_id, records):
    """Insert token_usage records. Each record is (input_tokens, output_tokens, hours_ago)."""
    for input_t, output_t, hours_ago in records:
        ts = (datetime.utcnow() - timedelta(hours=hours_ago)).isoformat()
        usage = make_token_usage(user_id=user_id, input_tokens=input_t, output_tokens=output_t, timestamp=ts)
        await insert_token_usage(db, usage)
```

### `user_at_usage` — User with specific token usage level

```python
@pytest.fixture
async def user_at_usage(db, test_user, request):
    """Parameterized fixture: creates a user with `param` total tokens used in the last 24h."""
    total = request.param
    await seed_token_usage(db, test_user["id"], [(total // 2, total - total // 2, 1)])
    return test_user
```

Usage: `@pytest.mark.parametrize("user_at_usage", [1_000_000, 4_000_000, 5_000_000], indirect=True)`

### Constant: `TOKEN_LIMIT = 5_000_000`

Test config sets `TOKEN_LIMIT=5_000_000` to match spec.

## Test Implementation by Scenario

### Rolling Window Tests (`test_window.py`)

Tests: [test.md#WINDOW-1, WINDOW-2](./test.md)

| Scenario | Approach |
|----------|----------|
| WINDOW-1 | Seed records at 2h ago (in window), 23h59m ago (in window), and 24h ago (out of window). Call `check_limit`. Assert total includes first two, excludes third. |
| WINDOW-2 | Seed all usage at 23h ago (4.5M tokens). Call `check_limit`. Assert `allowed=True` because tokens are still in window. Then seed usage at 25h ago. Assert those excluded. |

**Time manipulation**: Use `freezegun` or `monkeypatch` to control `datetime.utcnow()` for precise window boundary testing.

### Under-Limit Tests (`test_under_limit.py`)

Tests: [test.md#UNDER-1, UNDER-2](./test.md)

| Scenario | Approach |
|----------|----------|
| UNDER-1 | Seed 1M tokens. Call `check_limit`. Assert `allowed=True`, `warning=False`. |
| UNDER-2 | Seed 3,999,999 tokens (79.99%). Call `check_limit`. Assert `allowed=True`, `warning=False`. |

### Warning Tests (`test_warning.py`)

Tests: [test.md#WARN-1, WARN-2](./test.md)

| Scenario | Approach |
|----------|----------|
| WARN-1 | Seed 4,000,000 tokens (80%). Call `check_limit`. Assert `warning=True`, `usage_percent >= 80`, `remaining_tokens == 1_000_000`. |
| WARN-2 | Seed 4,250,000 tokens (85%). Call `check_limit`. Assert `allowed=True` (request proceeds), `warning=True`. |

### Exceeded Tests (`test_exceeded.py`)

Tests: [test.md#EXCEED-1 through EXCEED-4](./test.md)

| Scenario | Approach |
|----------|----------|
| EXCEED-1 | Seed exactly 5,000,000 tokens. Call `check_limit`. Assert `allowed=False`, `resets_in_seconds > 0`. |
| EXCEED-2 | Seed 5,100,000 tokens. Call `check_limit`. Assert `allowed=False`. |
| EXCEED-3 | Seed 4,900,000 tokens. Call `check_limit` (allowed). Then call `record_usage` with 200,000 tokens. Call `check_limit` again. Assert now `allowed=False`. |
| EXCEED-4 | Seed 4,999,000 tokens. Record 50,000. Assert total is 5,049,000. Assert next `check_limit` returns `allowed=False`. |

For EXCEED-3, this verifies the "no mid-stream cutoff" behavior: the first check allows the request, recording happens after completion, then the next check blocks.

### Allowed Operations Tests (`test_allowed.py`)

Tests: [test.md#ALLOWED-1 through ALLOWED-3](./test.md)

These test at the endpoint level using `authed_client`:

| Scenario | Approach |
|----------|----------|
| ALLOWED-1 | Seed 5M+ tokens. POST to add a dataset. Assert 201 (not 429). |
| ALLOWED-2 | Seed 5M+ tokens. POST/GET/DELETE conversations. Assert all succeed. |
| ALLOWED-3 | Seed 5M+ tokens. POST message. Assert 429 returned. |

This confirms rate limiting only applies to chat messages, not dataset or conversation operations.

### Reset Tests (`test_reset.py`)

Tests: [test.md#RESET-1, RESET-2](./test.md)

| Scenario | Approach |
|----------|----------|
| RESET-1 | Seed usage at 20h ago. Call `check_limit`. Assert `resets_in_seconds` is approximately 4 * 3600 (within 60s tolerance). |
| RESET-2 | Seed usage at 23.5h ago. Freeze time, advance by 1h (to 24.5h ago). Call `check_limit`. Assert `allowed=True` (tokens fell out of window). |

### Clock Tests (`test_reset.py`)

Tests: [test.md#CLOCK-1, CLOCK-2](./test.md)

| Scenario | Approach |
|----------|----------|
| CLOCK-1 | Call `record_usage`. Inspect the inserted row's `timestamp`. Assert it matches server time (via `datetime.utcnow()`), not any client-provided time. |
| CLOCK-2 | Create two sessions for same user. Seed usage from both. Call `check_limit` for the user. Assert total includes tokens from both sessions (shared budget). |

## Time Testing Strategy

For precise time-dependent tests, use **`freezegun`** library:

```python
from freezegun import freeze_time

@freeze_time("2026-02-05 12:00:00")
async def test_WINDOW_1_rolling_window():
    # Seed record at "2026-02-05 10:00:00" (2h ago, in window)
    # Seed record at "2026-02-04 12:01:00" (23h59m ago, in window)
    # Seed record at "2026-02-04 12:00:00" (exactly 24h ago, out of window)
    ...
```

This avoids flaky tests caused by timing differences between seeding and checking.

## Scope

### In Scope
- All rate limiting test scenarios from rate_limiting/test.md
- Testing `rate_limit_service.py` functions directly
- Time-dependent window calculations
- Integration with endpoint-level rate limit enforcement

### Out of Scope
- Token counting from Gemini responses (see llm/test_plan.md)
- Usage stats UI display (see frontend test plans)
