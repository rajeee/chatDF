import { describe, it, expect } from "vitest";
import {
  generateQueryTemplates,
  findJoinColumns,
  getOverlappingColumns,
  hasSimilarSchema,
  type DatasetSchema,
  type QueryTemplate,
} from "@/utils/queryTemplates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinTemplates(templates: QueryTemplate[]): QueryTemplate[] {
  return templates.filter((t) => t.category === "join");
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ordersDataset: DatasetSchema = {
  tableName: "orders",
  columns: [
    { name: "order_id", type: "Int64" },
    { name: "customer_id", type: "Int64" },
    { name: "amount", type: "Float64" },
    { name: "order_date", type: "Date" },
  ],
};

const customersDataset: DatasetSchema = {
  tableName: "customers",
  columns: [
    { name: "customer_id", type: "Int64" },
    { name: "name", type: "Utf8" },
    { name: "country_code", type: "Utf8" },
  ],
};

const productsDataset: DatasetSchema = {
  tableName: "products",
  columns: [
    { name: "product_id", type: "Int64" },
    { name: "title", type: "Utf8" },
    { name: "price", type: "Float64" },
  ],
};

// Dataset with no matching columns to others
const weatherDataset: DatasetSchema = {
  tableName: "weather",
  columns: [
    { name: "city", type: "Utf8" },
    { name: "temp_celsius", type: "Float64" },
    { name: "humidity", type: "Float64" },
  ],
};

// Dataset with similar schema to weatherDataset (for UNION ALL)
const weatherArchiveDataset: DatasetSchema = {
  tableName: "weather_archive",
  columns: [
    { name: "city", type: "Utf8" },
    { name: "temp_celsius", type: "Float64" },
    { name: "humidity", type: "Float64" },
    { name: "recorded_at", type: "Datetime" },
  ],
};

// ---------------------------------------------------------------------------
// Tests: single dataset - no join templates
// ---------------------------------------------------------------------------

