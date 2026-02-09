import { describe, it, expect } from "vitest";
import {
  generateQueryTemplates,
  type DatasetSchema,
} from "../queryTemplates";

describe("generateQueryTemplates", () => {
  it("returns empty array for empty datasets", () => {
    expect(generateQueryTemplates([])).toEqual([]);
  });

  it("generates basic templates (preview and count) for any dataset", () => {
    const datasets: DatasetSchema[] = [
      { tableName: "users", columns: [] },
    ];

    const templates = generateQueryTemplates(datasets);

    // Should have preview and count (and null check since columns.length === 0, no null check)
    const preview = templates.find((t) => t.label === "Preview users");
    expect(preview).toBeDefined();
    expect(preview!.sql).toContain('SELECT * FROM "users" LIMIT 10');
    expect(preview!.category).toBe("basic");

    const count = templates.find((t) => t.label === "Count users");
    expect(count).toBeDefined();
    expect(count!.sql).toContain('COUNT(*) AS total_rows FROM "users"');
    expect(count!.category).toBe("basic");
  });

  it("generates numeric aggregation templates for numeric columns", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "sales",
        columns: [
          { name: "id", type: "Int64" },
          { name: "amount", type: "Float64" },
          { name: "category", type: "Utf8" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    // Should have a stats template for the first numeric column (id)
    const stats = templates.find((t) => t.label === "Stats: id");
    expect(stats).toBeDefined();
    expect(stats!.sql).toContain('MIN("id")');
    expect(stats!.sql).toContain('MAX("id")');
    expect(stats!.sql).toContain('AVG("id")');
    expect(stats!.category).toBe("aggregation");

    // Should have a group-by template since there's a string column
    const groupBy = templates.find((t) => t.label === "id by category");
    expect(groupBy).toBeDefined();
    expect(groupBy!.sql).toContain('GROUP BY "category"');
    expect(groupBy!.category).toBe("aggregation");
  });

  it("generates string exploration templates for string columns", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "products",
        columns: [
          { name: "name", type: "Utf8" },
          { name: "price", type: "Float64" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const unique = templates.find((t) => t.label === "Unique name");
    expect(unique).toBeDefined();
    expect(unique!.sql).toContain('SELECT DISTINCT "name"');
    expect(unique!.category).toBe("exploration");

    const top = templates.find((t) => t.label === "Top name");
    expect(top).toBeDefined();
    expect(top!.sql).toContain('GROUP BY "name"');
    expect(top!.sql).toContain("ORDER BY frequency DESC");
    expect(top!.category).toBe("exploration");
  });

  it("generates date range template for date columns", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "events",
        columns: [
          { name: "event_date", type: "Date" },
          { name: "description", type: "Utf8" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const dateRange = templates.find(
      (t) => t.label === "Date range: event_date"
    );
    expect(dateRange).toBeDefined();
    expect(dateRange!.sql).toContain('MIN("event_date") AS earliest');
    expect(dateRange!.sql).toContain('MAX("event_date") AS latest');
    expect(dateRange!.category).toBe("exploration");
  });

  it("generates null check template when columns exist", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "orders",
        columns: [
          { name: "id", type: "Int64" },
          { name: "status", type: "Utf8" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const nullCheck = templates.find((t) => t.label === "Null check: orders");
    expect(nullCheck).toBeDefined();
    expect(nullCheck!.sql).toContain("COUNT(*) AS total_rows");
    expect(nullCheck!.sql).toContain('"id" IS NULL');
    expect(nullCheck!.sql).toContain('"status" IS NULL');
    expect(nullCheck!.category).toBe("exploration");
  });

  it("limits null check to first 5 columns", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "wide_table",
        columns: [
          { name: "col1", type: "Int64" },
          { name: "col2", type: "Int64" },
          { name: "col3", type: "Int64" },
          { name: "col4", type: "Int64" },
          { name: "col5", type: "Int64" },
          { name: "col6", type: "Int64" },
          { name: "col7", type: "Int64" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const nullCheck = templates.find(
      (t) => t.label === "Null check: wide_table"
    );
    expect(nullCheck).toBeDefined();
    // Should contain col1-col5 but NOT col6/col7
    expect(nullCheck!.sql).toContain('"col5"');
    expect(nullCheck!.sql).not.toContain('"col6"');
    expect(nullCheck!.sql).not.toContain('"col7"');
  });

  it("generates templates for multiple datasets", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "users",
        columns: [{ name: "id", type: "Int64" }],
      },
      {
        tableName: "orders",
        columns: [{ name: "amount", type: "Float64" }],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    // Should have templates for both tables
    const userPreview = templates.find((t) => t.label === "Preview users");
    const orderPreview = templates.find((t) => t.label === "Preview orders");
    expect(userPreview).toBeDefined();
    expect(orderPreview).toBeDefined();

    const userCount = templates.find((t) => t.label === "Count users");
    const orderCount = templates.find((t) => t.label === "Count orders");
    expect(userCount).toBeDefined();
    expect(orderCount).toBeDefined();
  });

  it("does not generate numeric templates when no numeric columns exist", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "logs",
        columns: [
          { name: "message", type: "Utf8" },
          { name: "level", type: "Utf8" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const statsTemplates = templates.filter(
      (t) => t.category === "aggregation"
    );
    expect(statsTemplates).toHaveLength(0);
  });

  it("does not generate string exploration templates when no string columns exist", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "measurements",
        columns: [
          { name: "value", type: "Float64" },
          { name: "count", type: "Int64" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const uniqueTemplates = templates.filter(
      (t) => t.label.startsWith("Unique ") || t.label.startsWith("Top ")
    );
    expect(uniqueTemplates).toHaveLength(0);
  });

  it("does not generate date range template when no date columns exist", () => {
    const datasets: DatasetSchema[] = [
      {
        tableName: "items",
        columns: [
          { name: "name", type: "Utf8" },
          { name: "price", type: "Float64" },
        ],
      },
    ];

    const templates = generateQueryTemplates(datasets);

    const dateTemplates = templates.filter((t) =>
      t.label.startsWith("Date range:")
    );
    expect(dateTemplates).toHaveLength(0);
  });

  it("recognizes various numeric type names", () => {
    const numericTypes = [
      "Int32",
      "Int64",
      "Float32",
      "Float64",
      "Decimal",
      "BIGINT",
      "smallint",
      "DOUBLE",
    ];

    for (const numType of numericTypes) {
      const templates = generateQueryTemplates([
        {
          tableName: "t",
          columns: [{ name: "val", type: numType }],
        },
      ]);

      const stats = templates.find((t) => t.label === "Stats: val");
      expect(stats).toBeDefined();
    }
  });

  it("recognizes various string type names", () => {
    const stringTypes = ["Utf8", "String", "VARCHAR", "text", "Categorical"];

    for (const strType of stringTypes) {
      const templates = generateQueryTemplates([
        {
          tableName: "t",
          columns: [{ name: "val", type: strType }],
        },
      ]);

      const unique = templates.find((t) => t.label === "Unique val");
      expect(unique).toBeDefined();
    }
  });

  it("recognizes various date/time type names", () => {
    const dateTypes = ["Date", "Datetime", "Timestamp", "Time"];

    for (const dateType of dateTypes) {
      const templates = generateQueryTemplates([
        {
          tableName: "t",
          columns: [{ name: "val", type: dateType }],
        },
      ]);

      const dateRange = templates.find(
        (t) => t.label === "Date range: val"
      );
      expect(dateRange).toBeDefined();
    }
  });
});
