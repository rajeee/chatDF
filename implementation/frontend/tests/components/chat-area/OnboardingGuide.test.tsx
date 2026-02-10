// Tests for OnboardingGuide component.
//
// 1. Renders template cards from CONVERSATION_TEMPLATES
// 2. Shows correct template names and descriptions
// 3. Template click creates conversation via API
// 4. Loading state during template creation
// 5. Error handling when API fails
// 6. NREL preset modal trigger button
// 7. Disabled state when loading

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor, act } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { OnboardingGuide } from "@/components/chat-area/OnboardingGuide";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";
import { CONVERSATION_TEMPLATES } from "@/lib/constants";
import { apiPost } from "@/api/client";

// Mock the API client module
vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

const mockApiPost = apiPost as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Renders template cards from CONVERSATION_TEMPLATES
// ---------------------------------------------------------------------------

describe("OnboardingGuide — renders template cards", () => {
  it("renders the onboarding-guide container", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);
    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();
  });

  it("renders a card for every template in CONVERSATION_TEMPLATES", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    for (const template of CONVERSATION_TEMPLATES) {
      expect(screen.getByTestId(`template-card-${template.id}`)).toBeInTheDocument();
    }
  });

  it("renders the correct number of template cards", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const cards = CONVERSATION_TEMPLATES.map((t) =>
      screen.getByTestId(`template-card-${t.id}`)
    );
    expect(cards).toHaveLength(CONVERSATION_TEMPLATES.length);
  });

  it("renders the app title 'chatDF'", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);
    expect(screen.getByText("chatDF")).toBeInTheDocument();
  });

  it("renders the subtitle about pasting Parquet URLs", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);
    expect(screen.getByText(/or paste any Parquet URL to start/)).toBeInTheDocument();
  });

  it("renders the description 'Ask questions about any dataset'", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);
    expect(screen.getByText("Ask questions about any dataset")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Shows correct template names and descriptions
// ---------------------------------------------------------------------------

describe("OnboardingGuide — template names and descriptions", () => {
  it("displays the name of each template", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    for (const template of CONVERSATION_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
    }
  });

  it("displays the description of each template", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    for (const template of CONVERSATION_TEMPLATES) {
      expect(screen.getByText(template.description)).toBeInTheDocument();
    }
  });

  it("displays the icon of each template", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    for (const template of CONVERSATION_TEMPLATES) {
      expect(screen.getByText(template.icon)).toBeInTheDocument();
    }
  });

  it("each template card is a button element", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    for (const template of CONVERSATION_TEMPLATES) {
      const card = screen.getByTestId(`template-card-${template.id}`);
      expect(card.tagName).toBe("BUTTON");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Template click creates conversation via API
// ---------------------------------------------------------------------------

describe("OnboardingGuide — template click creates conversation via API", () => {
  it("calls apiPost to create a conversation when no activeConversationId", async () => {
    const user = userEvent.setup();
    // No active conversation
    useChatStore.setState({ activeConversationId: null });

    // Mock: first call creates conversation, second loads dataset
    mockApiPost
      .mockResolvedValueOnce({ id: "new-conv-1" }) // POST /conversations
      .mockResolvedValueOnce({ dataset_id: "ds-1", status: "loading" }); // POST /conversations/.../datasets

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    // Find a non-preset template (e.g., iris)
    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    const card = screen.getByTestId(`template-card-${irisTemplate.id}`);
    await user.click(card);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/conversations");
    });
  });

  it("does NOT create a new conversation if activeConversationId already exists", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "existing-conv" });

    mockApiPost.mockResolvedValueOnce({ dataset_id: "ds-1", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      // Should only call for dataset loading, not for creating conversation
      expect(mockApiPost).not.toHaveBeenCalledWith("/conversations");
    });
  });

  it("calls apiPost to load datasets for the template", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    mockApiPost.mockResolvedValue({ dataset_id: "ds-1", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/conversations/conv-1/datasets",
        { url: irisTemplate.datasets[0].url, name: irisTemplate.datasets[0].name }
      );
    });
  });

  it("calls setActiveConversation with the new conversation ID", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: null });

    const setActiveConversationSpy = vi.spyOn(
      useChatStore.getState(),
      "setActiveConversation"
    );

    mockApiPost
      .mockResolvedValueOnce({ id: "new-conv-99" })
      .mockResolvedValueOnce({ dataset_id: "ds-1", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      expect(setActiveConversationSpy).toHaveBeenCalledWith("new-conv-99");
    });

    setActiveConversationSpy.mockRestore();
  });

  it("adds a loading placeholder dataset to the store", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Make apiPost hang for datasets so we can inspect intermediate state
    mockApiPost.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ dataset_id: "ds-real", status: "loading" }), 100))
    );

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    // Check that a loading placeholder was added
    const datasets = useDatasetStore.getState().datasets;
    expect(datasets.length).toBeGreaterThanOrEqual(1);

    const placeholder = datasets.find((d) => d.status === "loading");
    expect(placeholder).toBeDefined();
    expect(placeholder!.name).toBe(irisTemplate.datasets[0].name);
    expect(placeholder!.url).toBe(irisTemplate.datasets[0].url);
  });

  it("sets template prompts after successful dataset loading", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    const setTemplatePromptsSpy = vi.spyOn(
      useChatStore.getState(),
      "setTemplatePrompts"
    );

    mockApiPost.mockResolvedValue({ dataset_id: "ds-1", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      expect(setTemplatePromptsSpy).toHaveBeenCalledWith(irisTemplate.prompts);
    });

    setTemplatePromptsSpy.mockRestore();
  });

  it("updates placeholder with real dataset ID on success", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    mockApiPost.mockResolvedValue({ dataset_id: "real-ds-id", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      const datasets = useDatasetStore.getState().datasets;
      const updated = datasets.find((d) => d.id === "real-ds-id");
      expect(updated).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Loading state during template creation
// ---------------------------------------------------------------------------

describe("OnboardingGuide — loading state", () => {
  it("shows 'Loading...' text on the clicked template card", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Keep the promise pending to observe loading state
    let resolveApiCall: (value: unknown) => void;
    mockApiPost.mockImplementation(
      () => new Promise((resolve) => { resolveApiCall = resolve; })
    );

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    // Should show loading text
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Resolve to clean up
    await act(async () => {
      resolveApiCall!({ dataset_id: "ds-1", status: "loading" });
    });
  });

  it("hides 'Loading...' text after API call resolves", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    mockApiPost.mockResolvedValue({ dataset_id: "ds-1", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  it("clears loading state even when API call fails", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: null });

    mockApiPost.mockRejectedValue(new Error("Network error"));

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Error handling when API fails
// ---------------------------------------------------------------------------

describe("OnboardingGuide — error handling", () => {
  it("sets dataset placeholder to error state when dataset load fails", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Dataset POST fails
    mockApiPost.mockRejectedValue(new Error("Dataset load failed"));

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      const datasets = useDatasetStore.getState().datasets;
      const errorDs = datasets.find((d) => d.status === "error");
      expect(errorDs).toBeDefined();
      expect(errorDs!.error_message).toBe("Dataset load failed");
    });
  });

  it("sets generic error message for non-Error exceptions", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Reject with a non-Error value
    mockApiPost.mockRejectedValue("something went wrong");

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      const datasets = useDatasetStore.getState().datasets;
      const errorDs = datasets.find((d) => d.status === "error");
      expect(errorDs).toBeDefined();
      expect(errorDs!.error_message).toBe("Failed to load");
    });
  });

  it("still sets template prompts even if a dataset load fails", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    const setTemplatePromptsSpy = vi.spyOn(
      useChatStore.getState(),
      "setTemplatePrompts"
    );

    // Dataset load fails but conversation-level try/catch catches it
    mockApiPost.mockRejectedValue(new Error("Network error"));

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    // The inner try/catch catches dataset errors, so template prompts should still be set
    await waitFor(() => {
      expect(setTemplatePromptsSpy).toHaveBeenCalledWith(irisTemplate.prompts);
    });

    setTemplatePromptsSpy.mockRestore();
  });

  it("does not crash when conversation creation fails", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: null });

    // Conversation creation fails
    mockApiPost.mockRejectedValue(new Error("Server error"));

    // Spy on console.error since the outer catch logs it
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Should have logged the error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to load template:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 6. NREL preset modal trigger button
// ---------------------------------------------------------------------------

