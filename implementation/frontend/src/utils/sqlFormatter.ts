/**
 * Simple SQL formatter that prettifies SQL queries.
 *
 * Rules:
 * - Major keywords placed on new lines at column 0
 * - Column items after SELECT each get their own indented line
 * - Conditions after WHERE/HAVING/ON are indented 2 spaces
 * - AND/OR start new indented lines under WHERE/HAVING
 * - String literals (single and double quoted) are preserved as-is
 * - Multiple whitespace is normalized to single space
 * - Trailing whitespace is trimmed
 */

// Keywords that always start on a new line at column 0
const MAJOR_KEYWORDS = [
  "WITH",
  "SELECT",
  "FROM",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "OUTER JOIN",
  "CROSS JOIN",
  "JOIN",
  "WHERE",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "UNION ALL",
  "UNION",
  "INSERT INTO",
  "UPDATE",
  "SET",
  "DELETE FROM",
  "CREATE TABLE",
  "ALTER TABLE",
  "VALUES",
  "ON",
];

// Keywords that indicate a clause whose items should be indented
const INDENT_CLAUSES = new Set(["SELECT", "WHERE", "HAVING", "ON", "SET"]);

// Sub-condition keywords that start indented lines under WHERE/HAVING
const CONDITION_CONTINUATIONS = new Set(["AND", "OR"]);

interface StringLiteral {
  placeholder: string;
  value: string;
}

/**
 * Extract string literals and replace them with placeholders so that
 * keywords inside strings are not modified.
 */
function extractStrings(sql: string): { cleaned: string; literals: StringLiteral[] } {
  const literals: StringLiteral[] = [];
  let idx = 0;

  const cleaned = sql.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
    const placeholder = `__STR_LITERAL_${idx}__`;
    literals.push({ placeholder, value: match });
    idx++;
    return placeholder;
  });

  return { cleaned, literals };
}

/**
 * Restore string literals from placeholders.
 */
function restoreStrings(sql: string, literals: StringLiteral[]): string {
  let result = sql;
  for (const { placeholder, value } of literals) {
    result = result.replace(placeholder, value);
  }
  return result;
}

/**
 * Build a regex that matches any of the major keywords as whole words,
 * case-insensitive. Longer keywords are matched first (e.g., LEFT JOIN before JOIN).
 */
function buildKeywordRegex(): RegExp {
  // Sort by length descending so multi-word keywords match first
  const sorted = [...MAJOR_KEYWORDS].sort((a, b) => b.length - a.length);
  const pattern = sorted.map((kw) => kw.replace(/\s+/g, "\\s+")).join("|");
  return new RegExp(`\\b(${pattern})\\b`, "gi");
}

/**
 * Build an anchored (non-global) version of the keyword regex for position-checking.
 */
function buildAnchoredKeywordRegex(): RegExp {
  const sorted = [...MAJOR_KEYWORDS].sort((a, b) => b.length - a.length);
  const pattern = sorted.map((kw) => kw.replace(/\s+/g, "\\s+")).join("|");
  return new RegExp(`^(${pattern})\\b`, "i");
}

/**
 * Insert newline markers before major keywords, but only at top-level
 * (depth 0 parentheses). Keywords inside subqueries are left intact.
 */
