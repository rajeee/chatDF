"""Pure worker functions for data operations.

Implements: spec/backend/worker/plan.md#worker-functions

These functions are module-level (picklable) and run in worker processes.
They receive and return plain dicts/lists -- no Pydantic models cross
the process boundary. Only imports from ``app.workers.file_cache``.
"""

from __future__ import annotations

import os
import re
import time
import urllib.error
import urllib.request

from app.workers.file_cache import download_and_cache as _download_and_cache

MAX_RESULT_ROWS = 1000
MAX_QUERY_ROWS = 10000  # Auto-LIMIT cap for SELECT queries without LIMIT
HEAD_REQUEST_TIMEOUT = 10  # seconds
DOWNLOAD_TIMEOUT = 300  # seconds for full file downloads


def _is_csv_file(path_or_url: str) -> bool:
    """Check if a path/URL points to a CSV file."""
    lower = path_or_url.lower()
    return lower.endswith('.csv') or lower.endswith('.csv.gz') or lower.endswith('.tsv')


def _is_tsv_file(path_or_url: str) -> bool:
    """Check if a path/URL points to a TSV file."""
    return path_or_url.lower().endswith('.tsv')


def _scan_data_file(path_or_url: str, is_local: bool = False) -> "object":
    """Scan a data file (parquet or CSV) and return a LazyFrame.

    For CSV files, uses ``pl.scan_csv`` with date parsing and schema inference.
    For parquet files, uses ``pl.scan_parquet``.
    """
    import polars as pl

    resolved = path_or_url
    if _is_csv_file(resolved):
        sep = '\t' if _is_tsv_file(resolved) else ','
        return pl.scan_csv(resolved, separator=sep, try_parse_dates=True, infer_schema_length=10000)
    return pl.scan_parquet(resolved)


def _read_data_file(path_or_url: str) -> "object":
    """Read a data file (parquet or CSV) eagerly and return a DataFrame.

    For CSV files, uses ``pl.read_csv`` with date parsing and schema inference.
    For parquet files, uses ``pl.read_parquet``.
    """
    import polars as pl

    if _is_csv_file(path_or_url):
        sep = '\t' if _is_tsv_file(path_or_url) else ','
        return pl.read_csv(path_or_url, separator=sep, try_parse_dates=True, infer_schema_length=10000)
    return pl.read_parquet(path_or_url)


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


def _download_to_local(url: str) -> str:
    """Download a URL (with caching) and return a local file path.

    Uses the file cache so repeated downloads of the same URL are served
    from disk.  The returned path is owned by the cache and must NOT be
    deleted by the caller.
    """
    return _download_and_cache(url)


def _validate_url_safety(url: str) -> dict | None:
    """Validate URL for safety — reject private/internal networks and non-HTTP schemes.

    Returns None if URL is safe, or an error dict if it should be rejected.
    """
    from urllib.parse import urlparse
    import ipaddress
    import socket

    # Allow file:// URLs (for uploaded files)
    if url.startswith("file://"):
        return None

    parsed = urlparse(url)

    # Only allow http and https schemes
    if parsed.scheme not in ("http", "https"):
        return {
            "valid": False,
            "error": f"Unsupported URL scheme '{parsed.scheme}'. Only HTTP and HTTPS URLs are supported.",
            "error_type": "validation",
        }

    # Reject URLs without a host
    if not parsed.hostname:
        return {
            "valid": False,
            "error": "Invalid URL: no hostname specified.",
            "error_type": "validation",
        }

    # Reject private/internal IP addresses (SSRF prevention)
    # Skip in test environments (CHATDF_ALLOW_PRIVATE_URLS=1)
    if not os.environ.get("CHATDF_ALLOW_PRIVATE_URLS"):
        try:
            # Resolve hostname to IP
            resolved_ip = socket.gethostbyname(parsed.hostname)
            ip = ipaddress.ip_address(resolved_ip)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return {
                    "valid": False,
                    "error": "URLs pointing to internal/private networks are not allowed.",
                    "error_type": "validation",
                }
        except (socket.gaierror, ValueError):
            # DNS resolution failed — let the download handle it
            pass

    return None


