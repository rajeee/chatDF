"""Dataset service: validation pipeline, CRUD, auto-naming.

Implements: spec/backend/dataset_handling/plan.md

Provides:
- ``validate_url(url)``: Format check for http/https URL.
- ``add_dataset(db, conversation_id, url, worker_pool)``: 6-step pipeline.
- ``remove_dataset(db, dataset_id)``: Delete from datasets table.
- ``refresh_schema(db, dataset_id, worker_pool)``: Re-run steps 4-5, update row.
- ``get_datasets(db, conversation_id)``: Query all datasets for a conversation.
- ``_next_table_name(db, conversation_id)``: Auto-naming: table1, table2, ...
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_DATASETS_PER_CONVERSATION = 50

# Regex: http or https scheme, no spaces
_URL_PATTERN = re.compile(r"^https?://\S+$")


# ---------------------------------------------------------------------------
# validate_url
# Implements: spec/backend/dataset_handling/plan.md#validation-pipeline (step 1)
# ---------------------------------------------------------------------------


def validate_url(url: str) -> None:
    """Check that *url* is a valid http/https URL.

    Raises ``ValueError`` with message "Invalid URL format" on failure.
    """
    if not url or not _URL_PATTERN.match(url):
        raise ValueError("Invalid URL format")


# ---------------------------------------------------------------------------
# _next_table_name
# Implements: spec/backend/dataset_handling/plan.md#auto-naming
# ---------------------------------------------------------------------------


async def _next_table_name(db: aiosqlite.Connection, conversation_id: str) -> str:
    """Return the next auto-generated table name for *conversation_id*.

    Uses ``SELECT COUNT(*) FROM datasets WHERE conversation_id = ?`` and
    returns ``f"table{count + 1}"``.
    """
    cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM datasets WHERE conversation_id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    count = row["cnt"] if row else 0
    return f"table{count + 1}"


# ---------------------------------------------------------------------------
# add_dataset
# Implements: spec/backend/dataset_handling/plan.md#validation-pipeline
# ---------------------------------------------------------------------------


async def add_dataset(
    db: aiosqlite.Connection,
    conversation_id: str,
    url: str,
    worker_pool: object,
    name: str | None = None,
) -> dict:
    """Run the 6-step validation pipeline and persist a new dataset.

    Steps:
    1. Format check (validate_url)
    2. Duplicate check (same URL in this conversation)
    3. Limit check (MAX_DATASETS_PER_CONVERSATION)
    4. HEAD + magic bytes via worker_pool.validate_url
    5. Schema extraction via worker_pool.get_schema
    6. Persist to datasets table

    Returns the created dataset dict.
    Raises ``ValueError`` with a user-facing message on any failure.
    """
    # Step 1: Format check
    validate_url(url)

    # Step 2: Duplicate check
    cursor = await db.execute(
        "SELECT 1 FROM datasets WHERE conversation_id = ? AND url = ?",
        (conversation_id, url),
    )
    if await cursor.fetchone() is not None:
        raise ValueError("This dataset is already loaded")

    # Step 3: Limit check
    cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM datasets WHERE conversation_id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row["cnt"] >= MAX_DATASETS_PER_CONVERSATION:
        raise ValueError("Maximum 50 datasets reached")

    # Step 4: HEAD + magic bytes
    validate_result = await worker_pool.validate_url(url)
    if not validate_result.get("valid"):
        error_msg = validate_result.get("error", "Could not access URL")
        raise ValueError(error_msg)

    # Capture file_size_bytes from validation result
    file_size_bytes = validate_result.get("file_size_bytes")

    # Step 5: Schema extraction
    schema_result = await worker_pool.get_schema(url)
    if "error" in schema_result:
        raise ValueError(schema_result["error"])

    # Step 6: Persist
    columns = schema_result.get("columns", [])
    row_count = schema_result.get("row_count", 0)
    column_count = len(columns)
    schema_json = json.dumps(columns)
    if not name:
        name = await _next_table_name(db, conversation_id)

    dataset_id = str(uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "INSERT INTO datasets "
        "(id, conversation_id, url, name, row_count, column_count, schema_json, status, error_message, loaded_at, file_size_bytes) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (dataset_id, conversation_id, url, name, row_count, column_count, schema_json, "ready", None, now, file_size_bytes),
    )
    await db.commit()

    return {
        "id": dataset_id,
        "conversation_id": conversation_id,
        "url": url,
        "name": name,
        "row_count": row_count,
        "column_count": column_count,
        "schema_json": schema_json,
        "status": "ready",
        "error_message": None,
        "loaded_at": now,
        "file_size_bytes": file_size_bytes,
    }


# ---------------------------------------------------------------------------
# remove_dataset
# Implements: spec/backend/dataset_handling/plan.md#dataset-removal
# ---------------------------------------------------------------------------


async def remove_dataset(db: aiosqlite.Connection, dataset_id: str) -> None:
    """Delete a dataset row from the datasets table. No-op if not found."""
    await db.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
    await db.commit()


# ---------------------------------------------------------------------------
# refresh_schema
# Implements: spec/backend/dataset_handling/plan.md#schema-refresh
# ---------------------------------------------------------------------------


async def refresh_schema(
    db: aiosqlite.Connection,
    dataset_id: str,
    worker_pool: object,
) -> dict:
    """Re-run steps 4-5 of the validation pipeline and update the existing row.

    Returns the updated dataset dict.
    Raises ``ValueError`` if worker validation or schema extraction fails.
    On failure, the existing row is NOT modified.
    """
    # Look up the existing dataset to get its URL
    cursor = await db.execute(
        "SELECT url FROM datasets WHERE id = ?", (dataset_id,)
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError("Dataset not found")

    url = row["url"]

    # Step 4: HEAD + magic bytes
    validate_result = await worker_pool.validate_url(url)
    if not validate_result.get("valid"):
        error_msg = validate_result.get("error", "Could not access URL")
        raise ValueError(error_msg)

    # Step 5: Schema extraction
    schema_result = await worker_pool.get_schema(url)
    if "error" in schema_result:
        raise ValueError(schema_result["error"])

    # Update the row
    columns = schema_result.get("columns", [])
    row_count = schema_result.get("row_count", 0)
    column_count = len(columns)
    schema_json = json.dumps(columns)
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    await db.execute(
        "UPDATE datasets SET schema_json = ?, row_count = ?, column_count = ?, loaded_at = ? WHERE id = ?",
        (schema_json, row_count, column_count, now, dataset_id),
    )
    await db.commit()

    # Return the updated dataset
    cursor = await db.execute(
        "SELECT id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, error_message, loaded_at, file_size_bytes FROM datasets WHERE id = ?",
        (dataset_id,),
    )
    updated_row = await cursor.fetchone()
    return dict(updated_row)


# ---------------------------------------------------------------------------
# get_datasets
# Implements: spec/backend/dataset_handling/plan.md#database-operations
# ---------------------------------------------------------------------------


async def get_datasets(
    db: aiosqlite.Connection, conversation_id: str
) -> list[dict]:
    """Return all datasets for *conversation_id*, ordered by loaded_at."""
    cursor = await db.execute(
        "SELECT id, conversation_id, url, name, row_count, column_count, "
        "schema_json, status, error_message, loaded_at, file_size_bytes, "
        "column_descriptions "
        "FROM datasets WHERE conversation_id = ? ORDER BY loaded_at",
        (conversation_id,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
