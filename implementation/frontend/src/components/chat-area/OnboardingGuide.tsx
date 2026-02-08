// Implements: spec/frontend/chat_area/onboarding/plan.md#component-onboardingguide
//
// Shown when no datasets AND no messages (parent controls mount/unmount).
// Before data loaded: title + "Try with preset sources" button + "or load your own data".
// After data loaded: example prompt chips.

import { useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";
import { SAMPLE_PROMPT_CHIPS } from "@/lib/constants";

interface OnboardingGuideProps {
  onSendPrompt: (text: string) => void;
}

export function OnboardingGuide({ onSendPrompt }: OnboardingGuideProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const allDatasets = useDatasetStore((s) => s.datasets);
  const datasets = useMemo(
    () => filterDatasetsByConversation(allDatasets, activeConversationId),
    [allDatasets, activeConversationId]
  );
  const openPresetModal = useUiStore((s) => s.openPresetModal);

  const hasDatasets = datasets.length > 0;

  return (
    <div
      data-testid="onboarding-guide"
      className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-6"
    >
      {/* Title */}
      <h1
        className="text-3xl font-bold onboarding-fade-in"
        style={{ color: "var(--color-text)" }}
      >
        chatDF
      </h1>

      {/* Before data loaded: preset sources CTA */}
      {!hasDatasets && (
        <div className="flex flex-col items-center gap-4 onboarding-fade-in-delayed">
          <button
            onClick={openPresetModal}
            className="prompt-chip px-6 py-2.5 rounded-lg text-sm font-medium onboarding-fade-in-delayed-2"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            Try with preset sources
          </button>
          <p
            className="text-sm onboarding-fade-in-delayed-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            ...or load your own data
          </p>
        </div>
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
