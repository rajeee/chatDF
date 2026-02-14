// Implements: spec/frontend/chat_area/onboarding/plan.md (SuggestedPrompts companion)
//
// Shown when datasets exist but no messages yet.
// Displays contextual prompt suggestions based on loaded dataset schemas.
// Uses column names and types to generate smart, schema-aware questions.

import { useCallback, useRef, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import type { Dataset } from "@/stores/datasetStore";

interface SchemaColumn {
  name: string;
  type: string;
}

interface SuggestedPromptsProps {
  datasets: Dataset[];
  onSendPrompt: (text: string) => void;
}

const NUMERIC_TYPES = new Set([
  "Int8", "Int16", "Int32", "Int64",
  "UInt8", "UInt16", "UInt32", "UInt64",
  "Float32", "Float64",
  "Decimal",
]);

const DATE_TYPES = new Set(["Date", "Datetime", "DateTime"]);

const CATEGORICAL_TYPES = new Set(["String", "Utf8", "Categorical", "Boolean"]);

function parseSchema(schemaJson: string): SchemaColumn[] {
  try {
    const parsed = JSON.parse(schemaJson);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.columns)) return parsed.columns;
    return [];
  } catch {
    return [];
  }
}

function isNumeric(type: string): boolean {
  return NUMERIC_TYPES.has(type);
}

function isDate(type: string): boolean {
  return DATE_TYPES.has(type);
}

function isCategorical(type: string): boolean {
  return CATEGORICAL_TYPES.has(type);
}

function formatColumnName(name: string): string {
  return name.replace(/_/g, " ");
}

function buildSingleDatasetSuggestions(ds: Dataset): string[] {
  const columns = parseSchema(ds.schema_json);
  const name = ds.name;

  if (columns.length === 0) {
    return [
      `Show me the first 5 rows of ${name}`,
      `How many rows are in ${name}?`,
      `Describe the columns in ${name}`,
      `What are the summary statistics for ${name}?`,
    ];
  }

  const numericCols = columns.filter((c) => isNumeric(c.type));
  const dateCols = columns.filter((c) => isDate(c.type));
  const categoricalCols = columns.filter((c) => isCategorical(c.type));

  const suggestions: string[] = [];

  suggestions.push(`Show me the first 5 rows of ${name}`);

  if (numericCols.length > 0 && categoricalCols.length > 0) {
    const numCol = numericCols[0];
    const catCol = categoricalCols[0];
    suggestions.push(
      `What is the average ${formatColumnName(numCol.name)} by ${formatColumnName(catCol.name)}?`
    );
  } else if (numericCols.length > 0) {
    const numCol = numericCols[0];
    suggestions.push(
      `What are the min, max, and average ${formatColumnName(numCol.name)}?`
    );
  }

  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateCol = dateCols[0];
    const numCol = numericCols[0];
    suggestions.push(
      `Show me the trend of ${formatColumnName(numCol.name)} over ${formatColumnName(dateCol.name)}`
    );
  }

  if (categoricalCols.length > 0) {
    const catCol = categoricalCols[0];
    suggestions.push(
      `What is the distribution of ${formatColumnName(catCol.name)}?`
    );
  }

  return suggestions;
}

function buildCrossDatasetSuggestion(datasets: Dataset[]): string | null {
  if (datasets.length < 2) return null;

  const ds1 = datasets[0];
  const ds2 = datasets[1];
  const cols1 = parseSchema(ds1.schema_json);
  const cols2 = parseSchema(ds2.schema_json);

  if (cols1.length === 0 || cols2.length === 0) return null;

  // Find common columns between datasets (potential join keys)
  const colNames1 = new Set(cols1.map((c) => c.name.toLowerCase()));
  const commonCols = cols2.filter((c) => colNames1.has(c.name.toLowerCase()));

  if (commonCols.length > 0) {
    return `Compare ${ds1.name} and ${ds2.name} by joining on ${formatColumnName(commonCols[0].name)}`;
  }

  return `Compare the summary statistics of ${ds1.name} and ${ds2.name}`;
}

