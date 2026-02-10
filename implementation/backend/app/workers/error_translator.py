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
    categories.  A generic fallback is returned when no specific
    pattern matches (empty strings are returned as-is).

    Args:
        error_message: The raw error string from Polars.
        available_columns: Optional list of column names in the dataset(s),
            used to enrich "column not found" messages.

    Returns:
        A formatted string with a user-friendly explanation followed by
        the original technical details.
    """
    if not error_message:
        return error_message

    friendly = _match_error_pattern(error_message, available_columns)
    return f"{friendly}\n\nTechnical details: {error_message}"


def _match_error_pattern(
    error_message: str,
    available_columns: list[str] | None = None,
) -> str | None:
    """Try each known error pattern and return a friendly message.

    Always returns a string -- falls back to a generic helpful message
    when no specific pattern matches.
    """
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

    # 9. INTERVAL not supported
    if "interval" in msg_lower:
        return (
            "Polars SQL doesn't support INTERVAL for date arithmetic. "
            "Use strftime() for date formatting and filtering instead."
        )

    # 10. Ambiguous column reference
    if "ambiguous" in msg_lower:
        return (
            "Ambiguous column reference. "
            "Prefix the column with the table name "
            "(e.g., table1.column_name) to resolve."
        )

    # 11. Overflow / integer overflow
    if "overflow" in msg_lower:
        return (
            "Numeric overflow occurred. "
            "Try casting the column to a larger type with "
            "CAST(col AS BIGINT) or CAST(col AS FLOAT)."
        )

    # 12. No such function (specific variant)
    if ("function" in msg_lower and "not found" in msg_lower) or (
        "unknown function" in msg_lower
    ):
        return (
            "Function not available in Polars SQL. "
            "Common alternatives: use LENGTH() not LEN(), "
            "SUBSTRING() not SUBSTR(), LOWER() not LCASE()."
        )

    # 13. REGEXP / RLIKE not supported
    if "regex" in msg_lower or "rlike" in msg_lower or "regexp" in msg_lower:
        return (
            "Regular expressions are not supported in Polars SQL. "
            "Use LIKE with % and _ wildcards instead."
        )

    # 14. String to number conversion
    if "could not parse" in msg_lower or (
        "conversion" in msg_lower and "string" in msg_lower
    ):
        return (
            "Could not convert string to number. "
            "Use CAST(column AS FLOAT) or CAST(column AS INTEGER) "
            "to convert explicitly."
        )

    # 15. DISTINCT ON not supported
    if "distinct on" in msg_lower:
        return (
            "DISTINCT ON is not supported in Polars SQL. "
            "Use a window function: SELECT *, ROW_NUMBER() OVER "
            "(PARTITION BY col ORDER BY ...) to get distinct rows per group."
        )

    # 16. Query timeout / resource exhaustion
    if "timeout" in msg_lower or "out of memory" in msg_lower or "resource" in msg_lower:
        return (
            "Query timed out or ran out of memory. "
            "Try adding a LIMIT clause, filtering with WHERE, "
            "or selecting fewer columns."
        )

    # 17. JOIN errors
    if "join" in msg_lower and ("column" in msg_lower or "key" in msg_lower):
        return (
            "JOIN error — the join column may not exist or have mismatched types. "
            "Verify both tables have the join column and use CAST() if types differ."
        )

    # 18. GROUP BY position out of range
    if re.search(r"group\s+by\s+position\s+\d+\s+is\s+not\s+in\s+select", msg_lower) or \
       "group by column" in msg_lower and "out of range" in msg_lower:
        return (
            "GROUP BY position number is out of range. "
            "Verify the column position numbers match your SELECT clause. "
            "For example, GROUP BY 1 refers to the first column in SELECT."
        )

    # 19. Duplicate column name in result
    if "duplicate" in msg_lower and "column" in msg_lower:
        return (
            "Duplicate column name in query results. "
            "Use aliases to give each column a unique name: "
            "SELECT a.id AS a_id, b.id AS b_id ..."
        )

    # 20. LIKE pattern type error (non-string column)
    if "like" in msg_lower and ("cannot apply" in msg_lower or "invalid type" in msg_lower):
        return (
            "LIKE can only be used with text columns. "
            "Cast the column to text first: CAST(column AS VARCHAR) LIKE '%pattern%'"
        )

    # 21. Nested subquery / CTE naming error
    if "cte" in msg_lower or ("subquery" in msg_lower and "must have" in msg_lower):
        return (
            "Subquery or CTE error. Make sure every subquery has an alias "
            "(e.g., SELECT * FROM (SELECT ...) AS subquery_name) and "
            "every CTE has a unique name."
        )

    # 22. ORDER BY column not in SELECT (strict mode)
    if "order by" in msg_lower and "not in" in msg_lower and "select" in msg_lower:
        return (
            "ORDER BY column not found in SELECT. "
            "Either add the column to your SELECT clause or use a column position number."
        )

    # Generic fallback for unrecognized errors
    return (
        "The query encountered an error. "
        "Check your SQL syntax, column names, and data types. "
        "Common fixes: use LOWER() instead of ILIKE, strftime() instead of DATE_TRUNC, "
        "and verify column names match the dataset schema exactly."
    )
