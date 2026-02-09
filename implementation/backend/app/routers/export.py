"""Export router -- file format conversion endpoints."""

from __future__ import annotations

import io
from typing import Any

import polars as pl
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user
from app.models import ExportXlsxRequest

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