describe("generateQueryTemplates - single dataset", () => {
  it("generates no join templates for a single dataset", () => {
    const templates = generateQueryTemplates([ordersDataset]);
    const joins = joinTemplates(templates);
    expect(joins).toHaveLength(0);
  });

  it("still generates basic/aggregation/exploration templates for one dataset", () => {
    const templates = generateQueryTemplates([ordersDataset]);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.category === "basic")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: two datasets with matching column names -> JOIN templates
// ---------------------------------------------------------------------------

describe("generateQueryTemplates - matching columns generate JOINs", () => {
  it("generates INNER JOIN template when tables share a column name", () => {
    const templates = generateQueryTemplates([ordersDataset, customersDataset]);
    const joins = joinTemplates(templates);
    const innerJoin = joins.find((t) => t.sql.includes("INNER JOIN"));
    expect(innerJoin).toBeDefined();
    expect(innerJoin!.sql).toContain('"customer_id"');
    expect(innerJoin!.sql).toContain('"orders"');
    expect(innerJoin!.sql).toContain('"customers"');
    expect(innerJoin!.category).toBe("join");
  });

  it("generates LEFT JOIN template when tables share a column name", () => {
    const templates = generateQueryTemplates([ordersDataset, customersDataset]);
    const joins = joinTemplates(templates);
    const leftJoin = joins.find((t) => t.sql.includes("LEFT JOIN"));
    expect(leftJoin).toBeDefined();
    expect(leftJoin!.sql).toContain('"customer_id"');
    expect(leftJoin!.label).toContain("Left join");
  });

  it("uses table aliases a and b in JOIN SQL", () => {
    const templates = generateQueryTemplates([ordersDataset, customersDataset]);
    const joins = joinTemplates(templates);
    const innerJoin = joins.find((t) => t.sql.includes("INNER JOIN"));
    expect(innerJoin!.sql).toContain("a.*");
    expect(innerJoin!.sql).toContain("b.*");
    expect(innerJoin!.sql).toMatch(/ON a\."customer_id" = b\."customer_id"/);
  });
});

// ---------------------------------------------------------------------------
// Tests: two datasets with no matching columns -> no JOIN but cross-reference
// ---------------------------------------------------------------------------

describe("generateQueryTemplates - no matching columns", () => {
  it("does not generate JOIN templates when no column names match", () => {
    const templates = generateQueryTemplates([productsDataset, weatherDataset]);
    const joins = joinTemplates(templates);
    const joinQuery = joins.find(
      (t) => t.sql.includes("INNER JOIN") || t.sql.includes("LEFT JOIN")
    );
    expect(joinQuery).toBeUndefined();
  });

  it("generates cross-reference count even with no matching columns", () => {
    const templates = generateQueryTemplates([productsDataset, weatherDataset]);
    const joins = joinTemplates(templates);
    const crossRef = joins.find((t) => t.label.includes("Compare counts"));
    expect(crossRef).toBeDefined();
    expect(crossRef!.sql).toContain("COUNT(*)");
    expect(crossRef!.sql).toContain('"products"');
    expect(crossRef!.sql).toContain('"weather"');
  });
});

// ---------------------------------------------------------------------------
// Tests: UNION ALL when schemas are similar
// ---------------------------------------------------------------------------

describe("generateQueryTemplates - UNION ALL for similar schemas", () => {
  it("generates UNION ALL template when datasets have overlapping columns", () => {
    const templates = generateQueryTemplates([
      weatherDataset,
      weatherArchiveDataset,
    ]);
    const joins = joinTemplates(templates);
    const union = joins.find((t) => t.sql.includes("UNION ALL"));
    expect(union).toBeDefined();
    expect(union!.sql).toContain('"city"');
    expect(union!.sql).toContain('"temp_celsius"');
    expect(union!.sql).toContain('"humidity"');
    expect(union!.sql).toContain("source_table");
  });

  it("does not generate UNION ALL when schemas are dissimilar", () => {
    const templates = generateQueryTemplates([productsDataset, weatherDataset]);
    const joins = joinTemplates(templates);
    const union = joins.find((t) => t.sql.includes("UNION ALL"));
    expect(union).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: category labels
// ---------------------------------------------------------------------------

describe("join category", () => {
  it("all join templates have category 'join'", () => {
    const templates = generateQueryTemplates([ordersDataset, customersDataset]);
    const joins = joinTemplates(templates);
    expect(joins.length).toBeGreaterThan(0);
    for (const t of joins) {
      expect(t.category).toBe("join");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: findJoinColumns helper
// ---------------------------------------------------------------------------

describe("findJoinColumns", () => {
  it("finds exact name matches with compatible types", () => {
    const pairs = findJoinColumns(ordersDataset, customersDataset);
    expect(pairs).toContainEqual({ colA: "customer_id", colB: "customer_id" });
  });

  it("does not match columns with incompatible types", () => {
    const a: DatasetSchema = {
      tableName: "t1",
      columns: [{ name: "code", type: "Int64" }],
    };
    const b: DatasetSchema = {
      tableName: "t2",
      columns: [{ name: "code", type: "Utf8" }],
    };
    const pairs = findJoinColumns(a, b);
    expect(pairs).toHaveLength(0);
  });

  it("returns empty when no columns match", () => {
    const pairs = findJoinColumns(productsDataset, weatherDataset);
    expect(pairs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: getOverlappingColumns helper
// ---------------------------------------------------------------------------

describe("getOverlappingColumns", () => {
  it("finds shared column names (case-insensitive)", () => {
    const overlapping = getOverlappingColumns(
      weatherDataset,
      weatherArchiveDataset
    );
    expect(overlapping).toContain("city");
    expect(overlapping).toContain("temp_celsius");
    expect(overlapping).toContain("humidity");
  });

  it("returns empty for disjoint schemas", () => {
    const overlapping = getOverlappingColumns(productsDataset, weatherDataset);
    expect(overlapping).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: hasSimilarSchema helper
// ---------------------------------------------------------------------------

describe("hasSimilarSchema", () => {
  it("returns true when 2+ overlapping columns exist", () => {
    expect(hasSimilarSchema(weatherDataset, weatherArchiveDataset)).toBe(true);
  });

  it("returns false when fewer than 2 overlapping and different column counts", () => {
    expect(hasSimilarSchema(productsDataset, weatherDataset)).toBe(false);
  });

  it("returns true when same column count with at least 1 overlap", () => {
    const a: DatasetSchema = {
      tableName: "t1",
      columns: [
        { name: "id", type: "Int64" },
        { name: "foo", type: "Utf8" },
      ],
    };
    const b: DatasetSchema = {
      tableName: "t2",
      columns: [
        { name: "id", type: "Int64" },
        { name: "bar", type: "Utf8" },
      ],
    };
    expect(hasSimilarSchema(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: three datasets generate pairwise templates
// ---------------------------------------------------------------------------

describe("generateQueryTemplates - three datasets", () => {
  it("generates join templates for all pairs", () => {
    const templates = generateQueryTemplates([
      ordersDataset,
      customersDataset,
      productsDataset,
    ]);
    const joins = joinTemplates(templates);

    // Should have cross-reference counts for all 3 pairs
    const crossRefs = joins.filter((t) => t.label.includes("Compare counts"));
    expect(crossRefs).toHaveLength(3);

    // orders+customers should have JOINs (shared customer_id)
    const ordersCustomersJoin = joins.find(
      (t) => t.sql.includes("INNER JOIN") && t.sql.includes('"customers"')
    );
    expect(ordersCustomersJoin).toBeDefined();
  });
});
