"""Persistent SQLite-backed cache for SQL query results.

Stores query results in the ``query_results_cache`` table so they survive
server restarts and are shared across sessions.  Works alongside the
in-memory :class:`QueryCache` — the in-memory cache is checked first for
speed, and this persistent layer is the fallback.

Key generation reuses the same SHA-256 scheme as the in-memory cache so
that keys are compatible between the two layers.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta

import aiosqlite

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PERSISTENT_TTL_SECONDS = 3600  # 1 hour
MAX_PERSISTENT_CACHE_SIZE = 500  # max entries in the persistent cache


# ---------------------------------------------------------------------------
# Key generation (mirrors QueryCache._make_key)
# ---------------------------------------------------------------------------


def _make_key(sql: str, datasets: list[dict]) -> str:
    """Create a deterministic cache key from SQL and dataset URLs.

    Uses the same algorithm as :meth:`QueryCache._make_key` so the two
    cache layers produce identical keys for the same inputs.
    """
    sorted_urls = sorted(d.get("url", "") for d in datasets)
    raw = sql.strip() + "|" + "|".join(sorted_urls)
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get(
    sql: str,
    datasets: list[dict],
    db_conn: aiosqlite.Connection,
) -> dict | None:
    """Return a cached result from the persistent store, or ``None``.

    If the entry exists but has expired, it is deleted and ``None`` is
    returned.
    """
    key = _make_key(sql, datasets)
    now = datetime.utcnow().isoformat()

    try:
        cursor = await db_conn.execute(
            "SELECT result_json, expires_at FROM query_results_cache WHERE cache_key = ?",
            (key,),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        result_json, expires_at = row[0], row[1]

        # Check expiry
        if expires_at <= now:
            await db_conn.execute(
                "DELETE FROM query_results_cache WHERE cache_key = ?",
                (key,),
            )
            await db_conn.commit()
            return None

        return json.loads(result_json)
    except Exception:
        logger.exception("Error reading from persistent cache")
        return None


async def put(
    sql: str,
    datasets: list[dict],
    result: dict,
    db_conn: aiosqlite.Connection,
) -> None:
    """Store a query result in the persistent cache.

    Error results (containing ``error_type`` or ``error`` keys) are
    silently skipped.  If the cache exceeds :data:`MAX_PERSISTENT_CACHE_SIZE`,
    the oldest entries are evicted.
    """
    # Skip error results
    if "error_type" in result or "error" in result:
        return

    key = _make_key(sql, datasets)
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=PERSISTENT_TTL_SECONDS)

    sorted_urls = sorted(d.get("url", "") for d in datasets)
    dataset_urls_str = "|".join(sorted_urls)

    row_count = result.get("total_rows") or result.get("row_count")

    try:
        result_json = json.dumps(result, default=str)

        await db_conn.execute(
            """INSERT OR REPLACE INTO query_results_cache
               (cache_key, sql_query, dataset_urls, result_json, row_count, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                key,
                sql.strip(),
                dataset_urls_str,
                result_json,
                row_count,
                now.isoformat(),
                expires_at.isoformat(),
            ),
        )
        await db_conn.commit()

        # Enforce max cache size — evict oldest entries
        cursor = await db_conn.execute(
            "SELECT COUNT(*) FROM query_results_cache",
        )
        (count,) = await cursor.fetchone()

        if count > MAX_PERSISTENT_CACHE_SIZE:
            overflow = count - MAX_PERSISTENT_CACHE_SIZE
            await db_conn.execute(
                """DELETE FROM query_results_cache
                   WHERE cache_key IN (
                       SELECT cache_key FROM query_results_cache
                       ORDER BY created_at ASC
                       LIMIT ?
                   )""",
                (overflow,),
            )
            await db_conn.commit()

    except Exception:
        logger.exception("Error writing to persistent cache")


async def cleanup(db_conn: aiosqlite.Connection) -> int:
    """Remove all expired entries from the persistent cache.

    Returns:
        The number of rows removed.
    """
    now = datetime.utcnow().isoformat()
    try:
        cursor = await db_conn.execute(
            "DELETE FROM query_results_cache WHERE expires_at <= ?",
            (now,),
        )
        await db_conn.commit()
        return cursor.rowcount
    except Exception:
        logger.exception("Error during persistent cache cleanup")
        return 0


async def stats(db_conn: aiosqlite.Connection) -> dict:
    """Return statistics about the persistent cache.

    Returns:
        A dict with ``size``, ``oldest_entry``, and ``newest_entry``.
    """
    try:
        cursor = await db_conn.execute(
            "SELECT COUNT(*) FROM query_results_cache",
        )
        (size,) = await cursor.fetchone()

        oldest_entry = None
        newest_entry = None

        if size > 0:
            cursor = await db_conn.execute(
                "SELECT MIN(created_at), MAX(created_at) FROM query_results_cache",
            )
            row = await cursor.fetchone()
            oldest_entry = row[0]
            newest_entry = row[1]

        return {
            "size": size,
            "oldest_entry": oldest_entry,
            "newest_entry": newest_entry,
        }
    except Exception:
        logger.exception("Error reading persistent cache stats")
        return {"size": 0, "oldest_entry": None, "newest_entry": None}