describe("OnboardingGuide — NREL preset trigger", () => {
  it("opens the preset modal when NREL card is clicked", async () => {
    const user = userEvent.setup();
    const openPresetSpy = vi.spyOn(useUiStore.getState(), "openPresetModal");

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const nrelTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "nrel");
    expect(nrelTemplate).toBeDefined();

    await user.click(screen.getByTestId(`template-card-${nrelTemplate!.id}`));

    expect(openPresetSpy).toHaveBeenCalledTimes(1);
    openPresetSpy.mockRestore();
  });

  it("does NOT call apiPost when NREL card is clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const nrelTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "nrel")!;
    await user.click(screen.getByTestId(`template-card-${nrelTemplate.id}`));

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("does NOT show loading state when NREL card is clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const nrelTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "nrel")!;
    await user.click(screen.getByTestId(`template-card-${nrelTemplate.id}`));

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. Disabled state when loading
// ---------------------------------------------------------------------------

describe("OnboardingGuide — disabled state when loading", () => {
  it("disables all template cards while a template is loading", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Keep the promise pending
    mockApiPost.mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    // All cards should now be disabled
    for (const template of CONVERSATION_TEMPLATES) {
      const card = screen.getByTestId(`template-card-${template.id}`);
      expect(card).toBeDisabled();
    }
  });

  it("re-enables all template cards after loading completes", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    mockApiPost.mockResolvedValue({ dataset_id: "ds-1", status: "loading" });

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    await waitFor(() => {
      for (const template of CONVERSATION_TEMPLATES) {
        const card = screen.getByTestId(`template-card-${template.id}`);
        expect(card).not.toBeDisabled();
      }
    });
  });

  it("prevents double-click from triggering multiple API calls", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Use a never-resolving promise so loading state persists
    mockApiPost.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    const card = screen.getByTestId(`template-card-${irisTemplate.id}`);

    // Click once (starts loading)
    await user.click(card);

    // Wait for loading state to be visible
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // All cards should now be disabled
    expect(card).toBeDisabled();

    // Clicking a different template should also be blocked since all cards are disabled
    const titanicTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "titanic")!;
    const titanicCard = screen.getByTestId(`template-card-${titanicTemplate.id}`);
    expect(titanicCard).toBeDisabled();

    // apiPost should have been called only once (for the single iris dataset)
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it("cards have disabled opacity styling when loading", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ activeConversationId: "conv-1" });

    mockApiPost.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    const irisTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "iris")!;
    await user.click(screen.getByTestId(`template-card-${irisTemplate.id}`));

    // Non-loading template cards should be disabled (opacity applied via CSS class)
    const titanicTemplate = CONVERSATION_TEMPLATES.find((t) => t.id === "titanic")!;
    const titanicCard = screen.getByTestId(`template-card-${titanicTemplate.id}`);
    expect(titanicCard).toBeDisabled();
    expect(titanicCard.className).toContain("disabled:opacity-50");
  });

  it("all cards are enabled initially when nothing is loading", () => {
    renderWithProviders(<OnboardingGuide onSendPrompt={vi.fn()} />);

    for (const template of CONVERSATION_TEMPLATES) {
      const card = screen.getByTestId(`template-card-${template.id}`);
      expect(card).not.toBeDisabled();
    }
  });
});
