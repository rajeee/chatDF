import { useState, useCallback, useMemo } from "react";

export interface SortKey {
  colIdx: number;
  dir: "asc" | "desc";
}

/**
 * Null-safe, numeric-aware comparator for sorting table columns.
 */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Extracts cell value from row data (array or object).
 */
function cellValueRaw(row: unknown, colIdx: number, columns: string[]): unknown {
  if (Array.isArray(row)) return row[colIdx];
  if (row && typeof row === "object") return (row as Record<string, unknown>)[columns[colIdx]];
  return null;
}

/**
 * Hook for multi-key column sorting on table rows.
 * Supports primary/secondary sort keys with ascending/descending direction.
 */
export function useSortedRows(rows: unknown[], columns: string[]) {
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);

  const toggleSort = useCallback((colIdx: number) => {
    setSortKeys((prev) => {
      const existingIdx = prev.findIndex((k) => k.colIdx === colIdx);
      if (existingIdx === 0) {
        // Already first key — toggle direction
        const toggled = { ...prev[0], dir: prev[0].dir === "asc" ? "desc" as const : "asc" as const };
        return [toggled, ...prev.slice(1)];
      }
      if (existingIdx > 0) {
        // Elsewhere in keys — move to front
        const key = prev[existingIdx];
        return [key, ...prev.slice(0, existingIdx), ...prev.slice(existingIdx + 1)];
      }
      // New key — add to front as asc
      return [{ colIdx, dir: "asc" as const }, ...prev];
    });
  }, []);

  const clearSort = useCallback(() => setSortKeys([]), []);

  const sortedRows = useMemo(() => {
    if (sortKeys.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const key of sortKeys) {
        const cmp = compareValues(
          cellValueRaw(a, key.colIdx, columns),
          cellValueRaw(b, key.colIdx, columns),
        );
        if (cmp !== 0) return key.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [rows, columns, sortKeys]);

  return { sortKeys, sortedRows, toggleSort, clearSort };
}
