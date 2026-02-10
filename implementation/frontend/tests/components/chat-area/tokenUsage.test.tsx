// Tests for TokenUsage component.
//
// TU-1: Returns null when no active conversation
// TU-2: Returns null when total_tokens is 0
// TU-3: Shows formatted count for small values (e.g., 500 -> "500 tokens")
// TU-4: Shows K format for thousands (e.g., 1500 -> "1.5K tokens")
// TU-5: Shows M format for millions (e.g., 1500000 -> "1.5M tokens")
// TU-6: Has title attribute with input/output breakdown

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { TokenUsage } from "@/components/chat-area/TokenUsage";
import { fetchTokenUsage } from "@/api/client";

vi.mock("@/api/client", () => ({
  fetchTokenUsage: vi.fn(),
}));

const mockFetchTokenUsage = fetchTokenUsage as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TU-1: Returns null when no active conversation
// ---------------------------------------------------------------------------

describe("TU-1: Returns null when no active conversation", () => {
  it("does not render token-usage element when activeConversationId is null", () => {
    useChatStore.setState({ activeConversationId: null });

    renderWithProviders(<TokenUsage />);

    expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
  });

  it("does not call fetchTokenUsage when no active conversation", () => {
    useChatStore.setState({ activeConversationId: null });

    renderWithProviders(<TokenUsage />);

    expect(mockFetchTokenUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TU-2: Returns null when total_tokens is 0
// ---------------------------------------------------------------------------

describe("TU-2: Returns null when total_tokens is 0", () => {
  it("does not render token-usage element when total_tokens is 0", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      request_count: 0,
    });

    renderWithProviders(<TokenUsage />);

    // Wait for the query to settle, then confirm nothing is rendered
    await waitFor(() => {
      expect(mockFetchTokenUsage).toHaveBeenCalledWith("conv-1");
    });

    expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TU-3: Shows formatted count for small values
// ---------------------------------------------------------------------------

describe("TU-3: Shows formatted count for small values", () => {
  it("renders '500 tokens' for total_tokens=500", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 300,
      total_output_tokens: 200,
      total_tokens: 500,
      total_cost: 0.001,
      request_count: 1,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("500 tokens")).toBeInTheDocument();
  });

  it("renders '42 tokens' for total_tokens=42", async () => {
    useChatStore.setState({ activeConversationId: "conv-2" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 20,
      total_output_tokens: 22,
      total_tokens: 42,
      total_cost: 0,
      request_count: 1,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("42 tokens")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TU-4: Shows K format for thousands
// ---------------------------------------------------------------------------

describe("TU-4: Shows K format for thousands", () => {
  it("renders '1.5K tokens' for total_tokens=1500", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tokens: 1500,
      total_cost: 0.01,
      request_count: 3,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("1.5K tokens")).toBeInTheDocument();
  });

  it("renders '10.0K tokens' for total_tokens=10000", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 6000,
      total_output_tokens: 4000,
      total_tokens: 10000,
      total_cost: 0.05,
      request_count: 5,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("10.0K tokens")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TU-5: Shows M format for millions
// ---------------------------------------------------------------------------

describe("TU-5: Shows M format for millions", () => {
  it("renders '1.5M tokens' for total_tokens=1500000", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 1000000,
      total_output_tokens: 500000,
      total_tokens: 1500000,
      total_cost: 1.5,
      request_count: 50,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("1.5M tokens")).toBeInTheDocument();
  });

  it("renders '3.0M tokens' for total_tokens=3000000", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 2000000,
      total_output_tokens: 1000000,
      total_tokens: 3000000,
      total_cost: 3.0,
      request_count: 100,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("3.0M tokens")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TU-6: Has title attribute with input/output breakdown
// ---------------------------------------------------------------------------

describe("TU-6: Has title attribute with input/output breakdown", () => {
  it("title contains formatted input tokens, output tokens, and request count", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: 1234,
      total_output_tokens: 5678,
      total_tokens: 6912,
      total_cost: 0.02,
      request_count: 7,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    const el = screen.getByTestId("token-usage");
    const title = el.getAttribute("title");
    expect(title).toContain("Input: 1,234");
    expect(title).toContain("Output: 5,678");
    expect(title).toContain("Requests: 7");
  });

  it("shows 0 for missing input/output tokens in title", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });
    mockFetchTokenUsage.mockResolvedValue({
      total_input_tokens: undefined,
      total_output_tokens: undefined,
      total_tokens: 100,
      total_cost: 0,
      request_count: undefined,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    const el = screen.getByTestId("token-usage");
    const title = el.getAttribute("title");
    expect(title).toContain("Input: 0");
    expect(title).toContain("Output: 0");
    expect(title).toContain("Requests: 0");
  });
});
