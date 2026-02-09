// Conversation Templates — shown in the chat area when datasets are loaded
// but no messages exist yet. Provides pre-built analysis workflows that
// populate the suggested prompts area with relevant starter questions.

import { useCallback, useState } from "react";
import {
  getConversationTemplates,
  type ConversationTemplate,
} from "@/utils/conversationTemplates";
import { useChatStore } from "@/stores/chatStore";

interface ConversationTemplatesProps {
  onSendMessage: (message: string) => void;
  datasetCount: number;
}

/** Renders an SVG icon from a path data string. */
function TemplateIcon({ pathData }: { pathData: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={pathData} />
    </svg>
  );
}

export function ConversationTemplates({
  onSendMessage,
  datasetCount,
}: ConversationTemplatesProps) {
  const templates = getConversationTemplates();
  const [selectedTemplate, setSelectedTemplate] =
    useState<ConversationTemplate | null>(null);
  const setTemplatePrompts = useChatStore((s) => s.setTemplatePrompts);

  const handleTemplateClick = useCallback(
    (template: ConversationTemplate) => {
      if (template.requiredDatasets > datasetCount) return;
      setSelectedTemplate(template);
      // Also set template prompts in the store so SuggestedPrompts picks them up
      setTemplatePrompts(template.suggestedPrompts);
    },
    [datasetCount, setTemplatePrompts]
  );

  const handlePromptClick = useCallback(
    (prompt: string) => {
      // Clear template prompts and selection
      setTemplatePrompts([]);
      setSelectedTemplate(null);
      onSendMessage(prompt);
    },
    [onSendMessage, setTemplatePrompts]
  );

  const handleBackClick = useCallback(() => {
    setSelectedTemplate(null);
    setTemplatePrompts([]);
  }, [setTemplatePrompts]);

  // If a template is selected, show its prompts
  if (selectedTemplate) {
    return (
      <div
        data-testid="conversation-templates"
        className="flex flex-col items-center gap-3 px-4 py-6"
      >
        <button
          data-testid="templates-back-btn"
          onClick={handleBackClick}
          className="self-start flex items-center gap-1 text-xs cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All templates
        </button>

        <div className="text-center">
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-text)" }}
          >
            {selectedTemplate.name}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            {selectedTemplate.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
          {selectedTemplate.suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              data-testid="template-prompt-chip"
              className="px-4 py-2 rounded-full text-sm cursor-pointer"
              style={{
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              onClick={() => handlePromptClick(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Show the template cards grid
  return (
    <div
      data-testid="conversation-templates"
      className="flex flex-col items-center gap-3 px-4 py-6"
    >
      <p
        className="text-xs font-medium"
        style={{ color: "var(--color-text-muted)" }}
      >
        Or start with a template
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
        {templates.map((template) => {
          const disabled = template.requiredDatasets > datasetCount;
          return (
            <button
              key={template.id}
              data-testid={`conversation-template-${template.id}`}
              onClick={() => handleTemplateClick(template)}
              disabled={disabled}
              className="flex items-start gap-2 p-3 rounded-lg border text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              <span
                className="shrink-0 mt-0.5"
                style={{ color: "var(--color-accent)" }}
              >
                <TemplateIcon pathData={template.icon} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold truncate">
                    {template.name}
                  </span>
                  {template.requiredDatasets > 1 && (
                    <span
                      data-testid={`template-badge-${template.id}`}
                      className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium"
                      style={{
                        backgroundColor: disabled
                          ? "var(--color-border)"
                          : "var(--color-accent)",
                        color: disabled
                          ? "var(--color-text-muted)"
                          : "#fff",
                      }}
                    >
                      {template.requiredDatasets}+ datasets
                    </span>
                  )}
                </div>
                <p
                  className="text-[11px] mt-0.5 leading-snug"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {template.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
