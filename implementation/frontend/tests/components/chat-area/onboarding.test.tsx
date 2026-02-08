// Tests: spec/frontend/chat_area/onboarding/spec.md
// Verifies: spec/frontend/chat_area/onboarding/plan.md
//
// OB-1: Renders onboarding when no datasets and no messages
// OB-2: "Try with preset sources" button opens preset modal
// OB-3: Prompt chips appear after data loads
// OB-4: Hidden when messages exist
// OB-5: SuggestedPrompts shown when datasets exist but no messages
// OB-6: Clicking prompt chip calls onSendPrompt
// OB-7: Smart schema-based suggestions

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent, act, waitFor } from "../../helpers/render";
import {
  resetAllStores,
  setDatasetsLoaded,
  setChatIdle,
  type Dataset,
} from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { OnboardingGuide } from "@/components/chat-area/OnboardingGuide";
import { SuggestedPrompts, buildSmartSuggestions } from "@/components/chat-area/SuggestedPrompts";
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
  schema_json: '[{"name":"sepal_length","type":"Float64"},{"name":"sepal_width","type":"Float64"},{"name":"petal_length","type":"Float64"},{"name":"petal_width","type":"Float64"},{"name":"species","type":"String"}]',
  status: "ready",
  error_message: null,
};

const LEGACY_SCHEMA_DATASET: Dataset = {
  id: "ds-legacy",
  conversation_id: "conv-1",
  url: "https://example.com/data.parquet",
  name: "legacy",
  row_count: 100,
  column_count: 3,
  schema_json: '{"columns":["col_a","col_b","col_c"]}',
  status: "ready",
  error_message: null,
};

const TIMESERIES_DATASET: Dataset = {
  id: "ds-ts",
  conversation_id: "conv-1",
  url: "https://example.com/timeseries.parquet",
  name: "sales",
  row_count: 10000,
  column_count: 4,
  schema_json: '[{"name":"date","type":"Date"},{"name":"revenue","type":"Float64"},{"name":"units_sold","type":"Int64"},{"name":"region","type":"String"}]',
  status: "ready",
  error_message: null,
};

const NUMERIC_ONLY_DATASET: Dataset = {
  id: "ds-num",
  conversation_id: "conv-1",
  url: "https://example.com/metrics.parquet",
  name: "metrics",
  row_count: 500,
  column_count: 3,
  schema_json: '[{"name":"temperature","type":"Float64"},{"name":"pressure","type":"Float32"},{"name":"humidity","type":"Int32"}]',
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
        datasets={[IRIS_DATASET]}
        onSendPrompt={onSendPrompt}
      />
    );

    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();
    // Should have clickable prompt suggestions (role="option" in listbox)
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
  });

  it("includes dataset name in at least one suggestion", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts
        datasets={[IRIS_DATASET]}
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
        datasets={[IRIS_DATASET]}
        onSendPrompt={onSendPrompt}
      />
    );

    const options = screen.getAllByRole("option");
    for (const option of options) {
      expect(option).toHaveClass("prompt-chip");
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
        datasets={[IRIS_DATASET]}
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
        datasets={[IRIS_DATASET]}
        onSendPrompt={onSendPrompt}
      />
    );

    const options = screen.getAllByRole("option");
    await user.click(options[0]);

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(typeof onSendPrompt.mock.calls[0][0]).toBe("string");
  });
});

