// Tests for PromptPreviewModal component.
//
// PPM-CLOSED-1: Renders nothing when modal is closed (open=false)
// PPM-TITLE-1: Renders modal with "Prompt Preview" heading when open
// PPM-TABS-1: Shows three tabs: System Prompt, History, Tools
// PPM-TAB-SWITCH-1: Clicking tabs switches content
// PPM-TOKENS-1: Displays formatted token count badge
// PPM-TOKEN-FORMAT-1: formatTokens handles K/M formatting
// PPM-BREAKDOWN-1: Token breakdown display toggles on badge click
// PPM-CLOSE-BTN-1: Close button calls onClose
// PPM-BACKDROP-1: Clicking backdrop calls onClose
// PPM-ESCAPE-1: onClose not called by Escape (component does not bind Escape)
// PPM-LOADING-1: Shows loading text while fetching
// PPM-ERROR-1: Shows error message when API fails
// PPM-SYSTEM-TAB-1: Displays system prompt content
// PPM-HISTORY-TAB-1: Displays message history with roles
// PPM-TOOLS-TAB-1: Displays tool names

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useChatStore } from "@/stores/chatStore";
import { PromptPreviewModal } from "@/components/chat-area/PromptPreviewModal";
import { http, HttpResponse } from "msw";
import { server } from "../../helpers/mocks/server";
import { resetAllStores } from "../../helpers/stores";

// --- Mock data ---

const mockPreviewData = {
  system_prompt: "You are a helpful data analyst assistant.",
  messages: [
    { role: "user", content: "Show me the top 10 customers" },
    { role: "assistant", content: "Here is the query to get top 10 customers." },
  ],
  tools: ["execute_sql", "list_tables", "describe_table"],
  new_message: "What is the average order value?",
  estimated_tokens: 2450,
  token_breakdown: {
    system_prompt: 800,
    messages: [
      { role: "user", tokens: 120 },
      { role: "assistant", tokens: 230 },
    ],
    tools: 500,
    new_message: 80,
    total: 1730,
  },
};

const mockPreviewDataLargeTokens = {
  system_prompt: "System prompt",
  messages: [],
  tools: [],
  new_message: "hello",
  estimated_tokens: 1_250_000,
  token_breakdown: {
    system_prompt: 500_000,
    messages: [],
    tools: 250_000,
    new_message: 500_000,
    total: 1_250_000,
  },
};

// --- Helpers ---

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  inputValue: "What is the average order value?",
};

function setupConversation() {
  useChatStore.setState({ activeConversationId: "conv-1" });
}

function renderModal(propsOverride: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...propsOverride, onClose: propsOverride.onClose ?? vi.fn() };
  return { ...render(<PromptPreviewModal {...props} />), onClose: props.onClose };
}

// --- Tests ---

beforeEach(() => {
  resetAllStores();
  vi.restoreAllMocks();
});

describe("PPM-CLOSED: Modal visibility", () => {
  it("renders nothing when open is false", () => {
    setupConversation();
    const { container } = renderModal({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders the modal when open is true and data is available", async () => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByTestId("prompt-preview-modal")).toBeInTheDocument();
    });
  });
});

describe("PPM-TITLE: Modal title", () => {
  it("renders modal with 'Prompt Preview' heading", async () => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Prompt Preview")).toBeInTheDocument();
    });
  });
});

describe("PPM-TABS: Tab rendering and switching", () => {
  beforeEach(() => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );
  });

  it("shows three tabs: System Prompt, History, and Tools", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });
    expect(screen.getByText("History (2)")).toBeInTheDocument();
    expect(screen.getByText("Tools (3)")).toBeInTheDocument();
  });

  it("defaults to the System Prompt tab and shows system prompt content", async () => {
    renderModal();

    await waitFor(() => {
      expect(
        screen.getByText("You are a helpful data analyst assistant.")
      ).toBeInTheDocument();
    });
  });

  it("switches to History tab and shows messages", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History (2)"));

    expect(
      screen.getByText("Show me the top 10 customers")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Here is the query to get top 10 customers.")
    ).toBeInTheDocument();
    // New message shown at bottom of history
    expect(
      screen.getByText("What is the average order value?")
    ).toBeInTheDocument();
  });

  it("switches to Tools tab and shows tool names", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tools (3)"));

    expect(screen.getByText("execute_sql")).toBeInTheDocument();
    expect(screen.getByText("list_tables")).toBeInTheDocument();
    expect(screen.getByText("describe_table")).toBeInTheDocument();
  });

  it("shows tab counts of 0 when data has no messages or tools", async () => {
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json({
          ...mockPreviewData,
          messages: [],
          tools: [],
        })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("History (0)")).toBeInTheDocument();
    });
    expect(screen.getByText("Tools (0)")).toBeInTheDocument();
  });
});

describe("PPM-TOKENS: Token count display", () => {
  beforeEach(() => {
    setupConversation();
  });

  it("displays formatted token count badge after data loads", async () => {
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );

    renderModal();

    await waitFor(() => {
      // 2450 tokens -> "2.5K"
      expect(screen.getByText(/~2\.5K tokens/)).toBeInTheDocument();
    });
  });

  it("formats thousands with K suffix", async () => {
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json({ ...mockPreviewData, estimated_tokens: 15_800 })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~15\.8K tokens/)).toBeInTheDocument();
    });
  });

  it("formats millions with M suffix", async () => {
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewDataLargeTokens)
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~1\.25M tokens/)).toBeInTheDocument();
    });
  });

  it("displays small numbers without suffix", async () => {
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json({ ...mockPreviewData, estimated_tokens: 450 })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~450 tokens/)).toBeInTheDocument();
    });
  });
});

