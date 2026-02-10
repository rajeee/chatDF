"""Translate raw Polars SQL errors into user-friendly messages.

Maps cryptic Polars/SQL error strings to actionable, human-readable
messages while preserving the original error as technical detail.
"""

from __future__ import annotations

import re


def translate_polars_error(
    error_message: str,
    available_columns: list[str] | None = None,
) -> str:
    """Translate a raw Polars SQL error into a user-friendly message.

    Applies regex-based pattern matching against known Polars error
    categories. If no pattern matches, returns the original message
    unchanged.

    Args:
        error_message: The raw error string from Polars.
        available_columns: Optional list of column names in the dataset(s),
            used to enrich "column not found" messages.

    Returns:
        A formatted string with a user-friendly explanation followed by
        the original technical details.
    """
    friendly = _match_error_pattern(error_message, available_columns)
    if friendly is None:
        # No pattern matched -- return original as-is
        return error_message

    return f"{friendly}\n\nTechnical details: {error_message}"


def _match_error_pattern(
    error_message: str,
    available_columns: list[str] | None = None,
) -> str | None:
    """Try each known error pattern and return a friendly message, or None."""
    msg_lower = error_message.lower()

    # 1. Column not found
    col_match = re.search(
        r'column\s+"([^"]+)"\s+not\s+found',
        error_message,
        re.IGNORECASE,
    )
    if col_match or "columnnotfounderror" in msg_lower:
        col_name = col_match.group(1) if col_match else "unknown"
        if available_columns:
            cols_str = ", ".join(available_columns)
            return (
                f"Column '{col_name}' doesn't exist in this dataset. "
                f"Available columns: {cols_str}"
            )
        return f"Column '{col_name}' doesn't exist in this dataset."

    # 2. ILIKE not supported
    if "ilike" in msg_lower:
        return (
            "Polars SQL doesn't support ILIKE. "
            "Use `LOWER(column) LIKE LOWER('%pattern%')` instead."
        )

    # 3. Type mismatch
    if "cannot compare" in msg_lower or "type mismatch" in msg_lower:
        return (
            "Type mismatch error. "
            "Try using CAST() to convert columns to matching types."
        )

    # 4. Table not found
    if re.search(r"table\s.*not\s+found", msg_lower):
        return (
            "Table not found. "
            "Make sure to use the dataset name as shown in the schema."
        )

    # 5. Syntax error
    if "sql parser error" in msg_lower or "syntax error" in msg_lower:
        return (
            "SQL syntax error. "
            "Check for missing commas, parentheses, or keywords."
        )

    # 6. Division by zero
    if "divide by zero" in msg_lower or "division by zero" in msg_lower:
        return (
            "Division by zero encountered. "
            "Add a CASE WHEN to handle zero values."
        )

    # 7. Function not found
    if (
        re.search(r"function\s.*not\s+found", msg_lower)
        or "invalidoperationerror" in msg_lower
    ):
        return (
            "Function not supported in Polars SQL. "
            "Check the Polars SQL documentation for available functions."
        )

    # 8. Aggregation without GROUP BY
    if "must appear in group by" in msg_lower:
        return (
            "Columns in SELECT must appear in GROUP BY clause "
            "or be used with an aggregate function."
        )

    return None