def fetch_and_validate(url: str) -> dict:
    """Download file header and check if valid data file (parquet or CSV).

    Implements: spec/backend/worker/spec.md#url-fetch--parquet-validation

    For ``file://`` URIs (uploaded files), validates the local file directly.
    For CSV/TSV files, only checks that the file exists and has content.
    For parquet files, also checks the PAR1 magic bytes.

    For remote URLs:
    1. HEAD request to check URL accessibility (timeout 10s).
    2. For parquet: fetch first 4 bytes and verify parquet magic number (PAR1).
    3. For CSV/TSV: accessibility check is sufficient.

    Returns:
        {"valid": True} on success.
        {"valid": False, "error": str, "error_type": str} on failure.
    """
    resolved, is_local = _resolve_url(url)
    is_csv = _is_csv_file(resolved if is_local else url)

    # Safety validation for remote URLs
    if not is_local:
        safety_error = _validate_url_safety(url)
        if safety_error is not None:
            return safety_error

    # Local file validation (uploaded files)
    if is_local:
        try:
            file_size_bytes = os.path.getsize(resolved)
            # For CSV files, just check the file exists and has content
            if is_csv:
                if file_size_bytes == 0:
                    return {
                        "valid": False,
                        "error": "CSV file is empty",
                        "error_type": "validation",
                    }
                return {"valid": True, "file_size_bytes": file_size_bytes}
            # For parquet, check magic bytes
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

    # For CSV/TSV files, accessibility check is sufficient
    if is_csv:
        return {"valid": True, "file_size_bytes": file_size_bytes}

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


def _collect_sample_values(lazy_frame, columns: list[dict], max_samples: int = 5) -> list[dict]:
    """Collect sample non-null unique values for each column.

    Fetches a small number of rows and extracts distinct non-null values
    per column.  Returns the columns list with added ``sample_values`` keys.

    Args:
        lazy_frame: A Polars LazyFrame.
        columns: List of column info dicts (``{"name": ..., "type": ...}``).
        max_samples: Maximum number of sample values per column.

    Returns:
        The same *columns* list, each dict augmented with a ``sample_values``
        key (list of strings).
    """
    try:
        # Fetch up to 100 rows to get diverse sample values
        sample_df = lazy_frame.head(100).collect()
        for col_info in columns:
            col_name = col_info["name"]
            try:
                series = sample_df[col_name].drop_nulls().unique().head(max_samples)
                sample_vals = []
                for val in series.to_list():
                    s = str(val)
                    # Truncate very long sample values
                    if len(s) > 80:
                        s = s[:77] + "..."
                    sample_vals.append(s)
                col_info["sample_values"] = sample_vals
            except Exception:
                col_info["sample_values"] = []
    except Exception:
        # If sampling fails entirely, return columns without sample_values
        for col_info in columns:
            if "sample_values" not in col_info:
                col_info["sample_values"] = []
    return columns


def _collect_column_stats(lazy_frame, columns: list[dict]) -> list[dict]:
    """Collect lightweight column statistics for the system prompt.

    For numeric columns (Int*, UInt*, Float*): min, max.
    For string columns (Utf8, String): unique count (cardinality).
    For all columns: null count (only if > 0).

    Uses aggregation on the full LazyFrame (Polars pushes predicates down,
    so this is efficient even for large parquet files).

    Args:
        lazy_frame: A Polars LazyFrame.
        columns: List of column info dicts (already has ``name``, ``type``).

    Returns:
        The same *columns* list, each dict augmented with a ``column_stats``
        dict containing the computed statistics.
    """
    import polars as pl

    try:
        # Build aggregation expressions for all columns in a single pass
        agg_exprs = []
        for col_info in columns:
            col_name = col_info["name"]
            dtype_str = col_info.get("type", "")
            col_ref = pl.col(col_name)

            # Null count for every column
            agg_exprs.append(col_ref.null_count().alias(f"__null__{col_name}"))

            if dtype_str.startswith(("Int", "UInt", "Float")):
                agg_exprs.append(col_ref.min().alias(f"__min__{col_name}"))
                agg_exprs.append(col_ref.max().alias(f"__max__{col_name}"))
            elif dtype_str in ("Utf8", "String"):
                agg_exprs.append(col_ref.n_unique().alias(f"__nunique__{col_name}"))

        if not agg_exprs:
            return columns

        stats_row = lazy_frame.select(agg_exprs).collect().to_dicts()[0]

        for col_info in columns:
            col_name = col_info["name"]
            dtype_str = col_info.get("type", "")
            stats: dict = {}

            null_count = stats_row.get(f"__null__{col_name}", 0)
            if null_count and null_count > 0:
                stats["null_count"] = null_count

            if dtype_str.startswith(("Int", "UInt", "Float")):
                min_val = stats_row.get(f"__min__{col_name}")
                max_val = stats_row.get(f"__max__{col_name}")
                if min_val is not None:
                    stats["min"] = min_val
                if max_val is not None:
                    stats["max"] = max_val
            elif dtype_str in ("Utf8", "String"):
                n_unique = stats_row.get(f"__nunique__{col_name}")
                if n_unique is not None:
                    stats["unique_count"] = n_unique

            col_info["column_stats"] = stats

    except Exception:
        # If stats collection fails, add empty stats so the system still works
        for col_info in columns:
            if "column_stats" not in col_info:
                col_info["column_stats"] = {}

    return columns


