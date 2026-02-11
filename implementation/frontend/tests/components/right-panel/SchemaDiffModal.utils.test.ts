import { describe, it, expect } from "vitest";
import {
  parseColumns,
  computeSchemaDiff,
  mapType,
} from "@/utils/schemaUtils";

// ---------------------------------------------------------------------------
// parseColumns
// ---------------------------------------------------------------------------
describe("parseColumns", () => {
  it("parses standard schema JSON (array of {name, type}) into column objects", () => {
    const json = JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
    ]);
    const cols = parseColumns(json);
    expect(cols).toEqual([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
    ]);
  });

  it("parses schema JSON with a wrapping { columns: [...] } object", () => {
    const json = JSON.stringify({
      columns: [
        { name: "price", type: "Float64" },
        { name: "active", type: "Boolean" },
      ],
    });
    const cols = parseColumns(json);
    expect(cols).toEqual([
      { name: "price", type: "Float64" },
      { name: "active", type: "Boolean" },
    ]);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseColumns("[]")).toEqual([]);
  });

  it("returns empty array for empty JSON object", () => {
    expect(parseColumns("{}")).toEqual([]);
  });

  it("returns empty array for { columns: [] }", () => {
    expect(parseColumns(JSON.stringify({ columns: [] }))).toEqual([]);
  });

  it("returns empty array for malformed JSON (not parseable)", () => {
    expect(parseColumns("not-json")).toEqual([]);
    expect(parseColumns("{bad")).toEqual([]);
    expect(parseColumns("")).toEqual([]);
  });

  it("returns empty array for valid JSON that is not an array or object with columns", () => {
    // A plain string
    expect(parseColumns('"hello"')).toEqual([]);
    // A number
    expect(parseColumns("42")).toEqual([]);
    // An object without a columns key
    expect(parseColumns('{"foo":"bar"}')).toEqual([]);
    // null
    expect(parseColumns("null")).toEqual([]);
  });

  it("handles columns with various types", () => {
    const json = JSON.stringify([
      { name: "col_str", type: "String" },
      { name: "col_utf8", type: "Utf8" },
      { name: "col_i32", type: "Int32" },
      { name: "col_i64", type: "Int64" },
      { name: "col_f32", type: "Float32" },
      { name: "col_f64", type: "Float64" },
      { name: "col_date", type: "Date" },
      { name: "col_datetime", type: "DateTime" },
      { name: "col_bool", type: "Boolean" },
      { name: "col_custom", type: "Categorical" },
    ]);
    const cols = parseColumns(json);
    expect(cols).toHaveLength(10);
    expect(cols[0]).toEqual({ name: "col_str", type: "String" });
    expect(cols[9]).toEqual({ name: "col_custom", type: "Categorical" });
  });

  it("preserves extra properties on column objects without error", () => {
    const json = JSON.stringify([
      { name: "id", type: "Int64", nullable: true, extra: "stuff" },
    ]);
    const cols = parseColumns(json);
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe("id");
    expect(cols[0].type).toBe("Int64");
  });
});

