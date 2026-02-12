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
        r'(?:column\s+"([^"]+)"\s+not\s+found|unable\s+to\s+find\s+column\s+"([^"]+)")',
        error_message,
        re.IGNORECASE,
    )
    if col_match or "columnnotfounderror" in msg_lower:
        col_name = (col_match.group(1) or col_match.group(2)) if col_match else "unknown"
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

    # 4. Table / relation not found
    if re.search(r"(?:table|relation)\s.*(?:not\s+found|was\s+not\s+found)", msg_lower):
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

    # 7. Function not found / unsupported function
    if (
        re.search(r"function\s.*not\s+found", msg_lower)
        or re.search(r"unsupported\s+function", msg_lower)
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

    # 14. String to number conversion / CAST failure
    if (
        "could not parse" in msg_lower
        or (
            "conversion" in msg_lower and "string" in msg_lower
        )
        or re.search(r"conversion\s+from\s+`\w+`\s+to\s+`\w+`\s+failed", msg_lower)
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
    if (
        re.search(r"group\s+by\s+position\s+\d+\s+is\s+not\s+in\s+select", msg_lower)
        or ("group by column" in msg_lower and "out of range" in msg_lower)
        or re.search(r"group\s+by\s+ordinal\s+value\s+must\s+refer\s+to\s+a\s+valid\s+column", msg_lower)
    ):
        return (
            "GROUP BY position number is out of range. "
            "Verify the column position numbers match your SELECT clause. "
            "For example, GROUP BY 1 refers to the first column in SELECT."
        )

    # 19. Duplicate column name in result
    if "duplicate" in msg_lower and ("column" in msg_lower or "output name" in msg_lower):
        return (
            "Duplicate column name in query results. "
            "Use aliases to give each column a unique name: "
            "SELECT a.id AS a_id, b.id AS b_id ..."
        )

    # 20. LIKE pattern type error (non-string column) / type expectation error
    if (
        ("like" in msg_lower and ("cannot apply" in msg_lower or "invalid type" in msg_lower))
        or re.search(r"expected\s+string\s+type,\s+got", msg_lower)
    ):
        return (
            "LIKE can only be used with text columns. "
            "Cast the column to text first: CAST(column AS VARCHAR) LIKE '%pattern%'"
        )

    # 21. Nested subquery / CTE / derived table alias error
    if (
        "cte" in msg_lower
        or ("subquery" in msg_lower and "must have" in msg_lower)
        or "derived tables must have aliases" in msg_lower
    ):
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

    # 23. Window function syntax error
    if "window" in msg_lower and ("partition" in msg_lower or "over" in msg_lower or "frame" in msg_lower):
        return (
            "Window function error. "
            "Check your OVER clause syntax: "
            "ROW_NUMBER() OVER (PARTITION BY col ORDER BY col2)."
        )

    # 24. strftime / date format error
    if "strftime" in msg_lower or ("format" in msg_lower and "date" in msg_lower):
        return (
            "Date formatting error. "
            "Use strftime format codes: '%Y' for year, '%m' for month, '%d' for day, "
            "'%H' for hour, '%M' for minute. Example: strftime('%Y-%m', date_col)."
        )

    # 25. NULL in expression (concat or arithmetic with NULL)
    if "null" in msg_lower and ("concat" in msg_lower or "||" in error_message or "arithmetic" in msg_lower):
        return (
            "NULL value in expression. "
            "String concatenation or arithmetic with NULL produces NULL. "
            "Use COALESCE(column, '') for strings or COALESCE(column, 0) for numbers."
        )

    # 26. HAVING clause error
    if "having" in msg_lower and ("aggregate" in msg_lower or "group" in msg_lower or "not allowed" in msg_lower):
        return (
            "HAVING clause error. "
            "HAVING can only filter on aggregate expressions (COUNT, SUM, AVG, etc.). "
            "Use WHERE to filter individual rows before aggregation."
        )

    # 27. UNION column count mismatch
    if "union" in msg_lower and ("column" in msg_lower or "mismatch" in msg_lower or "number" in msg_lower):
        return (
            "UNION error — all SELECT statements must have the same number of columns "
            "with compatible types. Use UNION ALL instead of UNION if deduplication is not needed."
        )

    # 28. LEFT/RIGHT function not supported
    if ("left" in msg_lower or "right" in msg_lower) and "not found" in msg_lower:
        return (
            "LEFT() and RIGHT() functions are not available in Polars SQL. "
            "Use SUBSTRING(column, start, length) instead. "
            "For LEFT(col, 3): SUBSTRING(col, 1, 3). "
            "For RIGHT(col, 3): SUBSTRING(col, LENGTH(col) - 2, 3)."
        )

    # 29. Boolean type error (comparing bool to int)
    if "boolean" in msg_lower and ("compare" in msg_lower or "cast" in msg_lower or "type" in msg_lower):
        return (
            "Boolean type error. Polars uses true/false (not 1/0) for booleans. "
            "Use `col = true` or `col = false` instead of comparing to integers."
        )

    # 30. Empty result / no rows
    if "empty" in msg_lower and ("dataframe" in msg_lower or "result" in msg_lower):
        return (
            "The query returned no results. "
            "Try broadening your WHERE clause or checking the data values."
        )

    # 31. Schema mismatch on UNION/JOIN
    if "schema" in msg_lower and ("mismatch" in msg_lower or "differ" in msg_lower):
        return (
            "Schema mismatch — the tables have incompatible column types. "
            "Use CAST() to align column types before joining or combining tables."
        )

    # 32. CONCAT function not available
    if "concat" in msg_lower and "not found" in msg_lower:
        return (
            "CONCAT() is not available in Polars SQL. "
            "Use the || operator instead: col1 || ' ' || col2"
        )

    # 33. DATE_TRUNC not available
    if "date_trunc" in msg_lower:
        return (
            "DATE_TRUNC is not available in Polars SQL. "
            "Use strftime() instead: strftime('%Y-%m', date_col) for month truncation, "
            "strftime('%Y', date_col) for year."
        )

    # 34. LCASE / UCASE not available
    if "lcase" in msg_lower or "ucase" in msg_lower:
        return (
            "LCASE()/UCASE() are not available in Polars SQL. "
            "Use LOWER() and UPPER() instead."
        )

    # 35. Nested aggregate error
    if "nested" in msg_lower and ("aggregate" in msg_lower or "agg" in msg_lower):
        return (
            "Nested aggregate functions are not allowed. "
            "Use a subquery or CTE: "
            "WITH sub AS (SELECT ... COUNT(*) AS cnt FROM ... GROUP BY ...) "
            "SELECT AVG(cnt) FROM sub"
        )

    # 36. DML/DDL statement not supported (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)
    if "statement type is not supported" in msg_lower:
        return (
            "Only SELECT queries are supported. "
            "Polars SQL does not support INSERT, UPDATE, DELETE, CREATE, ALTER, or DROP statements. "
            "Use SELECT queries to analyze and retrieve data."
        )

    # 37. LIMIT/OFFSET validation error
    if "non-numeric arguments for limit" in msg_lower or "non-numeric arguments for offset" in msg_lower:
        return (
            "LIMIT and OFFSET must be positive integers. "
            "Use whole numbers: e.g., LIMIT 10 OFFSET 20."
        )

    # 38. IN clause type mismatch ('is_in' cannot check)
    if "is_in" in msg_lower and "cannot check" in msg_lower:
        return (
            "Type mismatch in IN clause. "
            "The values in IN (...) must match the column type. "
            "Use CAST() to convert: e.g., WHERE CAST(col AS VARCHAR) IN ('a', 'b')."
        )

    # 39. Multiple tables in FROM (implicit join not supported)
    if "multiple tables in from clause" in msg_lower:
        return (
            "Comma-separated tables in FROM are not supported. "
            "Use explicit JOIN syntax instead: "
            "SELECT * FROM t1 JOIN t2 ON t1.id = t2.id"
        )

    # 40. TOP N syntax (SQL Server style)
    if "top" in msg_lower and "clause" in msg_lower and "limit" in msg_lower:
        return (
            "TOP is not supported in Polars SQL. "
            "Use LIMIT instead: SELECT * FROM table LIMIT 10."
        )

    # 41. Unsupported datatype in CAST
    if re.search(r"datatype\s+.+is\s+not\s+(?:currently\s+)?supported", msg_lower):
        return (
            "Unsupported data type in CAST. "
            "Use standard Polars types: INTEGER, BIGINT, FLOAT, DOUBLE, "
            "VARCHAR, BOOLEAN, DATE, TIMESTAMP."
        )

    # 42. Sort / ORDER BY length mismatch
    if "sort expressions must have same length" in msg_lower:
        return (
            "ORDER BY error. The sort expression produces a different number "
            "of rows than the query. Avoid using aggregate functions in ORDER BY "
            "without a GROUP BY clause."
        )

    # 43. HAVING clause outside GROUP BY (specific Polars phrasing)
    if "having clause not valid outside of group by" in msg_lower:
        return (
            "HAVING clause error. "
            "HAVING can only be used with GROUP BY. "
            "Use WHERE to filter individual rows instead."
        )

    # 44. UNION requires equal column count (specific Polars phrasing)
    if "union requires equal number of columns" in msg_lower:
        return (
            "UNION error -- each SELECT must return the same number of columns. "
            "Use UNION BY NAME to combine tables with different column names, "
            "or adjust your SELECT statements to return matching columns."
        )

    # 45. INTERSECT/EXCEPT not supported
    if "intersect" in msg_lower or "except" in msg_lower:
        return (
            "INTERSECT and EXCEPT set operations are not supported in Polars SQL. "
            "Use LEFT JOIN with IS NULL or NOT EXISTS patterns instead."
        )

    # 46. CROSS JOIN warning
    if "cross join" in msg_lower:
        return (
            "CROSS JOIN syntax may not be supported. "
            "Try using a regular JOIN with a constant condition (e.g., ON 1=1) "
            "or restructure your query."
        )

    # 47. ALTER/CREATE/DROP TABLE (DDL statements)
    if "alter table" in msg_lower or "create table" in msg_lower or "drop table" in msg_lower:
        return (
            "Data definition statements (CREATE, ALTER, DROP) are not supported. "
            "ChatDF provides read-only access to datasets."
        )

    # 48. STRUCT/JSON field access
    if "struct" in msg_lower and ("field" in msg_lower or "access" in msg_lower):
        return (
            "Accessing struct/JSON fields directly in SQL is not supported. "
            "Try selecting the column and parsing it in your application."
        )

    # Generic fallback for unrecognized errors
    return (
        "The query encountered an error. "
        "Check your SQL syntax, column names, and data types. "
        "Common fixes: use LOWER() instead of ILIKE, strftime() instead of DATE_TRUNC, "
        "and verify column names match the dataset schema exactly."
    )
