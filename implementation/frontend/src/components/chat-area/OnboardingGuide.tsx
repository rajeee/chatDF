// Implements: spec/frontend/chat_area/onboarding/plan.md#component-onboardingguide
//
// Shown when no datasets AND no messages (parent controls mount/unmount).
// Before data loaded: step-by-step guide + "Try with sample data" button.
// After data loaded: example prompt chips.

import { useState } from "react";
import { useDatasetStore } from "@/stores/datasetStore";
import { SAMPLE_DATASET_URL, SAMPLE_PROMPT_CHIPS } from "@/lib/constants";

interface OnboardingGuideProps {
  onSendPrompt: (text: string) => void;
}

export function OnboardingGuide({ onSendPrompt }: OnboardingGuideProps) {
  const datasets = useDatasetStore((s) => s.datasets);
  const addDataset = useDatasetStore((s) => s.addDataset);
  const [sampleLoading, setSampleLoading] = useState(false);

  const hasDatasets = datasets.length > 0;

  function handleTrySample() {
    setSampleLoading(true);
    addDataset({
      id: `ds-sample-${Date.now()}`,
      url: SAMPLE_DATASET_URL,
      name: "iris",
      row_count: 0,
      column_count: 0,
      schema_json: "{}",
      status: "loading",
      error_message: null,
    });
  }

  return (
    <div
      data-testid="onboarding-guide"
      className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-6"
    >
      {/* Title and description */}
      <h1
        className="text-3xl font-bold onboarding-fade-in"
        style={{ color: "var(--color-text)" }}
      >
        ChatDF
      </h1>
      <p
        className="text-base max-w-md text-center onboarding-fade-in-delayed"
        style={{ color: "var(--color-text-muted)" }}
      >
        Chat with your data using natural language
      </p>

      {/* Before data loaded: step-by-step guide + CTA */}
      {!hasDatasets && (
        <>
          <ol className="space-y-4 text-sm max-w-sm w-full onboarding-fade-in-delayed-2">
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
              >
                1
              </span>
              <span style={{ color: "var(--color-text)" }}>
                <strong>Add a dataset</strong> &mdash; drag a parquet file URL
                or click the + button
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
              >
                2
              </span>
              <span style={{ color: "var(--color-text)" }}>
                <strong>Ask questions</strong> &mdash; type natural language
                queries
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                }}
              >
                3
              </span>
              <span style={{ color: "var(--color-text)" }}>
                <strong>Explore results</strong> &mdash; view tables, charts,
                SQL
              </span>
            </li>
          </ol>

          <button
            onClick={handleTrySample}
            disabled={sampleLoading}
            className="prompt-chip px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 onboarding-fade-in-delayed-2"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            {sampleLoading ? "Loading..." : "Try with sample data"}
          </button>
        </>
      )}

      {/* After data loaded: prompt chips */}
      {hasDatasets && (
        <div className="flex flex-wrap gap-2 justify-center max-w-lg onboarding-fade-in-delayed">
          {SAMPLE_PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => onSendPrompt(chip)}
              className="prompt-chip px-4 py-2 rounded-full text-sm cursor-pointer"
              style={{
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
