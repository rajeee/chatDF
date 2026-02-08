import { describe, it, expect } from "vitest";
import { cellValue, cellValueRaw } from "@/utils/tableUtils";

describe("tableUtils", () => {
  describe("cellValueRaw", () => {
    it("should extract value from array row", () => {
      const row = ["Alice", 30, "NYC"];
      const columns = ["name", "age", "city"];
      expect(cellValueRaw(row, 0, columns)).toBe("Alice");
      expect(cellValueRaw(row, 1, columns)).toBe(30);
      expect(cellValueRaw(row, 2, columns)).toBe("NYC");
    });

    it("should extract value from object row", () => {
      const row = { name: "Alice", age: 30, city: "NYC" };
      const columns = ["name", "age", "city"];
      expect(cellValueRaw(row, 0, columns)).toBe("Alice");
      expect(cellValueRaw(row, 1, columns)).toBe(30);
      expect(cellValueRaw(row, 2, columns)).toBe("NYC");
    });

    it("should return null for invalid row", () => {
      const columns = ["name", "age", "city"];
      expect(cellValueRaw(null, 0, columns)).toBeNull();
      expect(cellValueRaw(undefined, 0, columns)).toBeNull();
    });
  });

  describe("cellValue", () => {
    it("should return string representation of value", () => {
      const row = { name: "Alice", age: 30, city: "NYC" };
      const columns = ["name", "age", "city"];
      expect(cellValue(row, 0, columns)).toBe("Alice");
      expect(cellValue(row, 1, columns)).toBe("30");
      expect(cellValue(row, 2, columns)).toBe("NYC");
    });

    it("should return 'null' string for null values", () => {
      const row = { name: null, age: undefined, city: "NYC" };
      const columns = ["name", "age", "city"];
      expect(cellValue(row, 0, columns)).toBe("null");
      expect(cellValue(row, 1, columns)).toBe("null");
    });
  });
});
