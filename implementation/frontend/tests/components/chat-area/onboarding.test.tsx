// Tests: spec/frontend/chat_area/onboarding/spec.md
// Verifies: spec/frontend/chat_area/onboarding/plan.md
//
// OB-1: Renders onboarding when no datasets and no messages
// OB-2: "Try with preset sources" button opens preset modal
// OB-3: Prompt chips appear after data loads
// OB-4: Hidden when messages exist
// OB-5: SuggestedPrompts shown when datasets exist but no messages
// OB-6: Clicking prompt chip calls onSendPrompt

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../helpers/render";
import {
  resetAllStores,
  setDatasetsLoaded,
  setChatIdle,
  type Dataset,
} from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { OnboardingGuide } from "@/components/chat-area/OnboardingGuide";
import { SuggestedPrompts } from "@/components/chat-area/SuggestedPrompts";
import { ChatArea } from "@/components/chat-area/ChatArea";
import { useUiStore } from "@/stores/uiStore";
import { SAMPLE_DATASET_URL, SAMPLE_PROMPT_CHIPS } from "@/lib/constants";

const IRIS_DATASET: Dataset = {
  id: "ds-iris",
  conversation_id: "conv-1",
  url: SAMPLE_DATASET_URL,
  name: "iris",
  row_count: 150,
  column_count: 5,
  schema_json: '{"columns":["sepal_length","sepal_width","petal_length","petal_width","species"]}',
  status: "ready",
  error_message: null,
};

beforeEach(() => {
  resetAllStores();
  useChatStore.setState({ activeConversationId: "conv-1" });
});

describe("OB-1: Renders simplified onboarding when no datasets and no messages", () => {
  it("renders the app title", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();
    expect(screen.getByText("chatDF")).toBeInTheDocument();
  });

  it("renders the Try with preset sources button", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const button = screen.getByRole("button", { name: /Try with preset sources/ });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("renders the 'or load your own data' text", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(screen.getByText(/or load your own data/)).toBeInTheDocument();
  });

  it("does not show the old numbered step list", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(screen.queryByText(/Add a dataset/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask questions/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explore results/)).not.toBeInTheDocument();
  });

  it("does not show prompt chips before data is loaded", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    for (const chip of SAMPLE_PROMPT_CHIPS) {
      expect(screen.queryByText(chip)).not.toBeInTheDocument();
    }
  });
});

describe("OB-2: Try with preset sources button opens preset modal", () => {
  it("opens preset modal when clicked", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();
    const openPresetSpy = vi.spyOn(useUiStore.getState(), "openPresetModal");

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const button = screen.getByRole("button", { name: /Try with preset sources/ });
    await user.click(button);

    expect(openPresetSpy).toHaveBeenCalledTimes(1);

    openPresetSpy.mockRestore();
  });
});

describe("OB-3: Prompt chips appear after data loads", () => {
  it("shows prompt chips when datasets exist in store", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    for (const chip of SAMPLE_PROMPT_CHIPS) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it("hides the Try with preset sources button when datasets are loaded", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(
      screen.queryByRole("button", { name: /Try with preset sources/ })
    ).not.toBeInTheDocument();
  });

  it("hides the 'or load your own data' text when datasets are loaded", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(screen.queryByText(/or load your own data/)).not.toBeInTheDocument();
  });
});

describe("OB-4: Hidden when messages exist", () => {
  it("parent ChatArea does not render onboarding when messages exist", () => {
    // This is tested through the ChatArea in layout.test.tsx.
    // Here we confirm the component itself renders when mounted.
    setChatIdle("conv-1", [
      {
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      },
    ]);

    // OnboardingGuide should not be rendered by the parent when messages exist.
    // We test the parent behavior: ChatArea shows message-list-scroll.
    renderWithProviders(<ChatArea />);

    expect(screen.queryByTestId("onboarding-guide")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-list-scroll")).toBeInTheDocument();
  });
});

describe("OB-5: SuggestedPrompts shown when datasets exist but no messages", () => {
  it("renders suggested prompts with dataset-aware text", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts
        datasetNames={[IRIS_DATASET.name]}
        onSendPrompt={onSendPrompt}
      />
    );

    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();
    // Should have clickable prompt suggestions
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("includes dataset name in at least one suggestion", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts
        datasetNames={[IRIS_DATASET.name]}
        onSendPrompt={onSendPrompt}
      />
    );

    // At least one suggestion should reference the dataset
    const container = screen.getByTestId("suggested-prompts");
    expect(container.textContent).toContain("iris");
  });
});

describe("OB-ANIM: Prompt chips and onboarding have animation classes", () => {
  it("prompt chips in OnboardingGuide have prompt-chip class for hover effects", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const chipText = SAMPLE_PROMPT_CHIPS[0];
    const chip = screen.getByText(chipText);
    expect(chip).toHaveClass("prompt-chip");
  });

  it("prompt chips in SuggestedPrompts have prompt-chip class for hover effects", () => {
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts
        datasetNames={[IRIS_DATASET.name]}
        onSendPrompt={onSendPrompt}
      />
    );

    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      expect(button).toHaveClass("prompt-chip");
    }
  });

  it("OnboardingGuide title has onboarding-fade-in class", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const title = screen.getByText("chatDF");
    expect(title).toHaveClass("onboarding-fade-in");
  });

  it("Try with preset sources button has prompt-chip class", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const button = screen.getByRole("button", { name: /Try with preset sources/ });
    expect(button).toHaveClass("prompt-chip");
  });

  it("SuggestedPrompts header text has onboarding-fade-in class", () => {
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts
        datasetNames={[IRIS_DATASET.name]}
        onSendPrompt={onSendPrompt}
      />
    );

    const header = screen.getByText("Try asking a question about your data");
    expect(header).toHaveClass("onboarding-fade-in");
  });
});

describe("OB-6: Clicking prompt chip calls onSendPrompt", () => {
  it("calls onSendPrompt with chip text in OnboardingGuide", async () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const chipText = SAMPLE_PROMPT_CHIPS[0];
    const chip = screen.getByText(chipText);
    await user.click(chip);

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).toHaveBeenCalledWith(chipText);
  });

  it("calls onSendPrompt with suggestion text in SuggestedPrompts", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts
        datasetNames={[IRIS_DATASET.name]}
        onSendPrompt={onSendPrompt}
      />
    );

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(typeof onSendPrompt.mock.calls[0][0]).toBe("string");
  });
});
