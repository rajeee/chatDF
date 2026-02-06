// Tests: spec/frontend/chat_area/onboarding/spec.md
// Verifies: spec/frontend/chat_area/onboarding/plan.md
//
// OB-1: Renders onboarding when no datasets and no messages
// OB-2: "Try with sample data" button triggers dataset addition
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
import { OnboardingGuide } from "@/components/chat-area/OnboardingGuide";
import { SuggestedPrompts } from "@/components/chat-area/SuggestedPrompts";
import { ChatArea } from "@/components/chat-area/ChatArea";
import { useDatasetStore } from "@/stores/datasetStore";
import { SAMPLE_DATASET_URL, SAMPLE_PROMPT_CHIPS } from "@/lib/constants";

const IRIS_DATASET: Dataset = {
  id: "ds-iris",
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
});

describe("OB-1: Renders onboarding when no datasets and no messages", () => {
  it("renders the step-by-step guide", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();
    expect(screen.getByText(/Add a dataset/)).toBeInTheDocument();
    expect(screen.getByText(/Ask questions/)).toBeInTheDocument();
    expect(screen.getByText(/Explore results/)).toBeInTheDocument();
  });

  it("renders the app title and description", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(screen.getByText("ChatDF")).toBeInTheDocument();
    expect(
      screen.getByText(/Chat with your data using natural language/)
    ).toBeInTheDocument();
  });

  it("renders the Try with sample data button", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const button = screen.getByRole("button", { name: /Try with sample data/ });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("does not show prompt chips before sample data is loaded", () => {
    const onSendPrompt = vi.fn();
    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    for (const chip of SAMPLE_PROMPT_CHIPS) {
      expect(screen.queryByText(chip)).not.toBeInTheDocument();
    }
  });
});

describe("OB-2: Try with sample data button triggers dataset addition", () => {
  it("calls datasetStore.addDataset when clicked", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();
    const addDatasetSpy = vi.spyOn(useDatasetStore.getState(), "addDataset");

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const button = screen.getByRole("button", { name: /Try with sample data/ });
    await user.click(button);

    expect(addDatasetSpy).toHaveBeenCalledTimes(1);
    const addedDataset = addDatasetSpy.mock.calls[0][0];
    expect(addedDataset.url).toBe(SAMPLE_DATASET_URL);
    expect(addedDataset.name).toBe("iris");
    expect(addedDataset.status).toBe("loading");

    addDatasetSpy.mockRestore();
  });

  it("transitions to prompt chips after clicking sample data button", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    const button = screen.getByRole("button", { name: /Try with sample data/ });
    await user.click(button);

    // After click, the dataset is added synchronously to the store,
    // so the component transitions: the button disappears, prompt chips appear.
    expect(
      screen.queryByRole("button", { name: /Try with sample data/ })
    ).not.toBeInTheDocument();

    for (const chip of SAMPLE_PROMPT_CHIPS) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
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

  it("hides the step-by-step guide when datasets are loaded", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    // Step guide should be hidden when datasets exist
    expect(screen.queryByText(/Add a dataset/)).not.toBeInTheDocument();
  });

  it("hides the Try with sample data button when datasets are loaded", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(<OnboardingGuide onSendPrompt={onSendPrompt} />);

    expect(
      screen.queryByRole("button", { name: /Try with sample data/ })
    ).not.toBeInTheDocument();
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
        created_at: new Date().toISOString(),
      },
    ]);

    // OnboardingGuide should not be rendered by the parent when messages exist.
    // We test the parent behavior: ChatArea shows message-list-placeholder.
    renderWithProviders(<ChatArea />);

    expect(screen.queryByTestId("onboarding-guide")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-list-placeholder")).toBeInTheDocument();
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