describe("OB-7: Smart schema-based suggestions", () => {
  it("returns empty array for no datasets", () => {
    expect(buildSmartSuggestions([])).toEqual([]);
  });

  it("generates suggestions mentioning numeric column names for numeric+categorical schema", () => {
    const suggestions = buildSmartSuggestions([IRIS_DATASET]);

    // Should reference actual column names
    expect(suggestions.some((s) => s.includes("sepal length"))).toBe(true);
    // Should reference the categorical column
    expect(suggestions.some((s) => s.includes("species"))).toBe(true);
    // Should have "average ... by ..." pattern
    expect(suggestions.some((s) => /average.*by/i.test(s))).toBe(true);
  });

  it("generates trend suggestion for date + numeric schema", () => {
    const suggestions = buildSmartSuggestions([TIMESERIES_DATASET]);

    // Should have a trend suggestion mentioning the date column
    expect(suggestions.some((s) => s.includes("trend"))).toBe(true);
    expect(suggestions.some((s) => s.includes("date"))).toBe(true);
  });

  it("generates min/max/average for numeric-only schema", () => {
    const suggestions = buildSmartSuggestions([NUMERIC_ONLY_DATASET]);

    // Should suggest min, max, average since no categorical cols
    expect(suggestions.some((s) => /min.*max.*average/i.test(s))).toBe(true);
  });

  it("generates distribution suggestion for categorical columns", () => {
    const suggestions = buildSmartSuggestions([IRIS_DATASET]);

    expect(suggestions.some((s) => s.includes("distribution"))).toBe(true);
  });

  it("falls back to generic suggestions when schema is unparseable", () => {
    const badSchemaDataset: Dataset = {
      ...IRIS_DATASET,
      schema_json: "not-json",
    };
    const suggestions = buildSmartSuggestions([badSchemaDataset]);

    expect(suggestions).toContain("Show me the first 5 rows of iris");
    expect(suggestions).toContain("How many rows are in iris?");
  });

  it("falls back to generic suggestions for legacy schema format (string-only columns)", () => {
    const suggestions = buildSmartSuggestions([LEGACY_SCHEMA_DATASET]);

    // Legacy format has array of strings, not {name, type} objects - treated as empty
    expect(suggestions).toContain("Show me the first 5 rows of legacy");
    expect(suggestions).toContain("How many rows are in legacy?");
  });

  it("returns at most 4 suggestions", () => {
    const suggestions = buildSmartSuggestions([TIMESERIES_DATASET]);
    expect(suggestions.length).toBeLessThanOrEqual(4);
  });

  it("always starts with a preview suggestion", () => {
    const suggestions = buildSmartSuggestions([IRIS_DATASET]);
    expect(suggestions[0]).toBe("Show me the first 5 rows of iris");
  });

  it("formats underscored column names with spaces", () => {
    const suggestions = buildSmartSuggestions([IRIS_DATASET]);
    // "sepal_length" should appear as "sepal length"
    expect(suggestions.some((s) => s.includes("sepal length"))).toBe(true);
    expect(suggestions.some((s) => s.includes("sepal_length"))).toBe(false);
  });
});

describe("OB-EXIT: Smooth exit animation when SuggestedPrompts disappears", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "conv-1" }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies onboarding-exit class when messages appear while SuggestedPrompts is visible", () => {
    // Start with datasets loaded, no messages → SuggestedPrompts visible
    setDatasetsLoaded([IRIS_DATASET]);
    renderWithProviders(<ChatArea />);

    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();

    // Simulate sending a message → messages appear, SuggestedPrompts should exit
    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // SuggestedPrompts should still be in DOM (exit animation running)
    const prompts = screen.getByTestId("suggested-prompts");
    expect(prompts).toBeInTheDocument();

    // The wrapper div should have the exit animation class
    const wrapper = prompts.parentElement;
    expect(wrapper).toHaveClass("onboarding-exit");
  });

  it("removes SuggestedPrompts from DOM after exit animation completes", async () => {
    setDatasetsLoaded([IRIS_DATASET]);
    renderWithProviders(<ChatArea />);

    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();

    // Trigger exit by adding a message
    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // Still visible during animation
    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();

    // Wait for the 300ms exit animation to complete and element to be removed
    await waitFor(() => {
      expect(screen.queryByTestId("suggested-prompts")).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("exit animation wrapper has pointer-events: none via CSS class", () => {
    setDatasetsLoaded([IRIS_DATASET]);
    renderWithProviders(<ChatArea />);

    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // During exit, the wrapper should have the class that disables pointer events
    const wrapper = screen.getByTestId("suggested-prompts").parentElement;
    expect(wrapper).toHaveClass("onboarding-exit");
  });
});
