// Implements: spec/frontend/chat_area/onboarding/plan.md (SuggestedPrompts companion)
//
// Shown when datasets exist but no messages yet.
// Displays contextual prompt suggestions based on loaded dataset schemas.
// Uses column names and types to generate smart, schema-aware questions.

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

export function buildSmartSuggestions(datasets: Dataset[]): string[] {
  if (datasets.length === 0) return [];

  const ds = datasets[0];
  const columns = parseSchema(ds.schema_json);
  const name = ds.name;

  // If schema is empty or unparseable, fall back to generic suggestions
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

  // Always start with a preview suggestion
  suggestions.push(`Show me the first 5 rows of ${name}`);

  // Numeric + categorical → group-by aggregation
  if (numericCols.length > 0 && categoricalCols.length > 0) {
    const numCol = numericCols[0];
    const catCol = categoricalCols[0];
    suggestions.push(
      `What is the average ${formatColumnName(numCol.name)} by ${formatColumnName(catCol.name)}?`
    );
  } else if (numericCols.length > 0) {
    // Numeric only → summary stats
    const numCol = numericCols[0];
    suggestions.push(
      `What are the min, max, and average ${formatColumnName(numCol.name)}?`
    );
  }

  // Date column → trend question
  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateCol = dateCols[0];
    const numCol = numericCols[0];
    suggestions.push(
      `Show me the trend of ${formatColumnName(numCol.name)} over ${formatColumnName(dateCol.name)}`
    );
  }

  // Categorical → distribution
  if (categoricalCols.length > 0) {
    const catCol = categoricalCols[0];
    suggestions.push(
      `What is the distribution of ${formatColumnName(catCol.name)}?`
    );
  }

  // Fill remaining slots up to 4 with useful generic questions
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

export function SuggestedPrompts({
  datasets,
  onSendPrompt,
}: SuggestedPromptsProps) {
  const suggestions = buildSmartSuggestions(datasets);

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
      <div className="flex flex-wrap gap-2 justify-center max-w-lg onboarding-fade-in-delayed">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSendPrompt(suggestion)}
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
