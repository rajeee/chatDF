"""Pure worker functions for data operations.

Implements: spec/backend/worker/plan.md#worker-functions

These functions are module-level (picklable) and run in worker processes.
They receive and return plain dicts/lists -- no Pydantic models cross
the process boundary. No imports from ``app/`` -- fully self-contained.
"""

from __future__ import annotations

import os
import tempfile
import urllib.error
import urllib.request

MAX_RESULT_ROWS = 1000
HEAD_REQUEST_TIMEOUT = 10  # seconds
DOWNLOAD_TIMEOUT = 300  # seconds for full file downloads


def _download_to_tempfile(url: str) -> str:
    """Download a URL to a temporary file and return the path.

    The caller is responsible for deleting the file when done.
    """
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as response:
        suffix = ".parquet"
        fd, path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
        except Exception:
            os.unlink(path)
            raise
    return path


def fetch_and_validate(url: str) -> dict:
    """Download file header and check if valid parquet.

    Implements: spec/backend/worker/spec.md#url-fetch--parquet-validation

    1. HEAD request to check URL accessibility (timeout 10s).
    2. Fetch first 4 bytes and verify parquet magic number (PAR1).

    Returns:
        {"valid": True} on success.
        {"valid": False, "error": str, "error_type": str} on failure.
    """
    try:
        # Step 1: HEAD request to check accessibility
        req = urllib.request.Request(url, method="HEAD")
        urllib.request.urlopen(req, timeout=HEAD_REQUEST_TIMEOUT)
    except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError) as exc:
        error_msg = str(exc)
        if isinstance(exc, urllib.error.HTTPError):
            return {
                "valid": False,
                "error": f"Could not access URL (HTTP {exc.code})",
                "error_type": "network",
            }
        return {
            "valid": False,
            "error": f"Could not access URL: {error_msg}",
            "error_type": "network",
        }

    try:
        # Step 2: Fetch the beginning of the file and check parquet magic bytes.
        # We download enough to check the 4-byte magic number.
        with urllib.request.urlopen(url, timeout=HEAD_REQUEST_TIMEOUT) as response:
            magic_bytes = response.read(4)

        if len(magic_bytes) < 4:
            return {
                "valid": False,
                "error": "Not a valid parquet file (too few bytes)",
                "error_type": "validation",
            }

        if magic_bytes != b"PAR1":
            return {
                "valid": False,
                "error": "Not a valid parquet file",
                "error_type": "validation",
            }

        return {"valid": True}

    except Exception as exc:
        return {
            "valid": False,
            "error": f"Failed to validate file: {exc}",
            "error_type": "network",
        }


def extract_schema(url: str) -> dict:
    """Read parquet schema without loading full data.

    Implements: spec/backend/worker/spec.md#schema-extraction

    Uses Polars scan_parquet with HTTP URL directly (range requests)
    to read schema without downloading the full file. Falls back to
    downloading to a temp file if direct URL access fails.

    Returns:
        {"columns": [{"name": str, "type": str}, ...], "row_count": int}
        On error: {"error_type": str, "message": str, "details": str | None}
    """
    try:
        import polars as pl

        # Try direct URL access first (uses HTTP range requests — fast)
        try:
            lazy_frame = pl.scan_parquet(url)
            schema = lazy_frame.collect_schema()
            columns = [
                {"name": name, "type": str(dtype)}
                for name, dtype in schema.items()
            ]
            row_count = lazy_frame.select(pl.len()).collect().item()
            return {"columns": columns, "row_count": row_count}
        except Exception:
            pass

        # Fallback: download to temp file
        tmp_path = _download_to_tempfile(url)
        try:
            lazy_frame = pl.scan_parquet(tmp_path)
            schema = lazy_frame.collect_schema()
            columns = [
                {"name": name, "type": str(dtype)}
                for name, dtype in schema.items()
            ]
            row_count = lazy_frame.select(pl.len()).collect().item()
            return {"columns": columns, "row_count": row_count}
        finally:
            os.unlink(tmp_path)

    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
        error_msg = str(exc)
        return {
            "error_type": "network",
            "message": f"Failed to download parquet file: {error_msg}",
            "details": error_msg,
        }
    except Exception as exc:
        error_msg = str(exc)
        error_type = "validation"
        if "network" in error_msg.lower() or "404" in error_msg or "connect" in error_msg.lower():
            error_type = "network"

        return {
            "error_type": error_type,
            "message": f"Failed to extract schema: {error_msg}",
            "details": error_msg,
        }


def execute_query(sql: str, datasets: list[dict]) -> dict:
    """Execute SQL query against parquet datasets.

    Implements: spec/backend/worker/spec.md#sql-query-execution

    Downloads datasets, loads them with Polars, registers each as a named
    table in a SQL context, executes the query, and returns up to 1000 rows.

    Args:
        sql: SQL query string.
        datasets: List of {"url": str, "table_name": str} dicts.

    Returns:
        {
            "rows": list[dict],    # up to 1000 rows
            "columns": list[str],  # column names
            "total_rows": int,     # actual total row count
        }
        On error: {"error_type": str, "message": str, "details": str | None}
    """
    tmp_paths = []
    try:
        import polars as pl

        ctx = pl.SQLContext()

        # Register each dataset as a named table (try URL directly first)
        for dataset in datasets:
            try:
                lf = pl.scan_parquet(dataset["url"])
                lf.collect_schema()  # force metadata read to verify access
                ctx.register(dataset["table_name"], lf)
            except Exception:
                tmp_path = _download_to_tempfile(dataset["url"])
                tmp_paths.append(tmp_path)
                lf = pl.scan_parquet(tmp_path)
                ctx.register(dataset["table_name"], lf)

        # Execute the query
        result_lf = ctx.execute(sql)

        # Collect the full result to get total row count
        result_df = result_lf.collect()
        total_rows = len(result_df)

        # Get column names
        columns = result_df.columns

        # Truncate to 1000 rows
        truncated_df = result_df.head(MAX_RESULT_ROWS)

        # Convert to list of dicts
        rows = truncated_df.to_dicts()

        return {
            "rows": rows,
            "columns": columns,
            "total_rows": total_rows,
        }

    except Exception as exc:
        error_msg = str(exc)
        return {
            "error_type": "sql",
            "message": f"SQL execution error: {error_msg}",
            "details": error_msg,
        }
    finally:
        for path in tmp_paths:
            if os.path.exists(path):
                os.unlink(path)
