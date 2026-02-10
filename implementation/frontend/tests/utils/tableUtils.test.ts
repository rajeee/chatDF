// Tests: tableUtils (cellValueRaw, cellValue)
//
// Verifies:
// - cellValueRaw extracts values from array rows by index
// - cellValueRaw extracts values from object rows by column name
// - cellValueRaw handles null/undefined rows and values
// - cellValue converts raw values to display strings
// - cellValue converts null/undefined to "null" string

import { describe, it, expect } from "vitest";
import { cellValueRaw, cellValue } from "@/utils/tableUtils";

const columns = ["id", "name", "age"];

describe("cellValueRaw", () => {
  it("returns value at index when row is an array", () => {
    const row = [1, "Alice", 30];
    expect(cellValueRaw(row, 0, columns)).toBe(1);
    expect(cellValueRaw(row, 1, columns)).toBe("Alice");
    expect(cellValueRaw(row, 2, columns)).toBe(30);
  });

  it("returns value by column name when row is an object", () => {
    const row = { id: 1, name: "Bob", age: 25 };
    expect(cellValueRaw(row, 0, columns)).toBe(1);
    expect(cellValueRaw(row, 1, columns)).toBe("Bob");
    expect(cellValueRaw(row, 2, columns)).toBe(25);
  });

  it("returns null when row is null", () => {
    expect(cellValueRaw(null, 0, columns)).toBe(null);
  });

  it("returns null when row is undefined", () => {
    expect(cellValueRaw(undefined, 0, columns)).toBe(null);
  });

  it("returns undefined when array index is out of bounds", () => {
    const row = [1, "Alice"];
    expect(cellValueRaw(row, 5, columns)).toBeUndefined();
  });

  it("returns undefined when object key does not exist", () => {
    const row = { id: 1 };
    expect(cellValueRaw(row, 1, columns)).toBeUndefined();
  });

  it("returns null value from array row", () => {
    const row = [null, "Alice", null];
    expect(cellValueRaw(row, 0, columns)).toBe(null);
    expect(cellValueRaw(row, 2, columns)).toBe(null);
  });

  it("returns null value from object row", () => {
    const row = { id: null, name: "Alice", age: null };
    expect(cellValueRaw(row, 0, columns)).toBe(null);
    expect(cellValueRaw(row, 2, columns)).toBe(null);
  });

  it("returns null for non-array, non-object row (primitive)", () => {
    expect(cellValueRaw(42, 0, columns)).toBe(null);
    expect(cellValueRaw("string", 0, columns)).toBe(null);
    expect(cellValueRaw(true, 0, columns)).toBe(null);
  });
});

describe("cellValue", () => {
  it("converts null to 'null' string", () => {
    const row = [null, "Alice"];
    expect(cellValue(row, 0, columns)).toBe("null");
  });

  it("converts undefined to 'null' string", () => {
    const row = [1, "Alice"];
    // index 5 is out of bounds, cellValueRaw returns undefined
    expect(cellValue(row, 5, columns)).toBe("null");
  });

  it("converts number to string", () => {
    const row = [42, "Alice", 30];
    expect(cellValue(row, 0, columns)).toBe("42");
    expect(cellValue(row, 2, columns)).toBe("30");
  });

  it("returns string values as-is", () => {
    const row = [1, "Alice", 30];
    expect(cellValue(row, 1, columns)).toBe("Alice");
  });

  it("converts boolean to string", () => {
    const row = [true, "Alice", false];
    expect(cellValue(row, 0, columns)).toBe("true");
    expect(cellValue(row, 2, columns)).toBe("false");
  });

  it("converts object to string", () => {
    const nested = { key: "value" };
    const row = [nested, "Alice"];
    expect(cellValue(row, 0, columns)).toBe("[object Object]");
  });

  it("converts zero to '0' (not 'null')", () => {
    const row = [0, "", false];
    expect(cellValue(row, 0, columns)).toBe("0");
  });

  it("converts empty string to empty string (not 'null')", () => {
    const row = [0, ""];
    expect(cellValue(row, 1, columns)).toBe("");
  });

  it("returns 'null' when row itself is null", () => {
    expect(cellValue(null, 0, columns)).toBe("null");
  });

  it("works with object rows", () => {
    const row = { id: 99, name: "Charlie", age: 40 };
    expect(cellValue(row, 0, columns)).toBe("99");
    expect(cellValue(row, 1, columns)).toBe("Charlie");
    expect(cellValue(row, 2, columns)).toBe("40");
  });
});
