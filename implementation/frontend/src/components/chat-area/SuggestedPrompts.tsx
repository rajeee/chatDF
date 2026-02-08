// Implements: spec/frontend/chat_area/onboarding/plan.md (SuggestedPrompts companion)
//
// Shown when datasets exist but no messages yet.
// Displays contextual prompt suggestions based on loaded dataset names.

interface SuggestedPromptsProps {
  datasetNames: string[];
  onSendPrompt: (text: string) => void;
}

function buildSuggestions(datasetNames: string[]): string[] {
  const name = datasetNames[0] ?? "dataset";
  return [
    `Show me the first 5 rows of ${name}`,
    `How many rows are in ${name}?`,
    `Describe the columns in ${name}`,
    `What are the summary statistics for ${name}?`,
  ];
}

export function SuggestedPrompts({
  datasetNames,
  onSendPrompt,
}: SuggestedPromptsProps) {
  const suggestions = buildSuggestions(datasetNames);

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
