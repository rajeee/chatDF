"""LLM service: Gemini client, system prompt, streaming, tool calls.

Implements: spec/backend/llm/plan.md

Encapsulates all Gemini SDK interaction: client setup, tool definitions,
streaming iteration, tool call dispatch, token counting, and context pruning.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field

from google.genai import Client
from google.genai import types
from google.genai.errors import ClientError

from app.config import get_settings
from app.services import worker_pool
from app.services import dataset_service
from app.services import ws_messages
from app.workers.error_translator import translate_polars_error

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# Implements: spec/backend/llm/plan.md#gemini-sdk-setup
# ---------------------------------------------------------------------------

MODEL_ID = "gemini-2.5-flash"
MAX_TOOL_CALLS_PER_TURN = 5
MAX_SQL_RETRIES = 3
MAX_GEMINI_RETRIES = 3
GEMINI_RETRY_BASE_DELAY = 2  # seconds; doubles each retry (2, 4, 8)

# ---------------------------------------------------------------------------
# Gemini client (module-level singleton)
# ---------------------------------------------------------------------------

settings = get_settings()
client = Client(api_key=settings.gemini_api_key)

# ---------------------------------------------------------------------------
# Tool Declarations
# Implements: spec/backend/llm/plan.md#tool-definitions
# ---------------------------------------------------------------------------

_execute_sql_decl = types.FunctionDeclaration(
    name="execute_sql",
    description="Execute a SQL query against the loaded datasets. Use Polars SQL dialect.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "query": types.Schema(
                type="STRING",
                description="The SQL query to execute",
            ),
        },
        required=["query"],
    ),
)

_load_dataset_decl = types.FunctionDeclaration(
    name="load_dataset",
    description="Load a parquet dataset from a URL into the conversation.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "url": types.Schema(
                type="STRING",
                description="The URL of the parquet file to load",
            ),
        },
        required=["url"],
    ),
)

_create_chart_decl = types.FunctionDeclaration(
    name="create_chart",
    description="Create an interactive chart visualization from the most recent query results. Call this after executing a SQL query when the results would benefit from visual representation.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "chart_type": types.Schema(
                type="STRING",
                enum=["bar", "horizontal_bar", "line", "scatter", "histogram", "pie", "box", "heatmap", "choropleth"],
                description="The type of chart to create",
            ),
            "title": types.Schema(
                type="STRING",
                description="Chart title",
            ),
            "x_column": types.Schema(
                type="STRING",
                description="Column name for x-axis (or categories for bar/pie charts, or row dimension for heatmaps)",
            ),
            "y_columns": types.Schema(
                type="ARRAY",
                items=types.Schema(type="STRING"),
                description="Column name(s) for y-axis values. Multiple columns create grouped/multi-series charts.",
            ),
            "color_column": types.Schema(
                type="STRING",
                description="Optional column for color grouping (creates separate traces per unique value)",
            ),
            "orientation": types.Schema(
                type="STRING",
                enum=["vertical", "horizontal"],
                description="Bar/box chart orientation. Default: vertical.",
            ),
            "aggregation": types.Schema(
                type="STRING",
                enum=["none", "sum", "avg", "count", "min", "max"],
                description="Aggregation to apply if data needs grouping. Default: none.",
            ),
            "bar_mode": types.Schema(
                type="STRING",
                enum=["group", "stack", "relative"],
                description="Bar chart grouping mode. Default: group.",
            ),
            "color_scale": types.Schema(
                type="STRING",
                enum=["default", "diverging", "sequential", "categorical"],
                description="Color scale type. 'diverging' centers at zero. Default: default.",
            ),
            "x_label": types.Schema(
                type="STRING",
                description="Custom x-axis label",
            ),
            "y_label": types.Schema(
                type="STRING",
                description="Custom y-axis label",
            ),
            "show_values": types.Schema(
                type="BOOLEAN",
                description="Show value labels on bars/points. Default: false.",
            ),
            "z_column": types.Schema(
                type="STRING",
                description="Column name for z-axis values (used in heatmap to specify the numeric value for the color intensity)",
            ),
            "location_column": types.Schema(
                type="STRING",
                description="Column name containing geographic locations (state names, abbreviations, or FIPS codes) for choropleth maps",
            ),
            "location_type": types.Schema(
                type="STRING",
                enum=["state_name", "state_abbr", "country_name", "country_iso3"],
                description="Type of geographic identifier in location_column. Default: auto-detect.",
            ),
        },
        required=["chart_type", "title"],
    ),
)

_suggest_followups_decl = types.FunctionDeclaration(
    name="suggest_followups",
    description="After answering a user's question, suggest 2-3 natural follow-up questions they might want to ask next. Only call this after you've fully answered the user's question.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "suggestions": types.Schema(
                type="ARRAY",
                items=types.Schema(type="STRING"),
                description="List of 2-3 short follow-up questions (max 80 chars each)",
            ),
        },
        required=["suggestions"],
    ),
)

TOOLS = [types.Tool(function_declarations=[_execute_sql_decl, _load_dataset_decl, _create_chart_decl, _suggest_followups_decl])]


# ---------------------------------------------------------------------------
# Gemini rate-limit error
# ---------------------------------------------------------------------------


class GeminiRateLimitError(Exception):
    """Raised when Gemini API returns 429 and all retries are exhausted."""

    def __init__(self) -> None:
        super().__init__(
            "The AI service is temporarily busy. Please try again in a moment."
        )


# ---------------------------------------------------------------------------
# StreamResult
# Implements: spec/backend/llm/plan.md#streaming-response-handler
# ---------------------------------------------------------------------------


@dataclass
class SqlExecution:
    """Result of a single SQL query execution."""

    query: str = ""
    columns: list[str] | None = None
    rows: list[list] | None = None          # Capped at 100 rows (for WS transmission)
    full_rows: list[list] | None = None     # Up to 1000 rows (for DB persistence)
    total_rows: int | None = None
    error: str | None = None
    execution_time_ms: float | None = None


@dataclass
class StreamResult:
    """Result of a streaming chat turn."""

    input_tokens: int = 0
    output_tokens: int = 0
    assistant_message: str = ""
    reasoning: str = ""
    tool_calls_made: int = 0
    sql_queries: list[str] = field(default_factory=list)
    sql_executions: list[SqlExecution] = field(default_factory=list)
    followup_suggestions: list[str] = field(default_factory=list)
    tool_call_trace: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# build_system_prompt
# Implements: spec/backend/llm/plan.md#system-prompt-construction
# ---------------------------------------------------------------------------


def build_system_prompt(datasets: list[dict]) -> str:
    """Assemble table schemas into a system prompt.

    Args:
        datasets: List of dicts with ``name``, ``schema_json``, and optionally
                  ``row_count`` keys.

    Returns:
        The system prompt string for the Gemini API.
    """
    parts: list[str] = []

    # Role statement
    parts.append(
        "You are a data analyst assistant. Help users understand and explore their data."
    )

    if datasets:
        parts.append("\n## Available Datasets\n")

        # Build reference column index from the first dataset for deduplication
        reference_table: str | None = None
        reference_columns: dict[str, str] = {}  # col_name -> col_type

        for ds_index, ds in enumerate(datasets):
            name = ds["name"]
            schema_raw = ds.get("schema_json", "[]")
            row_count = ds.get("row_count", 0)

            if isinstance(schema_raw, str):
                columns = json.loads(schema_raw)
            else:
                columns = schema_raw

            # Save first dataset as reference for schema deduplication
            if ds_index == 0:
                reference_table = name
                for col in columns:
                    col_name = col.get("name", "unknown")
                    col_type = col.get("type", "unknown")
                    reference_columns[col_name] = col_type

            parts.append(f"### Table: {name}")
            parts.append(f"Row count: {row_count}")
            parts.append("Columns:")
            for col in columns:
                col_name = col.get("name", "unknown")
                col_type = col.get("type", "unknown")
                sample_values = col.get("sample_values", [])

                # For subsequent datasets, abbreviate columns that match the
                # reference table (same name and type) to save context tokens.
                if (
                    ds_index > 0
                    and col_name in reference_columns
                    and reference_columns[col_name] == col_type
                ):
                    parts.append(
                        f"  - {col_name}: same as {reference_table}.{col_name}"
                    )
                    continue

                line = f"  - {col_name}: {col_type}"

                # Build parenthetical with samples and stats
                paren_parts: list[str] = []

                if sample_values:
                    # Format sample values with quotes for strings
                    formatted = ", ".join(f'"{v}"' for v in sample_values[:5])
                    paren_parts.append(f"samples: {formatted}")

                # Add column stats if available
                col_stats = col.get("column_stats", {})
                if col_stats:
                    if "min" in col_stats and "max" in col_stats:
                        paren_parts.append(
                            f"range: {col_stats['min']}\u2013{col_stats['max']}"
                        )
                    if "unique_count" in col_stats:
                        paren_parts.append(
                            f"{col_stats['unique_count']} unique values"
                        )
                    if "null_count" in col_stats:
                        paren_parts.append(
                            f"{col_stats['null_count']} nulls"
                        )

                if paren_parts:
                    line += f" ({'; '.join(paren_parts)})"

                parts.append(line)
            parts.append("")

        parts.append("## Instructions")
        parts.append("- Use the provided table names as-is in SQL queries.")
        parts.append(
            "- Explore data before answering when uncertain "
            "(check column values, types)."
        )
        parts.append(
            "- SQL dialect: Polars SQL. Note any differences from standard SQL."
        )
        parts.append("- Always include LIMIT in your queries (LIMIT 1000 is a good default). Note: queries without LIMIT are automatically capped at 10,000 rows.")
        parts.append("- Dataset files are limited to 500 MB. If a dataset fails to load, it may exceed this limit.")
        parts.append("- Query execution has a 5-minute timeout. If a query times out, suggest adding filters or LIMIT.")
        parts.append("- Maximum 50 datasets can be loaded per conversation.")
        parts.append("- Return concise, helpful answers.")
        parts.append(
            "- Use the execute_sql tool to run SQL queries against the datasets."
        )
        parts.append("")
        parts.append("## Polars SQL Dialect Notes")
        parts.append("IMPORTANT: Polars SQL differs from PostgreSQL/MySQL. Follow these rules:")
        parts.append("- No ILIKE: use `LOWER(col) LIKE LOWER('%pattern%')` for case-insensitive matching")
        parts.append("- No DATE_TRUNC: use `strftime('%Y-%m', date_col)` for month truncation, `strftime('%Y', date_col)` for year, etc.")
        parts.append("- No DATE_PART: use `EXTRACT(YEAR FROM date_col)` or `strftime('%Y', date_col)` instead")
        parts.append("- No CONCAT(): use the `||` operator for string concatenation (e.g., `col1 || ' ' || col2`)")
        parts.append("- No COALESCE in some contexts: use `CASE WHEN col IS NULL THEN default ELSE col END` instead")
        parts.append("- CAST syntax: `CAST(col AS INTEGER)`, `CAST(col AS FLOAT)`, `CAST(col AS VARCHAR)`")
        parts.append("- LIMIT and OFFSET are both supported")
        parts.append("- Use single quotes for string literals, double quotes for identifiers")
        parts.append("- GROUP BY and ORDER BY support column position numbers (e.g., `GROUP BY 1, 2`)")
        parts.append("- Window functions are supported: ROW_NUMBER(), RANK(), SUM() OVER(), etc.")
        parts.append("- Read-only queries only: no CREATE TABLE, INSERT, UPDATE, or DELETE")
        parts.append("- No INTERVAL syntax: date arithmetic (DATE_ADD, DATE_SUB) is not supported in Polars SQL")
        parts.append("- SUBSTRING works but NOT SUBSTR: always use SUBSTRING(col, start, length)")
        parts.append("- No REGEXP or RLIKE: use LIKE patterns instead for pattern matching")
        parts.append("- HAVING works only with column aliases or repeated aggregate expressions, not raw column refs")
        parts.append("- No DISTINCT ON: use ROW_NUMBER() window function to pick one row per group instead")
        parts.append("- Boolean columns: use `col = true` or `col = false`, NOT `col IS TRUE`")
        parts.append("- No NULLS FIRST / NULLS LAST in ORDER BY — NULLs sort to end by default")
        parts.append("- String length: use LENGTH(col), NOT LEN(col) or CHAR_LENGTH(col)")
        parts.append("- No BETWEEN for date ranges: use explicit `>=` and `<=` comparisons instead")
        parts.append("- COALESCE works for simple 2-argument cases. For 3+ arguments, nest: COALESCE(a, COALESCE(b, c))")
        parts.append("- IN with subquery: `WHERE col IN (SELECT col FROM ...)` is supported")
        parts.append("- UNION ALL is supported; plain UNION (with dedup) may not work — prefer UNION ALL")
        parts.append("- No INTERSECT or EXCEPT: these set operations are not supported — use LEFT JOIN with IS NULL or NOT EXISTS patterns instead")
        parts.append("- Aggregate functions (SUM, AVG, MIN, MAX) skip NULL values automatically. Use COALESCE() to replace NULLs before aggregating if you want to include them.")
        parts.append("- TRIM(), LTRIM(), RTRIM() are supported for whitespace removal")
        parts.append("- REPLACE(string, from, to) is supported for string replacement")
        parts.append("- ROUND(value, decimals) is supported for rounding numbers")
        parts.append("- ABS(), CEIL(), FLOOR() are supported for numeric operations")
        parts.append("- COUNT(DISTINCT col) is supported for counting unique values")
        parts.append("- CASE WHEN ... THEN ... ELSE ... END is fully supported (including nested CASE)")
        parts.append("- Implicit type conversion is NOT supported — always use explicit CAST() between types")
        parts.append("- Boolean values are true/false (lowercase), NOT 1/0 — don't use CAST(col AS BOOLEAN) on integers")
        parts.append("- NaN values: use col != col or CAST('NaN' AS FLOAT) to detect/filter NaN values")
        parts.append("- LEFT(str, n) and RIGHT(str, n) are NOT supported — use SUBSTRING(str, 1, n) instead")
        parts.append("")
        parts.append("Common mistakes to avoid:")
        parts.append("- Do NOT use ILIKE — use LOWER(col) LIKE LOWER('%pattern%')")
        parts.append("- Do NOT use DATE_TRUNC — use strftime()")
        parts.append("- Do NOT use string || NULL — result is NULL, use COALESCE first")
        parts.append("- Do NOT use LIMIT without ORDER BY for \"top N\" queries")
        parts.append("- Do NOT assume column names — always check the schema above")
        parts.append("- Do NOT use LEFT() or RIGHT() — use SUBSTRING(str, 1, n)")
        parts.append("- Do NOT compare string columns to integers — use CAST() first")
        parts.append("- Do NOT use INTERSECT or EXCEPT — use LEFT JOIN with IS NULL instead")
        parts.append("")
        parts.append("## Example Query Patterns")
        parts.append("Here are correct Polars SQL query patterns to follow:")
        parts.append("")
        parts.append("### Aggregation with GROUP BY")
        parts.append("```sql")
        parts.append("SELECT category, COUNT(*) AS cnt, AVG(amount) AS avg_amount")
        parts.append("FROM table1")
        parts.append("GROUP BY 1")
        parts.append("ORDER BY cnt DESC")
        parts.append("LIMIT 20")
        parts.append("```")
        parts.append("")
        parts.append("### Date-based filtering with strftime")
        parts.append("```sql")
        parts.append("SELECT strftime('%Y-%m', created_at) AS month, SUM(revenue) AS total_revenue")
        parts.append("FROM table1")
        parts.append("WHERE created_at >= '2023-01-01'")
        parts.append("GROUP BY 1")
        parts.append("ORDER BY 1")
        parts.append("```")
        parts.append("")
        parts.append("### Case-insensitive string matching")
        parts.append("```sql")
        parts.append("SELECT *")
        parts.append("FROM table1")
        parts.append("WHERE LOWER(city) LIKE LOWER('%new york%')")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("### Window function")
        parts.append("```sql")
        parts.append("SELECT name, department, salary,")
        parts.append("  RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank")
        parts.append("FROM table1")
        parts.append("ORDER BY department, dept_rank")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("### Top-N per group (using window functions instead of DISTINCT ON)")
        parts.append("```sql")
        parts.append("SELECT * FROM (")
        parts.append("  SELECT *,")
        parts.append("    ROW_NUMBER() OVER (PARTITION BY category ORDER BY score DESC) AS rn")
        parts.append("  FROM table1")
        parts.append(") sub")
        parts.append("WHERE rn <= 3")
        parts.append("ORDER BY category, rn")
        parts.append("LIMIT 1000")
        parts.append("```")
        parts.append("")
        parts.append("### Safe date filtering with strftime and explicit comparisons")
        parts.append("```sql")
        parts.append("SELECT strftime('%Y-%m', order_date) AS month,")
        parts.append("  COUNT(*) AS order_count,")
        parts.append("  SUM(total) AS revenue")
        parts.append("FROM table1")
        parts.append("WHERE strftime('%Y', order_date) = '2024'")
        parts.append("  AND order_date >= '2024-01-01' AND order_date <= '2024-12-31'")
        parts.append("GROUP BY 1")
        parts.append("ORDER BY 1")
        parts.append("LIMIT 1000")
        parts.append("```")
        parts.append("")
        parts.append("### CTE (Common Table Expression)")
        parts.append("```sql")
        parts.append("-- CTE example")
        parts.append("WITH top_categories AS (")
        parts.append("  SELECT category, COUNT(*) AS cnt")
        parts.append("  FROM table1")
        parts.append("  GROUP BY 1")
        parts.append("  HAVING COUNT(*) >= 10")
        parts.append("  ORDER BY cnt DESC")
        parts.append("  LIMIT 10")
        parts.append(")")
        parts.append("SELECT t.* FROM table1 t")
        parts.append("JOIN top_categories tc ON t.category = tc.category")
        parts.append("ORDER BY t.category, t.created_at DESC")
        parts.append("LIMIT 1000")
        parts.append("```")
        parts.append("")
        parts.append("### Safe NULL handling")
        parts.append("```sql")
        parts.append("-- Safe NULL handling")
        parts.append("SELECT ")
        parts.append("  COALESCE(category, 'Unknown') AS category,")
        parts.append("  COUNT(*) AS total,")
        parts.append("  COUNT(amount) AS non_null_count,")
        parts.append("  CASE WHEN COUNT(amount) > 0 THEN AVG(amount) ELSE 0 END AS avg_amount")
        parts.append("FROM table1")
        parts.append("GROUP BY 1")
        parts.append("ORDER BY total DESC")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("### Type casting and conversion")
        parts.append("```sql")
        parts.append("-- Proper type casting")
        parts.append("SELECT ")
        parts.append("  CAST(price_text AS FLOAT) AS price,")
        parts.append("  CAST(quantity AS INTEGER) AS qty,")
        parts.append("  CAST(created_at AS DATE) AS date_only,")
        parts.append("  CAST(id AS VARCHAR) || '-' || CAST(version AS VARCHAR) AS composite_key")
        parts.append("FROM table1")
        parts.append("WHERE CAST(price_text AS FLOAT) > 0")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("### Multi-table JOIN")
        parts.append("```sql")
        parts.append("-- Multi-table JOIN")
        parts.append("SELECT a.name, b.category, SUM(a.amount) AS total")
        parts.append("FROM orders a")
        parts.append("JOIN products b ON a.product_id = b.id")
        parts.append("GROUP BY 1, 2")
        parts.append("ORDER BY total DESC")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("### BETWEEN equivalent (Polars SQL has no BETWEEN)")
        parts.append("```sql")
        parts.append("-- Polars SQL does not support BETWEEN. Use >= and <= instead.")
        parts.append("SELECT * FROM table1")
        parts.append("WHERE price >= 10.0 AND price <= 50.0")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("### Conditional aggregation with CASE")
        parts.append("```sql")
        parts.append("-- Use CASE inside aggregates for conditional counting/summing")
        parts.append("SELECT")
        parts.append("  COUNT(*) AS total,")
        parts.append("  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,")
        parts.append("  SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_count")
        parts.append("FROM table1")
        parts.append("```")
        parts.append("")
        parts.append("### String search with multiple patterns")
        parts.append("```sql")
        parts.append("-- Use multiple LIKE conditions with OR (no REGEXP support)")
        parts.append("SELECT * FROM table1")
        parts.append("WHERE LOWER(description) LIKE '%error%'")
        parts.append("   OR LOWER(description) LIKE '%warning%'")
        parts.append("   OR LOWER(description) LIKE '%critical%'")
        parts.append("LIMIT 100")
        parts.append("```")
        parts.append("")
        parts.append("## Query Performance Tips")
        parts.append("Queries have a 5-minute timeout. To avoid timeouts on large datasets:")
        parts.append("- Always use LIMIT (start with LIMIT 100, increase if the user needs more)")
        parts.append("- Filter with WHERE before aggregating — don't scan the entire table when a subset suffices")
        parts.append("- SELECT only the columns you need — avoid SELECT * on wide tables")
        parts.append("- For large GROUP BY results, add ORDER BY and LIMIT to get just the top/bottom N")
        parts.append("- When exploring an unfamiliar dataset, start with `SELECT * FROM table LIMIT 10` to see sample data")
        parts.append("- For COUNT queries on very large datasets, the result is fast — Polars counts without scanning all data")
        parts.append("- Avoid multiple sequential queries when a single query with JOINs or subqueries would work")
        parts.append("")
        parts.append("## Data Type Notes")
        parts.append("- Date columns: compare with string literals in 'YYYY-MM-DD' format (e.g., WHERE date_col >= '2023-01-01')")
        parts.append("- Timestamp columns: use strftime() for extraction, compare with ISO 8601 strings")
        parts.append("- Boolean columns: use true/false (lowercase), never 1/0 or 'true'/'false' strings")
        parts.append("- NULL handling: aggregates (SUM, AVG, etc.) skip NULLs. Use COUNT(col) for non-NULL count, COUNT(*) for all rows")
        parts.append("- Integer overflow: CAST to FLOAT before multiplying large integers")
        parts.append("")
        parts.append("## When Queries Fail")
        parts.append("If a query fails, analyze the error and retry with a corrected query:")
        parts.append("- Column not found → check exact column names in the schema above (case-sensitive)")
        parts.append("- Type mismatch → add explicit CAST() to align types")
        parts.append("- Unsupported function → check the dialect notes above for the correct alternative")
        parts.append("- Query timeout → simplify: add WHERE filters, reduce columns, add LIMIT")
        parts.append("- Out of memory → treat like timeout: reduce data volume with filters and LIMIT")
        parts.append("- Syntax error → check for missing commas, unmatched parentheses, or reserved words used as identifiers (quote with double quotes)")
        parts.append("")
        parts.append("## Visualization Guidelines")
        parts.append("")
        parts.append("After executing a SQL query, consider whether the results would benefit from a chart.")
        parts.append("Call create_chart when:")
        parts.append("- Comparing values across categories (use bar chart)")
        parts.append("- Showing trends over time (use line chart)")
        parts.append("- Showing relationships between two numeric variables (use scatter plot)")
        parts.append("- Showing distributions (use histogram or box plot)")
        parts.append("- Showing proportions of a whole (use pie chart, only for <=8 categories)")
        parts.append("")
        parts.append("Do NOT call create_chart when:")
        parts.append("- The result is a single value or a very small table (1-2 rows)")
        parts.append("- The user explicitly asked for just the data/table")
        parts.append("- The query returned an error")
        parts.append("")
        parts.append("Chart type selection:")
        parts.append("- bar: categorical comparison (use horizontal_bar for long labels)")
        parts.append("- line: time series or ordered sequences")
        parts.append("- scatter: correlation between two numeric columns")
        parts.append("- histogram: distribution of a single numeric column")
        parts.append("- box: comparing distributions across groups")
        parts.append("- pie: proportions (only <=8 categories)")
        parts.append("- heatmap: showing intensity/correlation across two categorical dimensions with a numeric value (x_column = column dimension, y_columns[0] = row dimension, z_column = value; data is pivoted into a 2D matrix)")
        parts.append("- choropleth: geographic distribution across US states (requires a location column with state names/abbreviations and a numeric value column)")
        parts.append("")
        parts.append("Use diverging color_scale when data represents change, savings, or difference from a baseline.")
        parts.append("Set show_values to true for bar charts with <=15 bars.")
        parts.append("Set orientation to 'horizontal' when category labels are long strings.")
        parts.append("For heatmap charts: set x_column to the column dimension, y_columns to [row_dimension_column], and z_column to the value column.")
        parts.append("For choropleth charts: set location_column to the column with geographic names/codes, y_columns to [value_column], and title descriptively. Use color_scale='diverging' when showing change/difference.")
        parts.append("")
        parts.append("## Follow-up Suggestions")
        parts.append("After answering a question, call suggest_followups with 2-3 natural follow-up questions.")
        parts.append("Make suggestions specific to the data and the user's current line of inquiry.")
        parts.append("Do NOT suggest follow-ups if the user just loaded a dataset or if you encountered an error.")
    else:
        parts.append("\n## No Datasets Loaded\n")
        parts.append(
            "No datasets are currently loaded in this conversation. "
            "Suggest that the user add a dataset using the dataset panel, "
            "or if the user provides a parquet URL in their message, "
            "use the load_dataset tool to load it automatically."
        )

    parts.append(
        "\n- If the user's message contains a parquet URL, "
        "automatically load it via the load_dataset tool before answering."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# prune_context
# Implements: spec/backend/llm/plan.md#conversation-context-management
# ---------------------------------------------------------------------------


def _has_sql_results(msg: dict) -> bool:
    """Check if a message contains SQL query results.

    Assistant messages with a non-empty ``sql_query`` field contain SQL
    execution results which are more valuable context for the LLM than
    plain text messages.
    """
    if msg.get("role") != "assistant":
        return False
    sql_query = msg.get("sql_query")
    return bool(sql_query and sql_query.strip() and sql_query.strip() != "null")


def prune_context(
    messages: list[dict],
    max_messages: int = 50,
    max_tokens: int = 800_000,
) -> list[dict]:
    """Prune conversation context to fit within limits.

    Keeps system messages (role="system") always. Then keeps the most recent
    ``max_messages`` user/assistant messages. Finally, if estimated token count
    exceeds ``max_tokens``, removes oldest plain-text messages first, then
    oldest SQL-result messages, to preferentially retain SQL context.

    Args:
        messages: Full list of message dicts with ``role`` and ``content``.
        max_messages: Max user+assistant messages to retain (default 50).
        max_tokens: Token budget estimated as total_chars // 4 (default 800K).

    Returns:
        Pruned list of message dicts.
    """
    if not messages:
        return []

    # Separate system messages from user/assistant messages
    system_msgs = [m for m in messages if m.get("role") == "system"]
    non_system_msgs = [m for m in messages if m.get("role") != "system"]

    # Keep the most recent max_messages non-system messages
    if len(non_system_msgs) > max_messages:
        non_system_msgs = non_system_msgs[-max_messages:]

    # Token budget check: estimate tokens as total_chars // 4
    def _estimate_tokens(msgs: list[dict]) -> int:
        return sum(len(m.get("content", "")) for m in msgs) // 4

    # Phase 1: Remove oldest plain-text messages first (no SQL results)
    while non_system_msgs and _estimate_tokens(system_msgs + non_system_msgs) > max_tokens:
        # Find the oldest non-SQL message to remove
        plain_idx = None
        for i, m in enumerate(non_system_msgs):
            if not _has_sql_results(m):
                plain_idx = i
                break

        if plain_idx is not None:
            non_system_msgs.pop(plain_idx)
        else:
            # Phase 2: No plain-text messages left; remove oldest SQL message
            non_system_msgs.pop(0)

    return system_msgs + non_system_msgs


# ---------------------------------------------------------------------------
# stream_chat
# Implements: spec/backend/llm/plan.md#streaming-response-handler
# Implements: spec/backend/llm/plan.md#tool-call-execution-flow
# ---------------------------------------------------------------------------


def _extract_available_columns(datasets: list[dict]) -> list[str]:
    """Extract a flat list of column names from all datasets.

    Parses ``schema_json`` (JSON string or list of column dicts) from each
    dataset and collects column names for use in error translation.
    """
    columns: list[str] = []
    for ds in datasets:
        schema_raw = ds.get("schema_json", "[]")
        if isinstance(schema_raw, str):
            try:
                schema = json.loads(schema_raw)
            except (json.JSONDecodeError, TypeError):
                continue
        else:
            schema = schema_raw or []
        for col in schema:
            col_name = col.get("name") if isinstance(col, dict) else None
            if col_name:
                columns.append(col_name)
    return columns


def _messages_to_contents(messages: list[dict]) -> list[types.Content]:
    """Convert message dicts to Gemini Content objects."""
    contents = []
    for msg in messages:
        role = msg["role"]
        # Gemini uses "model" for assistant role
        if role == "assistant":
            role = "model"
        # Skip system messages (handled via system_instruction)
        if role == "system":
            continue
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part(text=msg["content"])],
            )
        )
    return contents


async def stream_chat(
    messages: list[dict],
    datasets: list[dict],
    ws_send: callable,
    cancel_event: asyncio.Event | None = None,
    pool: object | None = None,
    db: object | None = None,
    conversation_id: str | None = None,
    model_id: str | None = None,
) -> StreamResult:
    """Stream a chat response from Gemini, handling tool calls.

    Args:
        messages: Conversation history as list of ``{"role": str, "content": str}``.
        datasets: Dataset dicts for system prompt construction.
        ws_send: Async callable ``(message)`` for WebSocket dispatch (already formatted dict).
        cancel_event: Optional asyncio.Event; when set, streaming stops.
        pool: Optional worker pool for SQL execution.
        db: Optional database connection for dataset loading.
        conversation_id: Optional conversation ID for dataset loading.
        model_id: Optional model ID override (defaults to MODULE_ID constant).

    Returns:
        StreamResult with token counts, assistant message, and tool call count.
    """
    result = StreamResult()
    system_prompt = build_system_prompt(datasets)
    contents = _messages_to_contents(messages)
    effective_model = model_id or MODEL_ID
    trace_entries: list[dict] = []

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        tools=TOOLS,
        thinking_config=types.ThinkingConfig(include_thoughts=True),
    )

    tool_call_count = 0
    sql_query_count = 0
    sql_retry_count = 0
    collected_text = ""
    collected_reasoning = ""
    reasoning_emitted = False

    while True:
        # Call Gemini async streaming API with retry on 429 RESOURCE_EXHAUSTED
        stream = None
        for attempt in range(MAX_GEMINI_RETRIES + 1):
            try:
                stream = await client.aio.models.generate_content_stream(
                    model=effective_model,
                    contents=contents,
                    config=config,
                )
                break  # success — exit retry loop
            except ClientError as exc:
                if exc.code == 429 and attempt < MAX_GEMINI_RETRIES:
                    delay = GEMINI_RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "Gemini 429 RESOURCE_EXHAUSTED (attempt %d/%d), "
                        "retrying in %ds",
                        attempt + 1,
                        MAX_GEMINI_RETRIES,
                        delay,
                    )
                    await ws_send(ws_messages.chat_token(
                        token="",
                        message_id="streaming",
                    ))
                    await asyncio.sleep(delay)
                elif exc.code == 429:
                    # All retries exhausted
                    logger.error(
                        "Gemini 429 RESOURCE_EXHAUSTED — all %d retries exhausted",
                        MAX_GEMINI_RETRIES,
                    )
                    raise GeminiRateLimitError() from exc
                else:
                    raise  # non-429 ClientError — propagate as-is

        found_tool_call = False
        tool_call_name = None
        tool_call_args = None

        async for chunk in stream:
            # Check for cancellation
            if cancel_event and cancel_event.is_set():
                result.assistant_message = collected_text
                return result

            # Process chunk parts
            if hasattr(chunk, "candidates") and chunk.candidates:
                for candidate in chunk.candidates:
                    if hasattr(candidate, "content") and candidate.content:
                        for part in (candidate.content.parts or []):
                            # Text part
                            if hasattr(part, "text") and part.text is not None and part.text:
                                if getattr(part, "thought", False):
                                    # Reasoning/thinking token
                                    collected_reasoning += part.text
                                    trace_entries.append({"type": "reasoning", "content": part.text})
                                    await ws_send(ws_messages.reasoning_token(token=part.text))
                                else:
                                    # Normal output token
                                    if collected_reasoning and not reasoning_emitted:
                                        await ws_send(ws_messages.reasoning_complete())
                                        reasoning_emitted = True
                                    collected_text += part.text
                                    trace_entries.append({"type": "text", "content": part.text})
                                    await ws_send(ws_messages.chat_token(token=part.text, message_id="streaming"))

                            # Function call part
                            if hasattr(part, "function_call") and part.function_call is not None:
                                found_tool_call = True
                                tool_call_name = part.function_call.name
                                tool_call_args = (
                                    dict(part.function_call.args)
                                    if part.function_call.args
                                    else {}
                                )
                                break
                    if found_tool_call:
                        break
            if found_tool_call:
                break

        # Accumulate token counts from usage_metadata
        if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
            result.input_tokens += chunk.usage_metadata.prompt_token_count or 0
            result.output_tokens += chunk.usage_metadata.candidates_token_count or 0

        if not found_tool_call:
            # No tool call — streaming complete
            break

        # --- Tool call execution ---
        tool_call_count += 1
        result.tool_calls_made = tool_call_count

        # Check max tool calls limit
        if tool_call_count > MAX_TOOL_CALLS_PER_TURN:
            # Force LLM to respond without more tools
            contents.append(
                types.Content(
                    role="model",
                    parts=[types.Part(function_call=types.FunctionCall(
                        name=tool_call_name,
                        args=tool_call_args,
                    ))],
                )
            )
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part(text=(
                        "Maximum tool calls reached. Please respond with "
                        "the information you have gathered so far without "
                        "making any more tool calls."
                    ))],
                )
            )
            # Remove tools from config for the final response
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
            )
            continue

        # Send tool_call_start event
        await ws_send(ws_messages.tool_call_start(tool=tool_call_name, args=tool_call_args))

        # Dispatch tool call
        tool_result_str = ""
        if tool_call_name == "execute_sql":
            # If max SQL retries already reached, refuse to dispatch
            if sql_retry_count >= MAX_SQL_RETRIES:
                tool_result_str = (
                    "Maximum SQL retry attempts reached. "
                    "Please explain the error to the user instead of retrying."
                )
            else:
                query = tool_call_args.get("query", "")
                result.sql_queries.append(query)
                sql_query_count += 1
                await ws_send(ws_messages.query_progress(query_number=sql_query_count))
                # Map dataset dicts to worker format (execute_query expects "table_name")
                worker_datasets = [
                    {"url": ds["url"], "table_name": ds["name"]}
                    for ds in datasets
                ]
                query_result = await pool.run_query(query, worker_datasets)

                if "error_type" in query_result or "error" in query_result:
                    sql_retry_count += 1
                    error_msg = query_result.get("message", query_result.get("error", "Unknown error"))
                    # Translate raw Polars error to user-friendly message
                    available_cols = _extract_available_columns(datasets)
                    friendly_error = translate_polars_error(error_msg, available_cols)
                    tool_result_str = f"Error executing SQL: {friendly_error}"
                    result.sql_executions.append(SqlExecution(
                        query=query,
                        error=friendly_error,
                        execution_time_ms=query_result.get("execution_time_ms"),
                    ))

                    # Check if max SQL retries reached
                    if sql_retry_count >= MAX_SQL_RETRIES:
                        tool_result_str += (
                            "\n\nMaximum SQL retry attempts reached. "
                            "Please explain the error to the user instead of retrying."
                        )
                else:
                    rows = query_result.get("rows", [])
                    columns = query_result.get("columns", [])
                    total = query_result.get("total_rows", len(rows))
                    # Convert dict rows to arrays (Polars to_dicts() returns
                    # list[dict], but the frontend expects list[list]).
                    # full_rows: up to 1000 rows for DB persistence
                    all_rows = [
                        [row.get(c) for c in columns]
                        for row in rows
                    ]
                    # rows: capped at 100 for WS transmission
                    capped_rows = all_rows[:100]
                    result.sql_executions.append(SqlExecution(
                        query=query,
                        columns=columns,
                        rows=capped_rows,
                        full_rows=all_rows,
                        total_rows=total,
                        execution_time_ms=query_result.get("execution_time_ms"),
                    ))
                    tool_result_str = (
                        f"Query executed successfully.\n"
                        f"Columns: {columns}\n"
                        f"Total rows: {total}\n"
                        f"Results (first {len(rows)} rows): {json.dumps(rows[:20], default=str)}"
                    )

        elif tool_call_name == "load_dataset":
            url = tool_call_args.get("url", "")
            try:
                ds_result = await dataset_service.add_dataset(db, conversation_id, url, pool)
                tool_result_str = (
                    f"Dataset loaded successfully.\n"
                    f"Table name: {ds_result.get('name', 'unknown')}\n"
                    f"Rows: {ds_result.get('row_count', 0)}\n"
                    f"Columns: {ds_result.get('column_count', 0)}"
                )
            except ValueError as exc:
                tool_result_str = f"Error loading dataset: {exc}"
        elif tool_call_name == "create_chart":
            chart_spec = tool_call_args
            # Find the most recent successful SQL execution to link the chart to
            latest_exec_id = None
            if result.sql_executions:
                for i in range(len(result.sql_executions) - 1, -1, -1):
                    if result.sql_executions[i].error is None:
                        latest_exec_id = i
                        break
            await ws_send(ws_messages.chart_spec(
                execution_index=latest_exec_id if latest_exec_id is not None else len(result.sql_executions) - 1,
                spec=chart_spec,
            ))
            tool_result_str = f"Chart created successfully. Type: {chart_spec.get('chart_type', 'unknown')}, Title: {chart_spec.get('title', 'Untitled')}"
        elif tool_call_name == "suggest_followups":
            suggestions = tool_call_args.get("suggestions", [])
            # Limit to 3 suggestions, max 80 chars each
            suggestions = [s[:80] for s in suggestions[:3]]
            result.followup_suggestions = suggestions
            await ws_send(ws_messages.followup_suggestions(suggestions=suggestions))
            tool_result_str = "Follow-up suggestions displayed to user."
        else:
            tool_result_str = f"Unknown tool: {tool_call_name}"

        # Record tool call in trace
        trace_entries.append({
            "type": "tool_call",
            "tool": tool_call_name,
            "args": tool_call_args,
            "result": tool_result_str,
        })

        # Append tool call and result to contents for next Gemini call
        contents.append(
            types.Content(
                role="model",
                parts=[types.Part(function_call=types.FunctionCall(
                    name=tool_call_name,
                    args=tool_call_args,
                ))],
            )
        )
        contents.append(
            types.Content(
                role="function",
                parts=[types.Part(function_response=types.FunctionResponse(
                    name=tool_call_name,
                    response={"result": tool_result_str},
                ))],
            )
        )

    result.assistant_message = collected_text
    result.reasoning = collected_reasoning
    result.tool_call_trace = trace_entries
    return result
