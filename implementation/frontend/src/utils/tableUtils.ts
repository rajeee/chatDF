/**
 * Extracts cell value from row data (array or object) at given column index.
 * Returns raw value (can be any type).
 */
export function cellValueRaw(row: unknown, colIdx: number, columns: string[]): unknown {
  if (Array.isArray(row)) return row[colIdx];
  if (row && typeof row === "object") return (row as Record<string, unknown>)[columns[colIdx]];
  return null;
}

/**
 * Extracts cell value as string for display.
 * Converts null/undefined to "null" string.
 */
export function cellValue(row: unknown, colIdx: number, columns: string[]): string {
  const v = cellValueRaw(row, colIdx, columns);
  return v != null ? String(v) : "null";
}
