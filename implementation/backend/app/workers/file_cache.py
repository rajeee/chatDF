"""File-system cache for downloaded remote datasets.

Caches URL downloads to disk keyed by SHA-256 hash of the URL.
Provides LRU eviction when total cache size exceeds a configurable limit.
Safe for concurrent access across worker processes (uses atomic rename).

No imports from ``app/`` -- fully self-contained, same as data_worker.py.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CACHE_DIR = os.environ.get("CHATDF_CACHE_DIR", "/tmp/chatdf_cache")
MAX_CACHE_BYTES = int(os.environ.get("CHATDF_MAX_CACHE_BYTES", str(1024 ** 3)))  # 1 GB
MAX_FILE_BYTES = int(os.environ.get("CHATDF_MAX_FILE_BYTES", str(500 * 1024 ** 2)))  # 500 MB
DOWNLOAD_TIMEOUT = 300  # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _suffix_for_url(url: str) -> str:
    """Detect file suffix from URL for correct format detection by Polars."""
    lower = url.lower()
    if lower.endswith(".csv.gz"):
        return ".csv.gz"
    if lower.endswith(".csv") or ".csv" in lower:
        return ".csv"
    if lower.endswith(".tsv") or ".tsv" in lower:
        return ".tsv"
    return ".parquet"


def _cache_key(url: str) -> str:
    """Return SHA-256 hex digest of *url*."""
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def _cache_path(url: str) -> str:
    """Return the full cache file path for *url*."""
    key = _cache_key(url)
    suffix = _suffix_for_url(url)
    return os.path.join(CACHE_DIR, key + suffix)


def _ensure_cache_dir() -> None:
    """Create the cache directory if it doesn't exist."""
    os.makedirs(CACHE_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# LRU eviction
# ---------------------------------------------------------------------------

def _evict_lru() -> None:
    """Delete least-recently-used files until total cache size is under the limit.

    Uses file *access time* (``os.path.getatime``) as the LRU metric.
    Falls back to modification time if atime is unavailable.
    """
    try:
        entries = []
        for name in os.listdir(CACHE_DIR):
            path = os.path.join(CACHE_DIR, name)
            if not os.path.isfile(path):
                continue
            try:
                stat = os.stat(path)
                entries.append((path, stat.st_atime, stat.st_size))
            except OSError:
                continue

        total_size = sum(e[2] for e in entries)
        if total_size <= MAX_CACHE_BYTES:
            return

        # Sort by access time ascending (oldest first)
        entries.sort(key=lambda e: e[1])

        for path, _atime, size in entries:
            if total_size <= MAX_CACHE_BYTES:
                break
            try:
                os.unlink(path)
                total_size -= size
                logger.info("Cache evict: removed %s (%.1f MB)", path, size / 1024 / 1024)
            except OSError:
                pass
    except OSError:
        # Cache dir might have been removed by another process; ignore.
        pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_cached(url: str) -> str | None:
    """Return the cached file path for *url* if it exists, else ``None``.

    Touching the file updates its access time so LRU eviction is correct.
    """
    path = _cache_path(url)
    if os.path.isfile(path):
        try:
            # Touch access time for LRU tracking
            os.utime(path, None)
        except OSError:
            pass
        return path
    return None


def download_and_cache(url: str) -> str:
    """Download *url* to the cache and return the cached file path.

    If the file is already cached, returns immediately.

    Raises:
        ValueError: If the downloaded file exceeds ``MAX_FILE_BYTES``.
        urllib.error.URLError / OSError: On network errors.
    """
    # Fast path: already cached
    cached = get_cached(url)
    if cached is not None:
        return cached

    _ensure_cache_dir()

    final_path = _cache_path(url)

    # Download to a temp file in the *same directory* so os.rename is atomic
    # (same filesystem).
    fd, tmp_path = tempfile.mkstemp(
        dir=CACHE_DIR,
        prefix=".download_",
        suffix=_suffix_for_url(url),
    )
    try:
        total_written = 0
        with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as response:
            with os.fdopen(fd, "wb") as f:
                fd = -1  # Prevent double-close
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    total_written += len(chunk)
                    if total_written > MAX_FILE_BYTES:
                        raise ValueError(
                            f"Remote file exceeds size limit "
                            f"({MAX_FILE_BYTES / (1024 ** 2):.0f} MB). "
                            f"Download aborted."
                        )
                    f.write(chunk)

        # Atomic rename into place.  Another process may have written the
        # same file concurrently -- that's fine, last-writer wins and the
        # content is identical.
        os.replace(tmp_path, final_path)
        tmp_path = None  # Prevent cleanup

        # Run eviction *after* placing the new file
        _evict_lru()

        return final_path

    finally:
        # Close fd if we haven't already handed it to fdopen
        if fd >= 0:
            try:
                os.close(fd)
            except OSError:
                pass
        # Remove temp file if download failed
        if tmp_path is not None:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def clear_cache() -> int:
    """Remove all files from the cache directory.

    Returns the number of files removed.
    """
    count = 0
    try:
        for name in os.listdir(CACHE_DIR):
            path = os.path.join(CACHE_DIR, name)
            if os.path.isfile(path):
                try:
                    os.unlink(path)
                    count += 1
                except OSError:
                    pass
    except OSError:
        pass
    return count


def cache_stats() -> dict:
    """Return basic cache statistics.

    Returns:
        {"file_count": int, "total_size_bytes": int, "cache_dir": str}
    """
    file_count = 0
    total_size = 0
    try:
        for name in os.listdir(CACHE_DIR):
            path = os.path.join(CACHE_DIR, name)
            if os.path.isfile(path):
                try:
                    total_size += os.path.getsize(path)
                    file_count += 1
                except OSError:
                    pass
    except OSError:
        pass
    return {
        "file_count": file_count,
        "total_size_bytes": total_size,
        "cache_dir": CACHE_DIR,
        "max_cache_bytes": MAX_CACHE_BYTES,
        "max_file_bytes": MAX_FILE_BYTES,
    }
