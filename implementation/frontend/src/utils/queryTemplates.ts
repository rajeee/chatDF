// Generates ready-to-run SQL query templates based on loaded dataset schemas.
// Used by RunSqlPanel to provide instant starter queries for data exploration.

export interface QueryTemplate {
  label: string;
  description: string;
  sql: string;
  category: "basic" | "aggregation" | "exploration";
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface DatasetSchema {
  tableName: string;
  columns: ColumnInfo[];
}

export function generateQueryTemplates(
  datasets: DatasetSchema[]
): QueryTemplate[] {
  const templates: QueryTemplate[] = [];

  for (const dataset of datasets) {
    const { tableName, columns } = dataset;
    const t = tableName;

    // Basic queries
    templates.push({
      label: `Preview ${t}`,
      description: `First 10 rows from ${t}`,
      sql: `SELECT * FROM "${t}" LIMIT 10`,
      category: "basic",
    });

    templates.push({
      label: `Count ${t}`,
      description: `Total row count for ${t}`,
      sql: `SELECT COUNT(*) AS total_rows FROM "${t}"`,
      category: "basic",
    });

    // Find numeric columns
    const numericCols = columns.filter((c) =>
      /int|float|decimal|numeric|double|bigint|smallint/i.test(c.type)
    );

    // Find string/categorical columns
    const stringCols = columns.filter((c) =>
      /str|string|utf8|varchar|text|categorical/i.test(c.type)
    );

    // Find date/time columns
    const dateCols = columns.filter((c) =>
      /date|time|timestamp|datetime/i.test(c.type)
    );

    // Numeric aggregation
    if (numericCols.length > 0) {
      const col = numericCols[0];
      templates.push({
        label: `Stats: ${col.name}`,
        description: `Min, max, avg of ${col.name}`,
        sql: `SELECT\n  MIN("${col.name}") AS min_val,\n  MAX("${col.name}") AS max_val,\n  AVG("${col.name}") AS avg_val,\n  COUNT("${col.name}") AS count\nFROM "${t}"`,
        category: "aggregation",
      });

      // If there's a string column, do a group-by
      if (stringCols.length > 0) {
        const groupCol = stringCols[0];
        templates.push({
          label: `${col.name} by ${groupCol.name}`,
          description: `Average ${col.name} grouped by ${groupCol.name}`,
          sql: `SELECT\n  "${groupCol.name}",\n  AVG("${col.name}") AS avg_${col.name.toLowerCase()},\n  COUNT(*) AS count\nFROM "${t}"\nGROUP BY "${groupCol.name}"\nORDER BY count DESC\nLIMIT 20`,
          category: "aggregation",
        });
      }
    }

    // String exploration
    if (stringCols.length > 0) {
      const col = stringCols[0];
      templates.push({
        label: `Unique ${col.name}`,
        description: `Distinct values in ${col.name}`,
        sql: `SELECT DISTINCT "${col.name}"\nFROM "${t}"\nORDER BY "${col.name}"\nLIMIT 50`,
        category: "exploration",
      });

      templates.push({
        label: `Top ${col.name}`,
        description: `Most common values in ${col.name}`,
        sql: `SELECT\n  "${col.name}",\n  COUNT(*) AS frequency\nFROM "${t}"\nGROUP BY "${col.name}"\nORDER BY frequency DESC\nLIMIT 20`,
        category: "exploration",
      });
    }

    // Date range
    if (dateCols.length > 0) {
      const col = dateCols[0];
      templates.push({
        label: `Date range: ${col.name}`,
        description: `Earliest and latest ${col.name}`,
        sql: `SELECT\n  MIN("${col.name}") AS earliest,\n  MAX("${col.name}") AS latest\nFROM "${t}"`,
        category: "exploration",
      });
    }

    // Null analysis (always useful)
    if (columns.length > 0) {
      const nullCheckCols = columns.slice(0, 5); // First 5 columns
      const nullExprs = nullCheckCols
        .map(
          (c) =>
            `SUM(CASE WHEN "${c.name}" IS NULL THEN 1 ELSE 0 END) AS "${c.name}_nulls"`
        )
        .join(",\n  ");
      templates.push({
        label: `Null check: ${t}`,
        description: `Count nulls in first 5 columns`,
        sql: `SELECT\n  COUNT(*) AS total_rows,\n  ${nullExprs}\nFROM "${t}"`,
        category: "exploration",
      });
    }
  }

  return templates;
}
