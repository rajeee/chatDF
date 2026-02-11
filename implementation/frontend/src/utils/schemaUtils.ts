// Shared schema utilities
//
// Canonical mapType(), parseColumns(), Column, computeSchemaDiff() and
// related types used by SchemaDiffModal, ComparisonModal, and SchemaModal.

/** Map parquet type strings to user-friendly display labels. */
export function mapType(rawType: string): string {
  switch (rawType) {
    case "String":
    case "Utf8":
      return "Text";
    case "Int32":
    case "Int64":
      return "Integer";
    case "Float32":
    case "Float64":
      return "Decimal";
    case "Date":
    case "DateTime":
      return "Date";
    case "Boolean":
      return "Boolean";
    default:
      return rawType;
  }
}

export interface Column {
  name: string;
  type: string;
}

export function parseColumns(schemaJson: string): Column[] {
  try {
    const parsed = JSON.parse(schemaJson);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // Handle wrapped format: {"columns": [...]}
    if (parsed && Array.isArray(parsed.columns)) {
      return parsed.columns;
    }
    return [];
  } catch {
    return [];
  }
}

export type DiffStatus = "matched" | "type-mismatch" | "left-only" | "right-only";

export interface DiffRow {
  name: string;
  leftType: string | null;
  rightType: string | null;
  status: DiffStatus;
}

/** Compute a unified diff view of two column lists. */
export function computeSchemaDiff(
  leftColumns: Column[],
  rightColumns: Column[]
): DiffRow[] {
  const rightMap = new Map<string, string>();
  for (const col of rightColumns) {
    rightMap.set(col.name, col.type);
  }

  const leftNames = new Set<string>();
  const rows: DiffRow[] = [];

  // Process left columns in order
  for (const col of leftColumns) {
    leftNames.add(col.name);
    const rightType = rightMap.get(col.name);
    if (rightType === undefined) {
      rows.push({ name: col.name, leftType: col.type, rightType: null, status: "left-only" });
    } else if (col.type !== rightType) {
      rows.push({ name: col.name, leftType: col.type, rightType, status: "type-mismatch" });
    } else {
      rows.push({ name: col.name, leftType: col.type, rightType, status: "matched" });
    }
  }

  // Process right-only columns
  for (const col of rightColumns) {
    if (!leftNames.has(col.name)) {
      rows.push({ name: col.name, leftType: null, rightType: col.type, status: "right-only" });
    }
  }

  return rows;
}
