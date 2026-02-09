"""In-memory LRU cache for SQL query results.

Caches query results keyed by (sql_hash, dataset_urls_hash) to avoid
re-executing identical queries against the same datasets.
"""

from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from threading import Lock

MAX_CACHE_SIZE = 100  # max entries
TTL_SECONDS = 300  # 5 minute TTL


class QueryCache:
    """Thread-safe LRU cache with TTL for SQL query results.

    Each entry is keyed by a SHA-256 hash of the normalised SQL text and the
    sorted dataset URLs.  Successful results are stored; error results are
    never cached.
    """

    def __init__(
        self,
        max_size: int = MAX_CACHE_SIZE,
        ttl: float = TTL_SECONDS,
    ) -> None:
        self._cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._lock = Lock()
        self._max_size = max_size
        self._ttl = ttl
        self._hits = 0
        self._misses = 0

    # ------------------------------------------------------------------
    # Key generation
    # ------------------------------------------------------------------

    def _make_key(self, sql: str, datasets: list[dict]) -> str:
        """Create a deterministic cache key from SQL and dataset URLs."""
        sorted_urls = sorted(d.get("url", "") for d in datasets)
        raw = sql.strip() + "|" + "|".join(sorted_urls)
        return hashlib.sha256(raw.encode()).hexdigest()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, sql: str, datasets: list[dict]) -> dict | None:
        """Return cached result, or ``None`` if not cached / expired."""
        key = self._make_key(sql, datasets)
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None
            timestamp, result = self._cache[key]
            if time.time() - timestamp > self._ttl:
                del self._cache[key]
                self._misses += 1
                return None
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._hits += 1
            return result

    def put(self, sql: str, datasets: list[dict], result: dict) -> None:
        """Cache a query result.  Error results are silently skipped."""
        if "error_type" in result or "error" in result:
            return
        key = self._make_key(sql, datasets)
        with self._lock:
            self._cache[key] = (time.time(), result)
            self._cache.move_to_end(key)
            while len(self._cache) > self._max_size:
                self._cache.popitem(last=False)

    def clear(self) -> None:
        """Remove all cached entries."""
        with self._lock:
            self._cache.clear()

    @property
    def stats(self) -> dict:
        """Return cache statistics."""
        with self._lock:
            return {
                "size": len(self._cache),
                "max_size": self._max_size,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(
                    self._hits / max(1, self._hits + self._misses) * 100, 1
                ),
            }
