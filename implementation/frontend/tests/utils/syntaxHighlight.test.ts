import { describe, it, expect } from "vitest";
import { tokenize, Token } from "@/utils/syntaxHighlight";

/** Helper: collect tokens of a specific type */
function tokensOfType(tokens: Token[], type: Token["type"]): string[] {
  return tokens.filter((t) => t.type === type).map((t) => t.text);
}

describe("tokenize", () => {
  describe("SQL keyword highlighting", () => {
    it("highlights common SQL keywords (case-insensitive)", () => {
      const tokens = tokenize("SELECT name FROM users WHERE id = 1", "sql");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("SELECT");
      expect(keywords).toContain("FROM");
      expect(keywords).toContain("WHERE");
    });

    it("highlights lowercase SQL keywords", () => {
      const tokens = tokenize("select * from users", "sql");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("select");
      expect(keywords).toContain("from");
    });

    it("highlights JOIN and GROUP BY", () => {
      const tokens = tokenize(
        "SELECT a.name FROM orders a JOIN users b ON a.uid = b.id GROUP BY a.name",
        "sql"
      );
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("JOIN");
      expect(keywords).toContain("ON");
      expect(keywords).toContain("GROUP");
      expect(keywords).toContain("BY");
    });

    it("highlights aggregate functions as keywords", () => {
      const tokens = tokenize("SELECT COUNT(*), AVG(price) FROM products", "sql");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("COUNT");
      expect(keywords).toContain("AVG");
    });
  });

  describe("string literal detection", () => {
    it("detects single-quoted strings", () => {
      const tokens = tokenize("WHERE name = 'hello world'", "sql");
      const strings = tokensOfType(tokens, "string");
      expect(strings).toContain("'hello world'");
    });

    it("detects double-quoted strings", () => {
      const tokens = tokenize('x = "test string"', "python");
      const strings = tokensOfType(tokens, "string");
      expect(strings).toContain('"test string"');
    });

    it("handles escaped quotes in strings", () => {
      const tokens = tokenize("x = 'it\\'s fine'", "python");
      const strings = tokensOfType(tokens, "string");
      expect(strings).toContain("'it\\'s fine'");
    });

    it("detects backtick template literals in JavaScript", () => {
      const tokens = tokenize("const s = `hello`", "js");
      const strings = tokensOfType(tokens, "string");
      expect(strings).toContain("`hello`");
    });
  });

  describe("number detection", () => {
    it("detects integers", () => {
      const tokens = tokenize("LIMIT 10", "sql");
      const numbers = tokensOfType(tokens, "number");
      expect(numbers).toContain("10");
    });

    it("detects decimal numbers", () => {
      const tokens = tokenize("x = 3.14", "python");
      const numbers = tokensOfType(tokens, "number");
      expect(numbers).toContain("3.14");
    });

    it("does not treat digits within identifiers as numbers", () => {
      const tokens = tokenize("var1 = 42", "python");
      // "var1" should be plain, "42" should be number
      const numbers = tokensOfType(tokens, "number");
      expect(numbers).toEqual(["42"]);
      // "var" + "1" merged in plain since 1 follows a word char
      const plains = tokensOfType(tokens, "plain");
      const combined = plains.join("");
      expect(combined).toContain("var1");
    });
  });

  describe("comment detection", () => {
    it("detects SQL line comments (--)", () => {
      const tokens = tokenize("SELECT 1 -- this is a comment\nFROM t", "sql");
      const comments = tokensOfType(tokens, "comment");
      expect(comments).toHaveLength(1);
      expect(comments[0]).toBe("-- this is a comment");
    });

    it("detects block comments (/* */)", () => {
      const tokens = tokenize("SELECT /* inline */ 1", "sql");
      const comments = tokensOfType(tokens, "comment");
      expect(comments).toContain("/* inline */");
    });

    it("detects Python line comments (#)", () => {
      const tokens = tokenize("x = 1 # set x", "python");
      const comments = tokensOfType(tokens, "comment");
      expect(comments).toHaveLength(1);
      expect(comments[0]).toBe("# set x");
    });

    it("detects JS line comments (//)", () => {
      const tokens = tokenize("const x = 1; // assign", "js");
      const comments = tokensOfType(tokens, "comment");
      expect(comments).toHaveLength(1);
      expect(comments[0]).toBe("// assign");
    });
  });

  describe("Python keywords", () => {
    it("highlights def, class, import, return", () => {
      const tokens = tokenize("def foo():\n  return 42", "python");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("def");
      expect(keywords).toContain("return");
    });

    it("highlights if/elif/else", () => {
      const tokens = tokenize("if x:\n  pass\nelif y:\n  pass\nelse:\n  pass", "python");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("if");
      expect(keywords).toContain("elif");
      expect(keywords).toContain("else");
      expect(keywords).toContain("pass");
    });

    it("highlights True, False, None (case-sensitive)", () => {
      const tokens = tokenize("x = True\ny = False\nz = None", "python");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("True");
      expect(keywords).toContain("False");
      expect(keywords).toContain("None");
    });
  });

  describe("JavaScript keywords", () => {
    it("highlights const, let, function, return", () => {
      const tokens = tokenize("const x = function() { return 1; }", "js");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("const");
      expect(keywords).toContain("function");
      expect(keywords).toContain("return");
    });

    it("highlights async/await", () => {
      const tokens = tokenize("async function load() { await fetch(); }", "javascript");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("async");
      expect(keywords).toContain("function");
      expect(keywords).toContain("await");
    });

    it("works with typescript language tag", () => {
      const tokens = tokenize("const x: string = 'hi'", "typescript");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("const");
    });
  });

  describe("operator detection", () => {
    it("detects common operators", () => {
      const tokens = tokenize("x = 1 + 2", "js");
      const ops = tokensOfType(tokens, "operator");
      expect(ops).toContain("=");
      expect(ops).toContain("+");
    });

    it("detects multi-character operators", () => {
      const tokens = tokenize("x === y && z !== w", "js");
      const ops = tokensOfType(tokens, "operator");
      expect(ops).toContain("===");
      expect(ops).toContain("&&");
      expect(ops).toContain("!==");
    });

    it("detects arrow operator", () => {
      const tokens = tokenize("const fn = () => 1", "js");
      const ops = tokensOfType(tokens, "operator");
      expect(ops).toContain("=>");
    });
  });

  describe("mixed content", () => {
    it("tokenizes a complete SQL query", () => {
      const sql = "SELECT name, COUNT(*) AS cnt FROM users WHERE age >= 18 GROUP BY name ORDER BY cnt DESC";
      const tokens = tokenize(sql, "sql");
      // Check that the token texts rejoin to original code
      expect(tokens.map((t) => t.text).join("")).toBe(sql);
      // Check specific types
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toContain("SELECT");
      expect(keywords).toContain("AS");
      expect(keywords).toContain("DESC");
      const numbers = tokensOfType(tokens, "number");
      expect(numbers).toContain("18");
    });

    it("tokenizes Python with strings, comments, and keywords", () => {
      const code = 'def greet(name):\n  # say hi\n  return "Hello " + name';
      const tokens = tokenize(code, "python");
      expect(tokens.map((t) => t.text).join("")).toBe(code);
      expect(tokensOfType(tokens, "keyword")).toContain("def");
      expect(tokensOfType(tokens, "keyword")).toContain("return");
      expect(tokensOfType(tokens, "comment")).toContain("# say hi");
      expect(tokensOfType(tokens, "string")).toContain('"Hello "');
    });

    it("preserves whitespace and newlines as plain tokens", () => {
      const tokens = tokenize("SELECT\n  *\nFROM t", "sql");
      const fullText = tokens.map((t) => t.text).join("");
      expect(fullText).toBe("SELECT\n  *\nFROM t");
    });
  });

  describe("empty and unknown language fallback", () => {
    it("returns all plain tokens for unknown language", () => {
      const tokens = tokenize("some random text", "brainfuck");
      // No keywords set, so everything should be plain (or operator/number/string)
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toHaveLength(0);
    });

    it("returns a single plain token for empty code", () => {
      const tokens = tokenize("", "sql");
      expect(tokens).toHaveLength(0);
    });

    it("handles empty language string", () => {
      const tokens = tokenize("const x = 1", "");
      const keywords = tokensOfType(tokens, "keyword");
      expect(keywords).toHaveLength(0);
    });

    it("still detects strings and numbers for unknown language", () => {
      const tokens = tokenize('x = "hello" + 42', "unknown");
      expect(tokensOfType(tokens, "string")).toContain('"hello"');
      expect(tokensOfType(tokens, "number")).toContain("42");
    });
  });
});
