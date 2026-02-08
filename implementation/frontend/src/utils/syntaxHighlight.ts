// Lightweight syntax tokenizer for code blocks.
// Supports SQL, Python, and JavaScript/TypeScript keywords.
// No external dependencies — just linear string scanning.

export interface Token {
  text: string;
  type: "keyword" | "string" | "number" | "comment" | "operator" | "plain";
}

const SQL_KEYWORDS = new Set([
  "select", "from", "where", "and", "or", "not", "in", "is", "null",
  "join", "inner", "left", "right", "outer", "on", "as", "group",
  "by", "order", "having", "limit", "offset", "insert", "into",
  "values", "update", "set", "delete", "create", "table", "drop",
  "alter", "index", "distinct", "count", "sum", "avg", "min", "max",
  "between", "like", "union", "all", "exists", "case", "when", "then",
  "else", "end", "asc", "desc", "with", "true", "false",
]);

const PYTHON_KEYWORDS = new Set([
  "def", "class", "import", "from", "return", "if", "elif", "else",
  "for", "while", "break", "continue", "pass", "try", "except",
  "finally", "raise", "with", "as", "yield", "lambda", "and", "or",
  "not", "in", "is", "True", "False", "None", "self", "async", "await",
  "print",
]);

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for",
  "while", "do", "break", "continue", "switch", "case", "default",
  "try", "catch", "finally", "throw", "new", "delete", "typeof",
  "instanceof", "void", "this", "class", "extends", "super", "import",
  "export", "from", "async", "await", "yield", "of", "in", "true",
  "false", "null", "undefined", "console", "type", "interface",
]);

const OPERATORS = new Set([
  "=", "!=", "<>", ">=", "<=", ">", "<", "+", "-", "*", "/", "%",
  "=>", "===", "!==", "==", "&&", "||", "!", "?", ":",
]);

function getKeywords(language: string): Set<string> {
  const lang = language.toLowerCase();
  if (lang === "sql" || lang === "sqlite") return SQL_KEYWORDS;
  if (lang === "python" || lang === "py") return PYTHON_KEYWORDS;
  if (["js", "javascript", "ts", "typescript", "jsx", "tsx"].includes(lang)) return JS_KEYWORDS;
  return new Set();
}

function isCaseSensitive(language: string): boolean {
  const lang = language.toLowerCase();
  return lang !== "sql" && lang !== "sqlite";
}

function isWordChar(ch: string): boolean {
  return /\w/.test(ch);
}

/** Tokenize a code string into typed spans for syntax highlighting. */
export function tokenize(code: string, language: string): Token[] {
  const keywords = getKeywords(language);
  const caseSensitive = isCaseSensitive(language);
  const tokens: Token[] = [];
  let i = 0;

  function push(text: string, type: Token["type"]) {
    // Merge adjacent plain tokens
    if (type === "plain" && tokens.length > 0 && tokens[tokens.length - 1].type === "plain") {
      tokens[tokens.length - 1].text += text;
    } else {
      tokens.push({ text, type });
    }
  }

  while (i < code.length) {
    const ch = code[i];

    // -- line comment (SQL, Python #)
    if (ch === "-" && code[i + 1] === "-") {
      const end = code.indexOf("\n", i);
      const commentEnd = end === -1 ? code.length : end;
      push(code.slice(i, commentEnd), "comment");
      i = commentEnd;
      continue;
    }

    // # line comment (Python)
    if (ch === "#" && (language.toLowerCase() === "python" || language.toLowerCase() === "py")) {
      const end = code.indexOf("\n", i);
      const commentEnd = end === -1 ? code.length : end;
      push(code.slice(i, commentEnd), "comment");
      i = commentEnd;
      continue;
    }

    // // line comment (JS/TS)
    if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const commentEnd = end === -1 ? code.length : end;
      push(code.slice(i, commentEnd), "comment");
      i = commentEnd;
      continue;
    }

    // /* block comment */
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const commentEnd = end === -1 ? code.length : end + 2;
      push(code.slice(i, commentEnd), "comment");
      i = commentEnd;
      continue;
    }

    // String literals (single or double quoted)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < code.length && code[j] !== quote) {
        if (code[j] === "\\") j++; // skip escaped char
        j++;
      }
      if (j < code.length) j++; // include closing quote
      push(code.slice(i, j), "string");
      i = j;
      continue;
    }

    // Backtick strings (JS template literals)
    if (ch === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== "`") {
        if (code[j] === "\\") j++;
        j++;
      }
      if (j < code.length) j++;
      push(code.slice(i, j), "string");
      i = j;
      continue;
    }

    // Numbers (integer or decimal)
    if (/\d/.test(ch)) {
      let j = i;
      while (j < code.length && /[\d.]/.test(code[j])) j++;
      // Don't treat as number if immediately preceded by a word char (e.g. var1)
      if (i > 0 && isWordChar(code[i - 1])) {
        push(code.slice(i, j), "plain");
      } else {
        push(code.slice(i, j), "number");
      }
      i = j;
      continue;
    }

    // Words (identifiers / keywords)
    if (isWordChar(ch)) {
      let j = i;
      while (j < code.length && isWordChar(code[j])) j++;
      const word = code.slice(i, j);
      const lookup = caseSensitive ? word : word.toLowerCase();
      if (keywords.has(lookup)) {
        push(word, "keyword");
      } else {
        push(word, "plain");
      }
      i = j;
      continue;
    }

    // Multi-char operators
    if (i + 2 < code.length) {
      const three = code.slice(i, i + 3);
      if (OPERATORS.has(three)) {
        push(three, "operator");
        i += 3;
        continue;
      }
    }
    if (i + 1 < code.length) {
      const two = code.slice(i, i + 2);
      if (OPERATORS.has(two)) {
        push(two, "operator");
        i += 2;
        continue;
      }
    }
    if (OPERATORS.has(ch)) {
      push(ch, "operator");
      i++;
      continue;
    }

    // Everything else (whitespace, punctuation, etc.)
    push(ch, "plain");
    i++;
  }

  return tokens;
}