function insertKeywordNewlines(sql: string): string {
  const anchoredRegex = buildAnchoredKeywordRegex();
  let result = "";
  let depth = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "(") {
      depth++;
      result += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      result += ch;
      i++;
      continue;
    }

    if (depth === 0) {
      // Only check at word boundaries (start of string, or preceded by whitespace)
      if (i === 0 || /\s/.test(sql[i - 1])) {
        const remaining = sql.slice(i);
        const match = anchoredRegex.exec(remaining);
        if (match) {
          result += `\n${match[0].toUpperCase()}`;
          i += match[0].length;
          continue;
        }
      }
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Format a SQL query string for readability.
 */
export function formatSql(sql: string): string {
  if (!sql.trim()) return "";

  // 1. Extract string literals to protect them
  const { cleaned, literals } = extractStrings(sql);

  // 2. Normalize whitespace (collapse multiple spaces/newlines into single space)
  let normalized = cleaned.replace(/\s+/g, " ").trim();

  // 3. Insert newline markers before major keywords (only at top-level, not inside parentheses)
  normalized = insertKeywordNewlines(normalized);

  // 4. Process line by line
  const rawLines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const outputLines: string[] = [];

  for (const line of rawLines) {
    // Determine which major keyword this line starts with
    const upperLine = line.toUpperCase();
    let matchedKeyword: string | null = null;
    for (const kw of MAJOR_KEYWORDS) {
      if (upperLine.startsWith(kw) && (upperLine.length === kw.length || /\s/.test(upperLine[kw.length]))) {
        matchedKeyword = kw;
        break;
      }
    }

    if (matchedKeyword && INDENT_CLAUSES.has(matchedKeyword)) {
      // For SELECT, WHERE, HAVING, ON, SET: put the keyword on its own line,
      // then indent each item/condition on subsequent lines.
      const rest = line.slice(matchedKeyword.length).trim();

      if (matchedKeyword === "SELECT") {
        outputLines.push(matchedKeyword);
        if (rest) {
          // Split the column list by commas (not inside parentheses)
          const items = splitByCommasTopLevel(rest);
          for (let idx = 0; idx < items.length; idx++) {
            const trailing = idx < items.length - 1 ? "," : "";
            outputLines.push(`  ${items[idx].trim()}${trailing}`);
          }
        }
      } else if (matchedKeyword === "WHERE" || matchedKeyword === "HAVING") {
        outputLines.push(matchedKeyword);
        if (rest) {
          // Split by AND/OR at the top level
          const conditions = splitByConditions(rest);
          for (const cond of conditions) {
            outputLines.push(`  ${cond.trim()}`);
          }
        }
      } else if (matchedKeyword === "ON") {
        // ON conditions: keep on same line if short, otherwise indent
        outputLines.push(matchedKeyword);
        if (rest) {
          const conditions = splitByConditions(rest);
          for (const cond of conditions) {
            outputLines.push(`  ${cond.trim()}`);
          }
        }
      } else if (matchedKeyword === "SET") {
        outputLines.push(matchedKeyword);
        if (rest) {
          const items = splitByCommasTopLevel(rest);
          for (let idx = 0; idx < items.length; idx++) {
            const trailing = idx < items.length - 1 ? "," : "";
            outputLines.push(`  ${items[idx].trim()}${trailing}`);
          }
        }
      }
    } else {
      // Non-indented keyword line (FROM, JOIN, GROUP BY, etc.) — keep as one line
      outputLines.push(line);
    }
  }

  // 5. Restore string literals and trim trailing whitespace on each line
  let result = outputLines.map((l) => l.trimEnd()).join("\n");
  result = restoreStrings(result, literals);

  return result;
}

/**
 * Split a string by commas that are at the top level (not inside parentheses).
 */
function splitByCommasTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

/**
 * Split conditions by AND/OR at the top level (not inside parentheses).
 * The AND/OR keyword is kept at the start of each subsequent part.
 */
function splitByConditions(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  const upper = s.toUpperCase();

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth--;
      current += ch;
      continue;
    }

    if (depth === 0) {
      // Check for AND (with word boundary)
      if (
        upper.slice(i, i + 4) === "AND " &&
        (i === 0 || /\s/.test(s[i - 1]))
      ) {
        if (current.trim()) parts.push(current.trim());
        current = "AND ";
        i += 3; // skip "AND " (loop will increment i)
        continue;
      }
      // Check for OR (with word boundary)
      if (
        upper.slice(i, i + 3) === "OR " &&
        (i === 0 || /\s/.test(s[i - 1]))
      ) {
        if (current.trim()) parts.push(current.trim());
        current = "OR ";
        i += 2; // skip "OR " (loop will increment i)
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}
