"""Pure worker functions for data operations.

Implements: spec/backend/worker/plan.md#worker-functions

These functions are module-level (picklable) and run in worker processes.
They receive and return plain dicts/lists -- no Pydantic models cross
the process boundary. No imports from ``app/`` -- fully self-contained.
"""

from __future__ import annotations

import os
import re
import tempfile
import time
import urllib.error
import urllib.request

MAX_RESULT_ROWS = 1000
MAX_QUERY_ROWS = 10000  # Auto-LIMIT cap for SELECT queries without LIMIT
HEAD_REQUEST_TIMEOUT = 10  # seconds
DOWNLOAD_TIMEOUT = 300  # seconds for full file downloads


def _has_limit(sql: str) -> bool:
    """Check if SQL already contains a LIMIT clause.

    Strips string literals, double-quoted identifiers, single-line comments
    (``--``), and block comments (``/* */``) before checking so that a LIMIT
    inside a comment or string literal is not treated as a real clause.
    """
    cleaned = re.sub(r"'[^']*'", "", sql)
    cleaned = re.sub(r'"[^"]*"', "", cleaned)
    cleaned = re.sub(r"--.*$", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
    return bool(re.search(r"\bLIMIT\b", cleaned, re.IGNORECASE))


def _is_select(sql: str) -> bool:
    """Check if the SQL statement is a SELECT (not DDL/DML like CREATE, INSERT, etc.)."""
    stripped = sql.strip().lstrip("(")
    return stripped.upper().startswith("SELECT") or stripped.upper().startswith("WITH")


def _resolve_url(url: str) -> tuple[str, bool]:
    """Resolve a URL to a path suitable for Polars.

    For ``file://`` URIs, strips the prefix to return a local path.
    For http/https URLs, returns the URL unchanged.

    Returns:
        (resolved_path, is_local) -- the path/URL and whether it's a local file.
    """
    if url.startswith("file://"):
        return url[len("file://"):], True
    return url, False


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

    For ``file://`` URIs (uploaded files), validates the local file directly.

    For remote URLs:
    1. HEAD request to check URL accessibility (timeout 10s).
    2. Fetch first 4 bytes and verify parquet magic number (PAR1).

    Returns:
        {"valid": True} on success.
        {"valid": False, "error": str, "error_type": str} on failure.
    """
    resolved, is_local = _resolve_url(url)

    # Local file validation (uploaded files)
    if is_local:
        try:
            file_size_bytes = os.path.getsize(resolved)
            with open(resolved, "rb") as f:
                magic_bytes = f.read(4)
            if len(magic_bytes) < 4 or magic_bytes != b"PAR1":
                return {
                    "valid": False,
                    "error": "Not a valid parquet file",
                    "error_type": "validation",
                }
            return {"valid": True, "file_size_bytes": file_size_bytes}
        except FileNotFoundError:
            return {
                "valid": False,
                "error": "Uploaded file not found",
                "error_type": "network",
            }
        except Exception as exc:
            return {
                "valid": False,
                "error": f"Failed to validate file: {exc}",
                "error_type": "network",
            }

    # Remote URL validation
    file_size_bytes = None
    try:
        # Step 1: HEAD request to check accessibility
        req = urllib.request.Request(url, method="HEAD")
        resp = urllib.request.urlopen(req, timeout=HEAD_REQUEST_TIMEOUT)
        content_length = resp.headers.get("Content-Length")
        file_size_bytes = int(content_length) if content_length else None
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

        return {"valid": True, "file_size_bytes": file_size_bytes}

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

    For ``file://`` URIs (uploaded files), reads the local file directly.

    Returns:
        {"columns": [{"name": str, "type": str}, ...], "row_count": int}
        On error: {"error_type": str, "message": str, "details": str | None}
    """
    try:
        import polars as pl

        resolved, is_local = _resolve_url(url)

        # For local files, read directly
        if is_local:
            lazy_frame = pl.scan_parquet(resolved)
            schema = lazy_frame.collect_schema()
            columns = [
                {"name": name, "type": str(dtype)}
                for name, dtype in schema.items()
            ]
            row_count = lazy_frame.select(pl.len()).collect().item()
            return {"columns": columns, "row_count": row_count}

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


def profile_columns(url: str) -> dict:
    """Compute per-column profiling statistics for a parquet dataset.

    For each column, computes null count/percent, unique count, and
    type-specific stats (min/max/mean for numerics, min/max length for strings).

    For large datasets (>100K rows), samples the first 100K rows for speed.

    Returns:
        {"profiles": [{"name": str, ...}, ...]}
        On error: {"error": str}
    """
    tmp_path = None
    try:
        import polars as pl

        SAMPLE_THRESHOLD = 100_000

        resolved, is_local = _resolve_url(url)

        if is_local:
            lazy_frame = pl.scan_parquet(resolved)
        else:
            # Try direct URL access first (uses HTTP range requests)
            try:
                lazy_frame = pl.scan_parquet(url)
                lazy_frame.collect_schema()  # verify access
            except Exception:
                # Fallback: download to temp file
                tmp_path = _download_to_tempfile(url)
                lazy_frame = pl.scan_parquet(tmp_path)

        # Collect, sampling if needed
        df = lazy_frame.collect()
        if len(df) > SAMPLE_THRESHOLD:
            df = df.head(SAMPLE_THRESHOLD)

        schema = df.schema
        profiles = []

        for col_name in df.columns:
            dtype = schema[col_name]
            series = df[col_name]
            total = len(series)

            null_count = series.null_count()
            null_percent = round((null_count / total) * 100, 1) if total > 0 else 0.0
            unique_count = series.n_unique()

            profile: dict = {
                "name": col_name,
                "null_count": null_count,
                "null_percent": null_percent,
                "unique_count": unique_count,
            }

            # Numeric types: Int*, UInt*, Float*
            dtype_str = str(dtype)
            if dtype_str.startswith(("Int", "UInt", "Float")):
                try:
                    min_val = series.min()
                    max_val = series.max()
                    mean_val = series.mean()
                    profile["min"] = min_val
                    profile["max"] = max_val
                    profile["mean"] = round(mean_val, 2) if mean_val is not None else None
                except Exception:
                    profile["min"] = None
                    profile["max"] = None
                    profile["mean"] = None
            elif dtype_str in ("Utf8", "String"):
                try:
                    non_null = series.drop_nulls()
                    if len(non_null) > 0:
                        lengths = non_null.str.len_chars()
                        profile["min_length"] = lengths.min()
                        profile["max_length"] = lengths.max()
                    else:
                        profile["min_length"] = None
                        profile["max_length"] = None
                except Exception:
                    profile["min_length"] = None
                    profile["max_length"] = None

            profiles.append(profile)

        return {"profiles": profiles}

    except Exception as exc:
        return {"error": str(exc)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def profile_column(url: str, table_name: str, column_name: str, column_type: str) -> dict:
    """Compute profiling statistics for a single column of a parquet dataset.

    Args:
        url: Parquet file URL or file:// path.
        table_name: Not used for scanning, but kept for consistency.
        column_name: The column to profile.
        column_type: The Polars dtype string (e.g. "Int64", "Utf8", "Float64", "Date").

    Returns:
        {"stats": {...}} with type-appropriate statistics.
        On error: {"error": str}
    """
    tmp_path = None
    try:
        import polars as pl

        resolved, is_local = _resolve_url(url)

        if is_local:
            lf = pl.scan_parquet(resolved)
        else:
            try:
                lf = pl.scan_parquet(url)
                lf.collect_schema()  # verify access
            except Exception:
                tmp_path = _download_to_tempfile(url)
                lf = pl.scan_parquet(tmp_path)

        col = pl.col(column_name)
        dtype_str = column_type

        # Determine the category of the column type
        is_numeric = dtype_str.startswith(("Int", "UInt", "Float"))
        is_string = dtype_str in ("Utf8", "String")
        is_datetime = dtype_str in ("Date", "Datetime", "Time") or dtype_str.startswith("Datetime")

        stats: dict = {}

        if is_numeric:
            result = lf.select(
                col.min().alias("min"),
                col.max().alias("max"),
                col.mean().alias("mean"),
                col.median().alias("median"),
                col.null_count().alias("null_count"),
                col.n_unique().alias("distinct_count"),
            ).collect()
            row = result.to_dicts()[0]
            stats = {
                "min": row["min"],
                "max": row["max"],
                "mean": round(row["mean"], 4) if row["mean"] is not None else None,
                "median": row["median"],
                "null_count": row["null_count"],
                "distinct_count": row["distinct_count"],
            }

        elif is_string:
            # Basic counts
            count_result = lf.select(
                col.null_count().alias("null_count"),
                col.n_unique().alias("distinct_count"),
            ).collect()
            count_row = count_result.to_dicts()[0]

            # String length stats from non-null values
            length_result = lf.filter(col.is_not_null()).select(
                col.str.len_chars().min().alias("min_length"),
                col.str.len_chars().max().alias("max_length"),
            ).collect()
            length_row = length_result.to_dicts()[0]

            # Top 5 most common values
            top5_result = (
                lf.filter(col.is_not_null())
                .group_by(column_name)
                .agg(pl.len().alias("count"))
                .sort("count", descending=True)
                .head(5)
                .collect()
            )
            top_5_values = [
                {"value": str(r[column_name]), "count": r["count"]}
                for r in top5_result.to_dicts()
            ]

            stats = {
                "min_length": length_row["min_length"],
                "max_length": length_row["max_length"],
                "null_count": count_row["null_count"],
                "distinct_count": count_row["distinct_count"],
                "top_5_values": top_5_values,
            }

        elif is_datetime:
            result = lf.select(
                col.min().alias("min"),
                col.max().alias("max"),
                col.null_count().alias("null_count"),
                col.n_unique().alias("distinct_count"),
            ).collect()
            row = result.to_dicts()[0]
            stats = {
                "min": str(row["min"]) if row["min"] is not None else None,
                "max": str(row["max"]) if row["max"] is not None else None,
                "null_count": row["null_count"],
                "distinct_count": row["distinct_count"],
            }

        else:
            # Fallback for other types: just null_count and distinct_count
            result = lf.select(
                col.null_count().alias("null_count"),
                col.n_unique().alias("distinct_count"),
            ).collect()
            row = result.to_dicts()[0]
            stats = {
                "null_count": row["null_count"],
                "distinct_count": row["distinct_count"],
            }

        return {"stats": stats}

    except Exception as e:
        return {"error": str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


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
            "execution_time_ms": float,  # query execution time in milliseconds
        }
        On error: {"error_type": str, "message": str, "details": str | None, "execution_time_ms": float}
    """
    start_time = time.perf_counter()
    tmp_paths = []
    try:
        import polars as pl

        ctx = pl.SQLContext()

        # Register each dataset as a named table (try URL directly first)
        for dataset in datasets:
            resolved, is_local = _resolve_url(dataset["url"])
            if is_local:
                lf = pl.scan_parquet(resolved)
                ctx.register(dataset["table_name"], lf)
            else:
                try:
                    lf = pl.scan_parquet(dataset["url"])
                    lf.collect_schema()  # force metadata read to verify access
                    ctx.register(dataset["table_name"], lf)
                except Exception:
                    tmp_path = _download_to_tempfile(dataset["url"])
                    tmp_paths.append(tmp_path)
                    lf = pl.scan_parquet(tmp_path)
                    ctx.register(dataset["table_name"], lf)

        # Auto-inject LIMIT for SELECT queries that don't have one
        limit_applied = False
        effective_sql = sql
        if _is_select(sql) and not _has_limit(sql):
            effective_sql = f"{sql.rstrip().rstrip(';')} LIMIT {MAX_QUERY_ROWS}"
            limit_applied = True

        # Execute the query
        result_lf = ctx.execute(effective_sql)

        # Collect the full result to get total row count
        result_df = result_lf.collect()
        total_rows = len(result_df)

        # Get column names
        columns = result_df.columns

        # Truncate to 1000 rows
        truncated_df = result_df.head(MAX_RESULT_ROWS)

        # Convert to list of dicts
        rows = truncated_df.to_dicts()

        execution_time_ms = (time.perf_counter() - start_time) * 1000

        return {
            "rows": rows,
            "columns": columns,
            "total_rows": total_rows,
            "execution_time_ms": execution_time_ms,
            "limit_applied": limit_applied,
        }

    except Exception as exc:
        execution_time_ms = (time.perf_counter() - start_time) * 1000
        error_msg = str(exc)
        return {
            "error_type": "sql",
            "message": f"SQL execution error: {error_msg}",
            "details": error_msg,
            "execution_time_ms": execution_time_ms,
        }
    finally:
        for path in tmp_paths:
            if os.path.exists(path):
                os.unlink(path)
