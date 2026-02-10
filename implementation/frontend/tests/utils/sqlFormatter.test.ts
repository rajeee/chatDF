// Tests: formatSql utility
//
// Verifies:
// - Empty and whitespace-only input returns empty string
// - Major keywords (SELECT, FROM, WHERE, JOIN, etc.) placed on new lines
// - SELECT columns each get their own indented line
// - WHERE/HAVING conditions split by AND/OR onto indented lines
// - String literals are preserved and not reformatted
// - Subqueries inside parentheses are not split by keyword newlines
// - Multiple statements and compound keywords handled correctly
// - Whitespace normalization and edge cases

import { describe, it, expect } from "vitest";
import { formatSql } from "@/utils/sqlFormatter";

describe("formatSql", () => {
  describe("empty and trivial input", () => {
    it("returns empty string for empty input", () => {
      expect(formatSql("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(formatSql("   \n\t  ")).toBe("");
    });

    it("formats a single keyword", () => {
      const result = formatSql("SELECT");
      expect(result).toBe("SELECT");
    });

    it("formats a simple expression without major keywords", () => {
      const result = formatSql("1 + 1");
      expect(result).toBe("1 + 1");
    });
  });

  describe("basic SELECT ... FROM formatting", () => {
    it("places SELECT and FROM on separate lines", () => {
      const result = formatSql("SELECT a FROM t");
      expect(result).toContain("SELECT\n");
      expect(result).toContain("FROM t");
      // SELECT and FROM should be on different lines
      const lines = result.split("\n");
      expect(lines[0]).toBe("SELECT");
      expect(lines[1]).toBe("  a");
      expect(lines[2]).toBe("FROM t");
    });

    it("puts each selected column on its own indented line", () => {
      const result = formatSql("SELECT a, b, c FROM t");
      const lines = result.split("\n");
      expect(lines[0]).toBe("SELECT");
      expect(lines[1]).toBe("  a,");
      expect(lines[2]).toBe("  b,");
      expect(lines[3]).toBe("  c");
      expect(lines[4]).toBe("FROM t");
    });

    it("handles SELECT * FROM table", () => {
      const result = formatSql("SELECT * FROM users");
      const lines = result.split("\n");
      expect(lines[0]).toBe("SELECT");
      expect(lines[1]).toBe("  *");
      expect(lines[2]).toBe("FROM users");
    });
  });

  describe("WHERE clause formatting", () => {
    it("places WHERE on its own line with conditions indented", () => {
      const result = formatSql("SELECT a FROM t WHERE x = 1");
      const lines = result.split("\n");
      const whereLine = lines.findIndex((l) => l === "WHERE");
      expect(whereLine).toBeGreaterThan(0);
      expect(lines[whereLine + 1]).toBe("  x = 1");
    });

    it("splits AND conditions onto separate indented lines", () => {
      const result = formatSql("SELECT a FROM t WHERE x = 1 AND y = 2 AND z = 3");
      const lines = result.split("\n");
      const whereLine = lines.findIndex((l) => l === "WHERE");
      expect(lines[whereLine + 1]).toBe("  x = 1");
      expect(lines[whereLine + 2]).toBe("  AND y = 2");
      expect(lines[whereLine + 3]).toBe("  AND z = 3");
    });

    it("splits OR conditions onto separate indented lines", () => {
      const result = formatSql("SELECT a FROM t WHERE x = 1 OR y = 2");
      const lines = result.split("\n");
      const whereLine = lines.findIndex((l) => l === "WHERE");
      expect(lines[whereLine + 1]).toBe("  x = 1");
      expect(lines[whereLine + 2]).toBe("  OR y = 2");
    });

    it("handles mixed AND/OR conditions", () => {
      const result = formatSql("SELECT a FROM t WHERE x = 1 AND y = 2 OR z = 3");
      const lines = result.split("\n");
      const whereLine = lines.findIndex((l) => l === "WHERE");
      expect(lines[whereLine + 1]).toBe("  x = 1");
      expect(lines[whereLine + 2]).toBe("  AND y = 2");
      expect(lines[whereLine + 3]).toBe("  OR z = 3");
    });
  });

  describe("JOIN formatting", () => {
    it("places JOIN on its own line", () => {
      const result = formatSql("SELECT a FROM t1 JOIN t2 ON t1.id = t2.id");
      expect(result).toContain("\nJOIN t2");
    });

    it("places LEFT JOIN on its own line", () => {
      const result = formatSql("SELECT a FROM t1 LEFT JOIN t2 ON t1.id = t2.id");
      expect(result).toContain("\nLEFT JOIN t2");
    });

    it("formats ON conditions as indented", () => {
      const result = formatSql("SELECT a FROM t1 JOIN t2 ON t1.id = t2.id AND t1.x = t2.x");
      const lines = result.split("\n");
      const onLine = lines.findIndex((l) => l === "ON");
      expect(onLine).toBeGreaterThan(0);
      expect(lines[onLine + 1]).toBe("  t1.id = t2.id");
      expect(lines[onLine + 2]).toBe("  AND t1.x = t2.x");
    });
  });

  describe("GROUP BY, ORDER BY, HAVING, LIMIT", () => {
    it("places GROUP BY on its own line", () => {
      const result = formatSql("SELECT a, COUNT(*) FROM t GROUP BY a");
      expect(result).toContain("\nGROUP BY a");
    });

    it("places ORDER BY on its own line", () => {
      const result = formatSql("SELECT a FROM t ORDER BY a DESC");
      expect(result).toContain("\nORDER BY a DESC");
    });

    it("places LIMIT on its own line", () => {
      const result = formatSql("SELECT a FROM t LIMIT 10");
      expect(result).toContain("\nLIMIT 10");
    });

    it("places OFFSET on its own line", () => {
      const result = formatSql("SELECT a FROM t LIMIT 10 OFFSET 5");
      expect(result).toContain("\nLIMIT 10");
      expect(result).toContain("\nOFFSET 5");
    });

    it("formats HAVING with indented conditions", () => {
      const result = formatSql("SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1 AND a > 0");
      const lines = result.split("\n");
      const havingLine = lines.findIndex((l) => l === "HAVING");
      expect(havingLine).toBeGreaterThan(0);
      expect(lines[havingLine + 1]).toBe("  COUNT(*) > 1");
      expect(lines[havingLine + 2]).toBe("  AND a > 0");
    });
  });

  describe("string literal preservation", () => {
    it("does not format keywords inside single-quoted strings", () => {
      const result = formatSql("SELECT 'SELECT FROM WHERE' FROM t");
      // The string 'SELECT FROM WHERE' should appear intact in the output
      expect(result).toContain("'SELECT FROM WHERE'");
    });

    it("does not format keywords inside double-quoted strings", () => {
      const result = formatSql('SELECT "SELECT FROM WHERE" FROM t');
      expect(result).toContain('"SELECT FROM WHERE"');
    });

    it("preserves string literals with escaped quotes", () => {
      const result = formatSql("SELECT 'it\\'s a test' FROM t");
      expect(result).toContain("'it\\'s a test'");
    });
  });

  describe("subqueries", () => {
    it("does not split keywords inside subqueries onto new lines", () => {
      const result = formatSql("SELECT a FROM (SELECT b FROM t2) AS sub");
      // The inner SELECT should not be placed on a new line at the top level
      // Instead it stays inside the parentheses
      expect(result).toContain("(SELECT b FROM t2)");
    });

    it("handles nested subqueries", () => {
      const result = formatSql(
        "SELECT a FROM (SELECT b FROM (SELECT c FROM t3) AS inner_sub) AS outer_sub"
      );
      // Both inner queries should be preserved within parentheses
      expect(result).toContain("(SELECT b FROM (SELECT c FROM t3) AS inner_sub)");
    });
  });

  describe("UNION formatting", () => {
    it("places UNION on its own line", () => {
      const result = formatSql("SELECT a FROM t1 UNION SELECT b FROM t2");
      const lines = result.split("\n");
      const unionLine = lines.findIndex((l) => l === "UNION");
      expect(unionLine).toBeGreaterThan(0);
    });

    it("places UNION ALL on its own line", () => {
      const result = formatSql("SELECT a FROM t1 UNION ALL SELECT b FROM t2");
      const lines = result.split("\n");
      const unionAllLine = lines.findIndex((l) => l === "UNION ALL");
      expect(unionAllLine).toBeGreaterThan(0);
    });
  });

  describe("DML/DDL keywords", () => {
    it("formats INSERT INTO on its own line", () => {
      const result = formatSql("INSERT INTO t (a, b) VALUES (1, 2)");
      expect(result).toContain("INSERT INTO t (a, b)");
      expect(result).toContain("\nVALUES (1, 2)");
    });

    it("formats UPDATE with SET indented", () => {
      const result = formatSql("UPDATE t SET a = 1, b = 2 WHERE id = 3");
      const lines = result.split("\n");
      expect(lines[0]).toBe("UPDATE t");
      const setLine = lines.findIndex((l) => l === "SET");
      expect(setLine).toBeGreaterThan(0);
      expect(lines[setLine + 1]).toBe("  a = 1,");
      expect(lines[setLine + 2]).toBe("  b = 2");
    });

    it("formats DELETE FROM on its own line", () => {
      const result = formatSql("DELETE FROM t WHERE id = 1");
      expect(result).toContain("DELETE FROM t");
      expect(result).toContain("\nWHERE");
    });
  });

  describe("whitespace normalization", () => {
    it("collapses multiple spaces into single spaces", () => {
      const result = formatSql("SELECT   a,   b   FROM   t");
      // Columns should be cleanly indented without extra spaces
      const lines = result.split("\n");
      expect(lines[1]).toBe("  a,");
      expect(lines[2]).toBe("  b");
      expect(lines[3]).toBe("FROM t");
    });

    it("normalizes tabs and newlines in the input", () => {
      const result = formatSql("SELECT\ta\nFROM\tt");
      const lines = result.split("\n");
      expect(lines[0]).toBe("SELECT");
      expect(lines[1]).toBe("  a");
      expect(lines[2]).toBe("FROM t");
    });

    it("handles already-formatted SQL input", () => {
      const formatted = "SELECT\n  a,\n  b\nFROM t\nWHERE\n  x = 1";
      const result = formatSql(formatted);
      // Re-formatting should produce stable output
      expect(result).toBe(formatted);
    });
  });

  describe("case handling", () => {
    it("uppercases major keywords", () => {
      const result = formatSql("select a from t where x = 1");
      expect(result).toContain("SELECT");
      expect(result).toContain("FROM");
      expect(result).toContain("WHERE");
    });

    it("uppercases mixed-case keywords", () => {
      const result = formatSql("Select a From t Where x = 1");
      expect(result).toContain("SELECT");
      expect(result).toContain("FROM");
      expect(result).toContain("WHERE");
    });
  });

  describe("complex queries", () => {
    it("formats a full query with multiple clauses", () => {
      const sql =
        "SELECT u.name, u.email, COUNT(o.id) AS order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.active = 1 AND o.created_at > '2024-01-01' GROUP BY u.name, u.email HAVING COUNT(o.id) > 5 ORDER BY order_count DESC LIMIT 10";
      const result = formatSql(sql);
      const lines = result.split("\n");

      // Verify overall structure
      expect(lines[0]).toBe("SELECT");
      expect(lines).toContain("FROM users u");
      expect(lines.some((l) => l.startsWith("LEFT JOIN"))).toBe(true);
      expect(lines).toContain("WHERE");
      expect(lines.some((l) => l.startsWith("GROUP BY"))).toBe(true);
      expect(lines).toContain("HAVING");
      expect(lines.some((l) => l.startsWith("ORDER BY"))).toBe(true);
      expect(lines.some((l) => l.startsWith("LIMIT"))).toBe(true);

      // String literal should be preserved
      expect(result).toContain("'2024-01-01'");
    });

    it("handles SELECT with function calls containing commas", () => {
      const result = formatSql("SELECT COALESCE(a, b), IFNULL(c, 0) FROM t");
      const lines = result.split("\n");
      expect(lines[0]).toBe("SELECT");
      // The commas inside COALESCE/IFNULL should not split the arguments
      expect(lines[1]).toBe("  COALESCE(a, b),");
      expect(lines[2]).toBe("  IFNULL(c, 0)");
    });
  });
});