export function buildSmartSuggestions(datasets: Dataset[]): string[] {
  if (datasets.length === 0) return [];

  if (datasets.length === 1) {
    // Single dataset: use existing logic
    const suggestions = buildSingleDatasetSuggestions(datasets[0]);
    const name = datasets[0].name;
    const fillers = [
      `What are the summary statistics for ${name}?`,
      `How many rows are in ${name}?`,
      `Which columns have missing values in ${name}?`,
    ];
    for (const filler of fillers) {
      if (suggestions.length >= 4) break;
      if (!suggestions.includes(filler)) {
        suggestions.push(filler);
      }
    }
    return suggestions.slice(0, 4);
  }

  // Multiple datasets: mix suggestions from each + cross-dataset
  const suggestions: string[] = [];

  // Add one suggestion per dataset (round-robin)
  const perDataset = datasets.map((ds) => buildSingleDatasetSuggestions(ds));
  for (let i = 0; suggestions.length < 3 && i < 4; i++) {
    for (const dsPrompts of perDataset) {
      if (suggestions.length >= 3) break;
      if (dsPrompts[i]) {
        suggestions.push(dsPrompts[i]);
      }
    }
  }

  // Add a cross-dataset comparison suggestion
  const crossSuggestion = buildCrossDatasetSuggestion(datasets);
  if (crossSuggestion) {
    suggestions.push(crossSuggestion);
  }

  return suggestions.slice(0, 4);
}

export function SuggestedPrompts({
  datasets,
  onSendPrompt,
}: SuggestedPromptsProps) {
  const templatePrompts = useChatStore((s) => s.templatePrompts);
  const setTemplatePrompts = useChatStore((s) => s.setTemplatePrompts);

  // Template prompts take priority over schema-generated suggestions
  const schemaSuggestions = buildSmartSuggestions(datasets);
  const suggestions =
    templatePrompts.length > 0 ? templatePrompts : schemaSuggestions;

  const handleSendPrompt = useCallback(
    (text: string) => {
      // Clear template prompts once the user sends a message
      if (templatePrompts.length > 0) {
        setTemplatePrompts([]);
      }
      onSendPrompt(text);
    },
    [templatePrompts, setTemplatePrompts, onSendPrompt]
  );

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (suggestions.length === 0) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next =
          focusedIndex < 0 ? 0 : (focusedIndex + 1) % suggestions.length;
        setFocusedIndex(next);
        chipRefs.current[next]?.focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev =
          focusedIndex <= 0
            ? suggestions.length - 1
            : focusedIndex - 1;
        setFocusedIndex(prev);
        chipRefs.current[prev]?.focus();
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        handleSendPrompt(suggestions[focusedIndex]);
      }
    },
    [focusedIndex, suggestions, handleSendPrompt]
  );

  return (
    <div
      data-testid="suggested-prompts"
      className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-4"
    >
      <p
        className="text-sm font-medium onboarding-fade-in"
        style={{ color: "var(--color-text-muted)" }}
      >
        Try asking a question about your data
      </p>
      <div
        role="listbox"
        aria-label="Suggested prompts"
        onKeyDown={handleKeyDown}
        className="flex flex-wrap gap-2 justify-center max-w-lg onboarding-fade-in-delayed"
      >
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion}
            ref={(el) => {
              chipRefs.current[index] = el;
            }}
            role="option"
            aria-selected={focusedIndex === index}
            tabIndex={focusedIndex === index || (focusedIndex < 0 && index === 0) ? 0 : -1}
            onClick={() => handleSendPrompt(suggestion)}
            onFocus={() => setFocusedIndex(index)}
            className="prompt-chip px-4 py-2 rounded-full text-sm cursor-pointer"
            style={{
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
