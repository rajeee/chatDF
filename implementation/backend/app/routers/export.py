"""Export router -- file format conversion endpoints."""

from __future__ import annotations

import csv
import io
from typing import Any

import polars as pl
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user
from app.models import ExportCsvRequest, ExportXlsxRequest

router = APIRouter()


@router.post("/xlsx")
async def export_xlsx(
    body: ExportXlsxRequest,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Convert query results to an Excel (.xlsx) file and return it for download."""
    # Build a Polars DataFrame from the columns and rows
    data = {}
    for i, col in enumerate(body.columns):
        data[col] = [row[i] if i < len(row) else None for row in body.rows]

    df = pl.DataFrame(data)

    # Write to in-memory buffer
    buffer = io.BytesIO()
    df.write_excel(buffer)
    buffer.seek(0)

    safe_filename = (
        "".join(c for c in body.filename if c.isalnum() or c in "-_ ").strip()
        or "export"
    )

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}.xlsx"',
        },
    )


@router.post("/csv")
async def export_csv(
    body: ExportCsvRequest,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Convert query results to a CSV file and return it for download."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    # Write header row
    writer.writerow(body.columns)

    # Write data rows
    for row in body.rows:
        writer.writerow(row)

    safe_filename = (
        "".join(c for c in body.filename if c.isalnum() or c in "-_ ").strip()
        or "export"
    )

    # Convert to bytes for StreamingResponse
    csv_bytes = io.BytesIO(buffer.getvalue().encode("utf-8"))

    return StreamingResponse(
        csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}.csv"',
        },
    )
