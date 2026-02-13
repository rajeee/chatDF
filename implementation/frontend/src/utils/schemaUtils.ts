// Shared schema utilities
//
// Canonical mapType(), parseColumns(), and Column type
// used by ComparisonModal and SchemaModal.

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
