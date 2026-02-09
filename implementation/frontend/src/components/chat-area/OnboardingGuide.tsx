// Implements: spec/frontend/chat_area/onboarding/plan.md#component-onboardingguide
//
// Shown when no datasets AND no messages (parent controls mount/unmount).
// Displays template cards that let users quickly start exploring public datasets.
// Clicking a template card loads its datasets and sets up starter prompts.

import { useCallback, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";
import { apiPost } from "@/api/client";
import {
  CONVERSATION_TEMPLATES,
  type ConversationTemplate,
} from "@/lib/constants";

interface OnboardingGuideProps {
  onSendPrompt: (text: string) => void;
}

export function OnboardingGuide({ onSendPrompt: _onSendPrompt }: OnboardingGuideProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setTemplatePrompts = useChatStore((s) => s.setTemplatePrompts);
  const addDataset = useDatasetStore((s) => s.addDataset);
  const openPresetModal = useUiStore((s) => s.openPresetModal);

  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);

  const handleTemplateClick = useCallback(
    async (template: ConversationTemplate) => {
      // NREL preset trigger — just open the modal
      if (template.isPresetTrigger) {
        openPresetModal();
        return;
      }

      if (loadingTemplateId) return; // prevent double-click
      setLoadingTemplateId(template.id);

      try {
        // 1. Create conversation if needed
        let convId = activeConversationId;
        if (!convId) {
          const newConv = await apiPost<{ id: string }>("/conversations");
          convId = newConv.id;
          setActiveConversation(convId);
        }

        // 2. Load each dataset
        for (const ds of template.datasets) {
          // Add loading placeholder to store
          const placeholderId = `template-loading-${template.id}-${ds.name}`;
          addDataset({
            id: placeholderId,
            conversation_id: convId!,
            url: ds.url,
            name: ds.name,
            row_count: 0,
            column_count: 0,
            schema_json: "{}",
            status: "loading",
            error_message: null,
          });

          try {
            const response = await apiPost<{ dataset_id: string; status: string }>(
              `/conversations/${convId}/datasets`,
              { url: ds.url, name: ds.name }
            );

            // Update placeholder with real ID (WS event will update to "ready")
            const dsState = useDatasetStore.getState();
            dsState.updateDataset(placeholderId, { id: response.dataset_id });
          } catch (err: unknown) {
            // Update placeholder to error state
            const dsState = useDatasetStore.getState();
            const message = err instanceof Error ? err.message : "Failed to load";
            dsState.updateDataset(placeholderId, {
              status: "error",
              error_message: message,
            });
          }
        }

        // 3. Set template-specific prompts for SuggestedPrompts to pick up
        if (template.prompts.length > 0) {
          setTemplatePrompts(template.prompts);
        }
      } catch (err) {
        console.error("Failed to load template:", err);
      } finally {
        setLoadingTemplateId(null);
      }
    },
    [activeConversationId, setActiveConversation, addDataset, openPresetModal, setTemplatePrompts, loadingTemplateId]
  );

  return (
    <div
      data-testid="onboarding-guide"
      className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-8"
    >
      {/* Title */}
      <div className="text-center space-y-2 onboarding-fade-in">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--color-text)" }}
        >
          chatDF
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Ask questions about any dataset
        </p>
      </div>

      {/* Template cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-xl onboarding-fade-in-delayed">
        {CONVERSATION_TEMPLATES.map((template) => (
          <button
            key={template.id}
            data-testid={`template-card-${template.id}`}
            onClick={() => handleTemplateClick(template)}
            disabled={loadingTemplateId !== null}
            className="flex flex-col items-start gap-1.5 p-4 rounded-lg border text-left transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--color-surface)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-surface)";
            }}
          >
            <span className="text-2xl" aria-hidden="true">
              {template.icon}
            </span>
            <span className="text-sm font-semibold">
              {template.name}
            </span>
            <span
              className="text-xs leading-relaxed"
              style={{ color: "var(--color-text-muted)" }}
            >
              {template.description}
            </span>
            {loadingTemplateId === template.id && (
              <span
                className="text-xs mt-1"
                style={{ color: "var(--color-accent)" }}
              >
                Loading...
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Subtitle */}
      <p
        className="text-sm onboarding-fade-in-delayed-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        ...or paste any Parquet URL to start
      </p>
    </div>
  );
}