describe("PPM-BREAKDOWN: Token breakdown panel", () => {
  beforeEach(() => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );
  });

  it("token breakdown is not visible by default", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~2\.5K tokens/)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("token-breakdown")).not.toBeInTheDocument();
  });

  it("toggles token breakdown panel when badge is clicked", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~2\.5K tokens/)).toBeInTheDocument();
    });

    // Click to open
    fireEvent.click(screen.getByText(/~2\.5K tokens/));
    expect(screen.getByTestId("token-breakdown")).toBeInTheDocument();

    // Verify breakdown items are present
    expect(screen.getByText("System prompt")).toBeInTheDocument();
    expect(screen.getByText("Messages (2 turns)")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("New message")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("shows per-message token details in breakdown", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~2\.5K tokens/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/~2\.5K tokens/));

    // Per-message sub-items show role names
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("assistant")).toBeInTheDocument();
  });

  it("closes token breakdown on second click", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/~2\.5K tokens/)).toBeInTheDocument();
    });

    const badge = screen.getByText(/~2\.5K tokens/);

    // Open
    fireEvent.click(badge);
    expect(screen.getByTestId("token-breakdown")).toBeInTheDocument();

    // Close
    fireEvent.click(badge);
    expect(screen.queryByTestId("token-breakdown")).not.toBeInTheDocument();
  });

  it("shows singular 'turn' for single message", async () => {
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json({
          ...mockPreviewData,
          messages: [{ role: "user", content: "hi" }],
          token_breakdown: {
            ...mockPreviewData.token_breakdown,
            messages: [{ role: "user", tokens: 50 }],
          },
        })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/tokens/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/tokens/));

    expect(screen.getByText("Messages (1 turn)")).toBeInTheDocument();
  });
});

describe("PPM-CLOSE: Close interactions", () => {
  beforeEach(() => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    await waitFor(() => {
      expect(screen.getByTestId("prompt-preview-modal")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });

    await waitFor(() => {
      expect(screen.getByTestId("prompt-preview-modal")).toBeInTheDocument();
    });

    // The backdrop is the outer fixed div (parent of the modal)
    const backdrop = container.querySelector(".fixed.inset-0")!;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when modal content is clicked (stopPropagation)", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    await waitFor(() => {
      expect(screen.getByTestId("prompt-preview-modal")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("prompt-preview-modal"));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("PPM-LOADING: Loading state", () => {
  it("shows 'Loading preview...' while fetching data", async () => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", async () => {
        // Never resolve - stay in loading state
        await new Promise(() => {});
        return HttpResponse.json(mockPreviewData);
      })
    );

    renderModal();

    expect(screen.getByText("Loading preview...")).toBeInTheDocument();
  });

  it("loading text disappears once data is loaded", async () => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );

    renderModal();

    // Initially shows loading
    expect(screen.getByText("Loading preview...")).toBeInTheDocument();

    // After data loads, loading text should disappear
    await waitFor(() => {
      expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Prompt Preview")).toBeInTheDocument();
  });
});

describe("PPM-ERROR: Error state", () => {
  it("shows error message when API request fails", async () => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        )
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Conversation not found")).toBeInTheDocument();
    });
  });

  it("shows generic error for non-JSON error responses", async () => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        new HttpResponse("Internal Server Error", { status: 500 })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    });
  });
});

describe("PPM-NO-FETCH: Fetch is skipped without required state", () => {
  it("does not fetch when there is no active conversation", () => {
    useChatStore.setState({ activeConversationId: null });

    renderModal();

    // Should not show loading because fetchPreview bails out early
    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
  });

  it("does not fetch when inputValue is empty", () => {
    setupConversation();

    renderModal({ inputValue: "" });

    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
  });

  it("does not fetch when inputValue is only whitespace", () => {
    setupConversation();

    renderModal({ inputValue: "   " });

    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
  });
});

describe("PPM-HISTORY: Message history display", () => {
  beforeEach(() => {
    setupConversation();
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json(mockPreviewData)
      )
    );
  });

  it("shows role labels for each message in history tab", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History (2)"));

    // Role labels in message bubbles
    const userLabels = screen.getAllByText("user");
    expect(userLabels.length).toBeGreaterThanOrEqual(1);

    const assistantLabels = screen.getAllByText("assistant");
    expect(assistantLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'user (new)' label for the new message at the bottom", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History (2)"));

    expect(screen.getByText("user (new)")).toBeInTheDocument();
  });

  it("truncates long message content with ellipsis", async () => {
    const longContent = "A".repeat(600);
    server.use(
      http.post("/conversations/:id/prompt-preview", () =>
        HttpResponse.json({
          ...mockPreviewData,
          messages: [{ role: "user", content: longContent }],
        })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History (1)"));

    // Content is sliced to 500 chars + "..."
    const truncated = screen.getByText(/^A+\.\.\.$/);
    expect(truncated).toBeInTheDocument();
  });
});
