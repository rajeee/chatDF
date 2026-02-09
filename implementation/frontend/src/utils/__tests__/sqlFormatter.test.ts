import { describe, it, expect } from "vitest";
import { formatSql } from "../sqlFormatter";

describe("formatSql", () => {
  it("formats a simple SELECT statement", () => {
    const input = "SELECT id, name, email FROM users";
    const expected = [
      "SELECT",
      "  id,",
      "  name,",
      "  email",
      "FROM users",
    ].join("\n");

    expect(formatSql(input)).toBe(expected);
  });

  it("formats SELECT with WHERE and AND/OR conditions", () => {
    const input =
      "SELECT id, name, email FROM users WHERE age > 18 AND status = 'active' OR role = 'admin' ORDER BY name ASC LIMIT 100";
    const expected = [
      "SELECT",
      "  id,",
      "  name,",
      "  email",
      "FROM users",
      "WHERE",
      "  age > 18",
      "  AND status = 'active'",
      "  OR role = 'admin'",
      "ORDER BY name ASC",
      "LIMIT 100",
    ].join("\n");

    expect(formatSql(input)).toBe(expected);
  });

  it("formats JOINs", () => {
    const input =
      "SELECT u.id, u.name, o.total FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.total > 100";
    const expected = [
      "SELECT",
      "  u.id,",
      "  u.name,",
      "  o.total",
      "FROM users u",
      "LEFT JOIN orders o",
      "ON",
      "  u.id = o.user_id",
      "WHERE",
      "  o.total > 100",
    ].join("\n");

    expect(formatSql(input)).toBe(expected);
  });

  it("formats GROUP BY and ORDER BY", () => {
    const input =
      "SELECT department, COUNT(*) as cnt FROM employees GROUP BY department HAVING cnt > 5 ORDER BY cnt DESC LIMIT 10";
    const expected = [
      "SELECT",
      "  department,",
      "  COUNT(*) as cnt",
      "FROM employees",
      "GROUP BY department",
      "HAVING",
      "  cnt > 5",
      "ORDER BY cnt DESC",
      "LIMIT 10",
    ].join("\n");

    expect(formatSql(input)).toBe(expected);
  });

  it("preserves string literals with keywords inside them", () => {
    const input =
      "SELECT id, name FROM users WHERE status = 'SELECT FROM WHERE' AND name = 'test'";
    const result = formatSql(input);

    // The string literal 'SELECT FROM WHERE' should be preserved intact
    expect(result).toContain("'SELECT FROM WHERE'");
    // Should still format the outer query properly
    expect(result).toMatch(/^SELECT\n/);
    expect(result).toContain("FROM users");
    expect(result).toContain("WHERE");
  });

  it("handles already-formatted SQL without double-formatting", () => {
    const formatted = [
      "SELECT",
      "  id,",
      "  name,",
      "  email",
      "FROM users",
      "WHERE",
      "  age > 18",
      "  AND status = 'active'",
      "ORDER BY name ASC",
      "LIMIT 100",
    ].join("\n");

    // Formatting an already-formatted query should produce the same result
    expect(formatSql(formatted)).toBe(formatted);
  });

  it("returns empty string for empty input", () => {
    expect(formatSql("")).toBe("");
    expect(formatSql("   ")).toBe("");
    expect(formatSql("\n\t")).toBe("");
  });

  it("formats a complex nested query with subquery", () => {
    const input =
      "SELECT u.name, u.email, (SELECT COUNT(*) FROM orders WHERE orders.user_id = u.id) as order_count FROM users u WHERE u.active = 1 AND u.created_at > '2023-01-01' ORDER BY u.name LIMIT 50 OFFSET 10";
    const result = formatSql(input);

    // Should start with SELECT
    expect(result).toMatch(/^SELECT\n/);
    // The subquery should be preserved inside parentheses (not broken up)
    expect(result).toContain("(SELECT COUNT(*)");
    // Major keywords at top level should be on their own lines
    expect(result).toContain("\nFROM users u");
    expect(result).toContain("\nWHERE");
    expect(result).toContain("\nORDER BY u.name");
    expect(result).toContain("\nLIMIT 50");
    expect(result).toContain("\nOFFSET 10");
  });

  it("normalizes multiple whitespace to single space", () => {
    const input = "SELECT   id,    name   FROM   users   WHERE   id = 1";
    const expected = [
      "SELECT",
      "  id,",
      "  name",
      "FROM users",
      "WHERE",
      "  id = 1",
    ].join("\n");

    expect(formatSql(input)).toBe(expected);
  });

  it("handles UNION and UNION ALL", () => {
    const input =
      "SELECT id FROM users UNION ALL SELECT id FROM admins";
    const result = formatSql(input);

    expect(result).toContain("SELECT");
    expect(result).toContain("UNION ALL");
    expect(result).toContain("FROM users");
    expect(result).toContain("FROM admins");
  });
});
