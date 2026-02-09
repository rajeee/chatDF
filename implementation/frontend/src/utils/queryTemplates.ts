// Generates ready-to-run SQL query templates based on loaded dataset schemas.
// Used by RunSqlPanel to provide instant starter queries for data exploration.

export interface QueryTemplate {
  label: string;
  description: string;
  sql: string;
  category: "basic" | "aggregation" | "exploration" | "join";
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

  // Cross-table JOIN templates when 2+ datasets are loaded
  if (datasets.length >= 2) {
    for (let i = 0; i < datasets.length; i++) {
      for (let j = i + 1; j < datasets.length; j++) {
        const a = datasets[i];
        const b = datasets[j];

        // Find potential join columns between the two tables
        const joinPairs = findJoinColumns(a, b);

        if (joinPairs.length > 0) {
          const pair = joinPairs[0]; // Use the best match

          // INNER JOIN template
          templates.push({
            label: `Join ${a.tableName} + ${b.tableName}`,
            description: `Inner join on ${pair.colA} = ${pair.colB}`,
            sql: `SELECT\n  a.*,\n  b.*\nFROM "${a.tableName}" a\nINNER JOIN "${b.tableName}" b\n  ON a."${pair.colA}" = b."${pair.colB}"\nLIMIT 50`,
            category: "join",
          });

          // LEFT JOIN template
          templates.push({
            label: `Left join ${a.tableName} -> ${b.tableName}`,
            description: `All rows from ${a.tableName}, matched with ${b.tableName}`,
            sql: `SELECT\n  a.*,\n  b.*\nFROM "${a.tableName}" a\nLEFT JOIN "${b.tableName}" b\n  ON a."${pair.colA}" = b."${pair.colB}"\nLIMIT 50`,
            category: "join",
          });
        }

        // UNION ALL template when schemas are similar
        if (hasSimilarSchema(a, b)) {
          const overlapping = getOverlappingColumns(a, b);
          const cols = overlapping.map((c) => `"${c}"`).join(", ");
          templates.push({
            label: `Union ${a.tableName} + ${b.tableName}`,
            description: `Stack rows from both tables (${overlapping.length} shared columns)`,
            sql: `SELECT ${cols}, '${a.tableName}' AS source_table\nFROM "${a.tableName}"\nUNION ALL\nSELECT ${cols}, '${b.tableName}' AS source_table\nFROM "${b.tableName}"\nLIMIT 100`,
            category: "join",
          });
        }

        // Cross-reference count (always generated for every pair)
        templates.push({
          label: `Compare counts: ${a.tableName} vs ${b.tableName}`,
          description: `Side-by-side row counts`,
          sql: `SELECT\n  (SELECT COUNT(*) FROM "${a.tableName}") AS "${a.tableName}_rows",\n  (SELECT COUNT(*) FROM "${b.tableName}") AS "${b.tableName}_rows"`,
          category: "join",
        });
      }
    }
  }

  return templates;
}

/** Check if a column type is numeric. */
function isNumericType(type: string): boolean {
  return /int|float|decimal|numeric|double|bigint|smallint/i.test(type);
}

/** Check if a column type is string/text. */
function isStringType(type: string): boolean {
  return /str|string|utf8|varchar|text|categorical/i.test(type);
}

/** Check if two column types are compatible for joining. */
function areTypesCompatible(typeA: string, typeB: string): boolean {
  if (isNumericType(typeA) && isNumericType(typeB)) return true;
  if (isStringType(typeA) && isStringType(typeB)) return true;
  // If both types are the same (exact match), allow it
  if (typeA.toLowerCase() === typeB.toLowerCase()) return true;
  return false;
}

interface JoinPair {
  colA: string;
  colB: string;
}

/** Find potential join columns between two datasets. */
export function findJoinColumns(a: DatasetSchema, b: DatasetSchema): JoinPair[] {
  const pairs: JoinPair[] = [];
  const seen = new Set<string>();

  for (const colA of a.columns) {
    for (const colB of b.columns) {
      if (!areTypesCompatible(colA.type, colB.type)) continue;

      const key = `${colA.name}::${colB.name}`;
      if (seen.has(key)) continue;

      // Exact name match
      if (colA.name.toLowerCase() === colB.name.toLowerCase()) {
        seen.add(key);
        pairs.push({ colA: colA.name, colB: colB.name });
        continue;
      }

      // Common join patterns: _id, _key, _code suffixes matching across tables
      const suffixes = ["_id", "_key", "_code"];
      const aLower = colA.name.toLowerCase();
      const bLower = colB.name.toLowerCase();
      const matchesSuffix = suffixes.some(
        (s) => aLower.endsWith(s) && bLower.endsWith(s) && aLower === bLower
      );
      if (matchesSuffix) {
        seen.add(key);
        pairs.push({ colA: colA.name, colB: colB.name });
      }
    }
  }

  return pairs;
}

/** Get column names that appear in both datasets. */
export function getOverlappingColumns(a: DatasetSchema, b: DatasetSchema): string[] {
  const bNames = new Set(b.columns.map((c) => c.name.toLowerCase()));
  return a.columns
    .filter((c) => bNames.has(c.name.toLowerCase()))
    .map((c) => c.name);
}

/** Check if two datasets have similar schemas (for UNION ALL). */
export function hasSimilarSchema(a: DatasetSchema, b: DatasetSchema): boolean {
  const overlapping = getOverlappingColumns(a, b);
  // Similar if at least 2 overlapping columns, or same column count with any overlap
  if (overlapping.length >= 2) return true;
  if (a.columns.length === b.columns.length && overlapping.length >= 1) return true;
  return false;
}