// ---------------------------------------------------------------------------
// computeSchemaDiff
// ---------------------------------------------------------------------------
describe("computeSchemaDiff", () => {
  it("returns all matched when two identical schemas are provided", () => {
    const cols = [
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "active", type: "Boolean" },
    ];
    const diff = computeSchemaDiff(cols, [...cols]);
    expect(diff).toHaveLength(3);
    expect(diff.every((r) => r.status === "matched")).toBe(true);
    expect(diff[0]).toEqual({
      name: "id",
      leftType: "Int64",
      rightType: "Int64",
      status: "matched",
    });
    expect(diff[1]).toEqual({
      name: "name",
      leftType: "Utf8",
      rightType: "Utf8",
      status: "matched",
    });
    expect(diff[2]).toEqual({
      name: "active",
      leftType: "Boolean",
      rightType: "Boolean",
      status: "matched",
    });
  });

  it("marks columns only in left schema as left-only", () => {
    const left = [
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "email", type: "Utf8" },
    ];
    const right = [{ name: "id", type: "Int64" }];
    const diff = computeSchemaDiff(left, right);

    expect(diff).toHaveLength(3);
    expect(diff[0]).toEqual({
      name: "id",
      leftType: "Int64",
      rightType: "Int64",
      status: "matched",
    });
    expect(diff[1]).toEqual({
      name: "name",
      leftType: "Utf8",
      rightType: null,
      status: "left-only",
    });
    expect(diff[2]).toEqual({
      name: "email",
      leftType: "Utf8",
      rightType: null,
      status: "left-only",
    });
  });

  it("marks columns only in right schema as right-only", () => {
    const left = [{ name: "id", type: "Int64" }];
    const right = [
      { name: "id", type: "Int64" },
      { name: "product", type: "Utf8" },
      { name: "amount", type: "Float64" },
    ];
    const diff = computeSchemaDiff(left, right);

    expect(diff).toHaveLength(3);
    expect(diff[0]).toEqual({
      name: "id",
      leftType: "Int64",
      rightType: "Int64",
      status: "matched",
    });
    expect(diff[1]).toEqual({
      name: "product",
      leftType: null,
      rightType: "Utf8",
      status: "right-only",
    });
    expect(diff[2]).toEqual({
      name: "amount",
      leftType: null,
      rightType: "Float64",
      status: "right-only",
    });
  });

  it("detects type mismatch for same-name columns with different types", () => {
    const left = [
      { name: "id", type: "Int64" },
      { name: "value", type: "Float32" },
    ];
    const right = [
      { name: "id", type: "Utf8" },
      { name: "value", type: "Int64" },
    ];
    const diff = computeSchemaDiff(left, right);

    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      name: "id",
      leftType: "Int64",
      rightType: "Utf8",
      status: "type-mismatch",
    });
    expect(diff[1]).toEqual({
      name: "value",
      leftType: "Float32",
      rightType: "Int64",
      status: "type-mismatch",
    });
  });

  it("returns empty array when both schemas are empty", () => {
    const diff = computeSchemaDiff([], []);
    expect(diff).toEqual([]);
  });

  it("handles one empty and one populated schema (left empty)", () => {
    const right = [
      { name: "a", type: "Int64" },
      { name: "b", type: "Utf8" },
    ];
    const diff = computeSchemaDiff([], right);

    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      name: "a",
      leftType: null,
      rightType: "Int64",
      status: "right-only",
    });
    expect(diff[1]).toEqual({
      name: "b",
      leftType: null,
      rightType: "Utf8",
      status: "right-only",
    });
  });

  it("handles one empty and one populated schema (right empty)", () => {
    const left = [
      { name: "x", type: "Boolean" },
      { name: "y", type: "Float64" },
    ];
    const diff = computeSchemaDiff(left, []);

    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      name: "x",
      leftType: "Boolean",
      rightType: null,
      status: "left-only",
    });
    expect(diff[1]).toEqual({
      name: "y",
      leftType: "Float64",
      rightType: null,
      status: "left-only",
    });
  });

  it("treats column names as case-sensitive", () => {
    const left = [{ name: "Name", type: "Utf8" }];
    const right = [{ name: "name", type: "Utf8" }];
    const diff = computeSchemaDiff(left, right);

    // Since the Map lookup is case-sensitive, "Name" !== "name"
    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      name: "Name",
      leftType: "Utf8",
      rightType: null,
      status: "left-only",
    });
    expect(diff[1]).toEqual({
      name: "name",
      leftType: null,
      rightType: "Utf8",
      status: "right-only",
    });
  });

  it("preserves ordering: left columns first, then right-only columns", () => {
    const left = [
      { name: "z", type: "Int64" },
      { name: "a", type: "Utf8" },
    ];
    const right = [
      { name: "m", type: "Boolean" },
      { name: "z", type: "Int64" },
    ];
    const diff = computeSchemaDiff(left, right);

    expect(diff.map((r) => r.name)).toEqual(["z", "a", "m"]);
    expect(diff[0].status).toBe("matched");
    expect(diff[1].status).toBe("left-only");
    expect(diff[2].status).toBe("right-only");
  });

  it("handles a complex mixed scenario with all four statuses", () => {
    const left = [
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "score", type: "Float64" },
      { name: "leftOnly", type: "Boolean" },
    ];
    const right = [
      { name: "id", type: "Int64" },
      { name: "name", type: "String" },
      { name: "score", type: "Float64" },
      { name: "rightOnly", type: "Date" },
    ];
    const diff = computeSchemaDiff(left, right);

    expect(diff).toHaveLength(5);
    expect(diff[0]).toEqual({
      name: "id",
      leftType: "Int64",
      rightType: "Int64",
      status: "matched",
    });
    expect(diff[1]).toEqual({
      name: "name",
      leftType: "Utf8",
      rightType: "String",
      status: "type-mismatch",
    });
    expect(diff[2]).toEqual({
      name: "score",
      leftType: "Float64",
      rightType: "Float64",
      status: "matched",
    });
    expect(diff[3]).toEqual({
      name: "leftOnly",
      leftType: "Boolean",
      rightType: null,
      status: "left-only",
    });
    expect(diff[4]).toEqual({
      name: "rightOnly",
      leftType: null,
      rightType: "Date",
      status: "right-only",
    });
  });

  it("handles duplicate column names within one schema (last wins in right map)", () => {
    const left = [{ name: "id", type: "Int64" }];
    const right = [
      { name: "id", type: "Utf8" },
      { name: "id", type: "Int64" },
    ];
    const diff = computeSchemaDiff(left, right);

    // The Map overwrites the first "id" entry with the second, so rightType = "Int64"
    // The first entry from left matches the last right entry
    expect(diff[0]).toEqual({
      name: "id",
      leftType: "Int64",
      rightType: "Int64",
      status: "matched",
    });
  });
});