def extract_schema(url: str) -> dict:
    """Read data file schema without loading full data.

    Implements: spec/backend/worker/spec.md#schema-extraction

    Supports parquet, CSV, TSV, and CSV.GZ files.

    Uses Polars scan_parquet/scan_csv with HTTP URL directly (range requests
    for parquet) to read schema without downloading the full file. Falls back
    to downloading to a cached local file if direct URL access fails.

    For ``file://`` URIs (uploaded files), reads the local file directly.

    Returns:
        {"columns": [{"name": str, "type": str, "sample_values": list[str]}, ...], "row_count": int}
        On error: {"error_type": str, "message": str, "details": str | None}
    """
    try:
        import polars as pl

        resolved, is_local = _resolve_url(url)

        # For local files, read directly
        if is_local:
            lazy_frame = _scan_data_file(resolved, is_local=True)
            schema = lazy_frame.collect_schema()
            columns = [
                {"name": name, "type": str(dtype)}
                for name, dtype in schema.items()
            ]
            row_count = lazy_frame.select(pl.len()).collect().item()
            columns = _collect_sample_values(lazy_frame, columns)
            columns = _collect_column_stats(lazy_frame, columns)
            return {"columns": columns, "row_count": row_count}

        # Try direct URL access first (uses HTTP range requests for parquet — fast)
        try:
            lazy_frame = _scan_data_file(url)
            schema = lazy_frame.collect_schema()
            columns = [
                {"name": name, "type": str(dtype)}
                for name, dtype in schema.items()
            ]
            row_count = lazy_frame.select(pl.len()).collect().item()
            columns = _collect_sample_values(lazy_frame, columns)
            columns = _collect_column_stats(lazy_frame, columns)
            return {"columns": columns, "row_count": row_count}
        except Exception:
            pass

        # Fallback: download (cached) to local file
        cached_path = _download_to_local(url)
        lazy_frame = _scan_data_file(cached_path)
        schema = lazy_frame.collect_schema()
        columns = [
            {"name": name, "type": str(dtype)}
            for name, dtype in schema.items()
        ]
        row_count = lazy_frame.select(pl.len()).collect().item()
        columns = _collect_sample_values(lazy_frame, columns)
        columns = _collect_column_stats(lazy_frame, columns)
        return {"columns": columns, "row_count": row_count}

    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
        error_msg = str(exc)
        return {
            "error_type": "network",
            "message": f"Failed to download data file: {error_msg}",
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
    """Compute per-column profiling statistics for a dataset.

    For each column, computes null count/percent, unique count, and
    type-specific stats (min/max/mean for numerics, min/max length for strings).

    For large datasets (>100K rows), samples the first 100K rows for speed.

    Supports parquet, CSV, TSV, and CSV.GZ files.

    Returns:
        {"profiles": [{"name": str, ...}, ...]}
        On error: {"error": str}
    """
    try:
        import polars as pl

        SAMPLE_THRESHOLD = 100_000

        resolved, is_local = _resolve_url(url)

        if is_local:
            lazy_frame = _scan_data_file(resolved, is_local=True)
        else:
            # Try direct URL access first (uses HTTP range requests for parquet)
            try:
                lazy_frame = _scan_data_file(url)
                lazy_frame.collect_schema()  # verify access
            except Exception:
                # Fallback: download (cached) to local file
                cached_path = _download_to_local(url)
                lazy_frame = _scan_data_file(cached_path)

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


def profile_column(url: str, table_name: str, column_name: str, column_type: str) -> dict:
    """Compute profiling statistics for a single column of a dataset.

    Args:
        url: Data file URL or file:// path (parquet, CSV, TSV).
        table_name: Not used for scanning, but kept for consistency.
        column_name: The column to profile.
        column_type: The Polars dtype string (e.g. "Int64", "Utf8", "Float64", "Date").

    Returns:
        {"stats": {...}} with type-appropriate statistics.
        On error: {"error": str}
    """
    try:
        import polars as pl

        resolved, is_local = _resolve_url(url)

        if is_local:
            lf = _scan_data_file(resolved, is_local=True)
        else:
            try:
                lf = _scan_data_file(url)
                lf.collect_schema()  # verify access
            except Exception:
                cached_path = _download_to_local(url)
                lf = _scan_data_file(cached_path)

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


def execute_query(sql: str, datasets: list[dict]) -> dict:
    """Execute SQL query against datasets (parquet, CSV, TSV).

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
    try:
        import polars as pl

        ctx = pl.SQLContext()

        # Register each dataset as a named table (try URL directly first)
        for dataset in datasets:
            resolved, is_local = _resolve_url(dataset["url"])
            if is_local:
                lf = _scan_data_file(resolved, is_local=True)
                ctx.register(dataset["table_name"], lf)
            else:
                try:
                    lf = _scan_data_file(dataset["url"])
                    lf.collect_schema()  # force metadata read to verify access
                    ctx.register(dataset["table_name"], lf)
                except Exception:
                    cached_path = _download_to_local(dataset["url"])
                    lf = _scan_data_file(cached_path)
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
