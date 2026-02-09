// SQL autocomplete hook for the RunSqlPanel textarea.
// Provides keyword, table, and column suggestions based on:
// - Standard SQL keywords
// - Loaded datasets (table names) for the active conversation
// - Column names from dataset schemas (context-aware after FROM/JOIN or table.prefix)

import { useState, useCallback } from "react";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";

export interface Suggestion {
  text: string;       // the completion text to insert
  label: string;      // display label
  kind: "keyword" | "table" | "column";
  detail?: string;    // e.g. column type or table dimensions
}

export const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
  "IS", "NULL", "AS", "ON", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "CROSS", "GROUP", "BY", "ORDER", "ASC", "DESC", "HAVING", "LIMIT",
  "OFFSET", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE",
  "WHEN", "THEN", "ELSE", "END", "UNION", "ALL", "EXISTS", "INSERT",
  "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE",
  "ALTER", "DROP", "INDEX", "WITH", "CAST", "COALESCE", "NULLIF",
  "TRUE", "FALSE",
];

export function parseSchema(schemaJson: string): { name: string; type: string }[] {
  try {
    const parsed = JSON.parse(schemaJson);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.columns)) return parsed.columns;
    return [];
  } catch { return []; }
}

export interface AutocompleteState {
  suggestions: Suggestion[];
  selectedIndex: number;
  isOpen: boolean;
  handleInput: (value: string, cursorPosition: number, textareaEl: HTMLTextAreaElement) => void;
  accept: (value: string, cursorPosition: number, suggestion: Suggestion) => { newValue: string; newCursorPos: number };
  close: () => void;
  moveSelection: (delta: number) => void;
}

export function useSqlAutocomplete(): AutocompleteState {
  // Get datasets for current conversation
  const conversationId = useChatStore((s) => s.activeConversationId);
  const allDatasets = useDatasetStore((s) => s.datasets);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // Core suggestion computation - also exported for testing via the hook
  const computeSuggestions = useCallback((
    value: string,
    cursorPosition: number
  ): Suggestion[] => {
    const datasets = conversationId
      ? allDatasets.filter(d => d.conversation_id === conversationId && d.status === "ready")
      : [];

    // Find the current word being typed
    const beforeCursor = value.substring(0, cursorPosition);
    const wordMatch = beforeCursor.match(/[\w.]*$/);
    const currentWord = wordMatch ? wordMatch[0] : "";

    if (currentWord.length < 1) return [];

    const upperWord = currentWord.toUpperCase();
    const results: Suggestion[] = [];

    // Check if we're in a "table.column" pattern
    const dotMatch = currentWord.match(/^(\w+)\.(\w*)$/);
    if (dotMatch) {
      const tableName = dotMatch[1];
      const colPrefix = (dotMatch[2] || "").toUpperCase();
      const dataset = datasets.find(d => d.name.toUpperCase() === tableName.toUpperCase());
      if (dataset) {
        const columns = parseSchema(dataset.schema_json);
        for (const col of columns) {
          if (!colPrefix || col.name.toUpperCase().startsWith(colPrefix)) {
            results.push({
              text: col.name,
              label: `${tableName}.${col.name}`,
              kind: "column",
              detail: col.type,
            });
          }
        }
      }
      return results.slice(0, 10);
    }

    // Check context for table/column suggestions
    const afterFrom = /\b(FROM|JOIN)\s+\w*$/i.test(beforeCursor);

    // Always suggest matching tables
    for (const ds of datasets) {
      if (ds.name.toUpperCase().startsWith(upperWord)) {
        results.push({
          text: ds.name,
          label: ds.name,
          kind: "table",
          detail: `${ds.row_count.toLocaleString()} rows`,
        });
      }
    }

    // If after FROM/JOIN, prioritize tables (already added above)
    // Otherwise also add column names from all tables and keywords
    if (!afterFrom) {
      // Add column suggestions from all datasets
      for (const ds of datasets) {
        const columns = parseSchema(ds.schema_json);
        for (const col of columns) {
          if (col.name.toUpperCase().startsWith(upperWord)) {
            // Avoid duplicates
            if (!results.some(r => r.text === col.name && r.kind === "column")) {
              results.push({
                text: col.name,
                label: col.name,
                kind: "column",
                detail: `${col.type} (${ds.name})`,
              });
            }
          }
        }
      }

      // Add keyword suggestions
      for (const kw of SQL_KEYWORDS) {
        if (kw.startsWith(upperWord)) {
          results.push({
            text: kw,
            label: kw,
            kind: "keyword",
          });
        }
      }
    }

    // Sort: tables first (if after FROM), then columns, then keywords
    results.sort((a, b) => {
      const kindOrder = { table: 0, column: 1, keyword: 2 };
      return kindOrder[a.kind] - kindOrder[b.kind];
    });

    return results.slice(0, 10); // cap at 10
  }, [conversationId, allDatasets]);

  const handleInput = useCallback((
    value: string,
    cursorPosition: number,
    _textareaEl: HTMLTextAreaElement
  ) => {
    const newSuggestions = computeSuggestions(value, cursorPosition);
    setSuggestions(newSuggestions);
    setSelectedIndex(0);
    setIsOpen(newSuggestions.length > 0);
  }, [computeSuggestions]);

  const accept = useCallback((
    value: string,
    cursorPosition: number,
    suggestion: Suggestion
  ): { newValue: string; newCursorPos: number } => {
    const beforeCursor = value.substring(0, cursorPosition);
    const afterCursor = value.substring(cursorPosition);

    // Find how much of the current word to replace
    const wordMatch = beforeCursor.match(/[\w.]*$/);
    const currentWord = wordMatch ? wordMatch[0] : "";

    // For "table.col" completions, only replace the column part
    const dotMatch = currentWord.match(/^(\w+)\.(\w*)$/);
    let insertText: string;
    let replaceLength: number;

    if (dotMatch && suggestion.kind === "column") {
      replaceLength = dotMatch[2].length;
      insertText = suggestion.text;
    } else {
      replaceLength = currentWord.length;
      insertText = suggestion.text;
    }

    const newBefore = beforeCursor.substring(0, beforeCursor.length - replaceLength) + insertText;
    const newValue = newBefore + afterCursor;

    return {
      newValue,
      newCursorPos: newBefore.length,
    };
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSuggestions([]);
    setSelectedIndex(0);
  }, []);

  const moveSelection = useCallback((delta: number) => {
    setSelectedIndex(prev => {
      const next = prev + delta;
      if (next < 0) return suggestions.length - 1;
      if (next >= suggestions.length) return 0;
      return next;
    });
  }, [suggestions.length]);

  return {
    suggestions,
    selectedIndex,
    isOpen,
    handleInput,
    accept,
    close,
    moveSelection,
  };
}