// ---------------------------------------------------------------------------
// mapType
// ---------------------------------------------------------------------------
describe("mapType", () => {
  describe("maps common SQL / Polars types correctly", () => {
    it('maps "String" to "Text"', () => {
      expect(mapType("String")).toBe("Text");
    });

    it('maps "Utf8" to "Text"', () => {
      expect(mapType("Utf8")).toBe("Text");
    });

    it('maps "Int32" to "Integer"', () => {
      expect(mapType("Int32")).toBe("Integer");
    });

    it('maps "Int64" to "Integer"', () => {
      expect(mapType("Int64")).toBe("Integer");
    });

    it('maps "Float32" to "Decimal"', () => {
      expect(mapType("Float32")).toBe("Decimal");
    });

    it('maps "Float64" to "Decimal"', () => {
      expect(mapType("Float64")).toBe("Decimal");
    });

    it('maps "Date" to "Date"', () => {
      expect(mapType("Date")).toBe("Date");
    });

    it('maps "DateTime" to "Date"', () => {
      expect(mapType("DateTime")).toBe("Date");
    });

    it('maps "Boolean" to "Boolean"', () => {
      expect(mapType("Boolean")).toBe("Boolean");
    });
  });

  describe("handles unknown types by returning them as-is", () => {
    it("returns unknown type strings verbatim", () => {
      expect(mapType("Categorical")).toBe("Categorical");
      expect(mapType("Binary")).toBe("Binary");
      expect(mapType("UInt16")).toBe("UInt16");
      expect(mapType("List")).toBe("List");
    });

    it("returns empty string as-is", () => {
      expect(mapType("")).toBe("");
    });
  });

  describe("handles edge-case inputs", () => {
    it("is case-sensitive (lowercase does not match)", () => {
      expect(mapType("string")).toBe("string");
      expect(mapType("utf8")).toBe("utf8");
      expect(mapType("int32")).toBe("int32");
      expect(mapType("boolean")).toBe("boolean");
    });

    it("does not trim whitespace", () => {
      expect(mapType(" String")).toBe(" String");
      expect(mapType("String ")).toBe("String ");
    });
  });
});
