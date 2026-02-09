// Tests for the TokenUsage component.
// - Renders token count when data is available
// - Shows nothing when total_tokens is 0
// - Shows nothing when no active conversation

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../../../tests/helpers/render";
import { TokenUsage } from "@/components/chat-area/TokenUsage";

// --- Mock the API client ---
const fetchTokenUsageMock = vi.fn();
vi.mock("@/api/client", () => ({
  fetchTokenUsage: (...args: unknown[]) => fetchTokenUsageMock(...args),
}));

// --- Mock the chat store ---
let mockActiveConversationId: string | null = "conv-123";
vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector: (s: { activeConversationId: string | null }) => unknown) =>
    selector({ activeConversationId: mockActiveConversationId }),
}));

beforeEach(() => {
  fetchTokenUsageMock.mockReset();
  mockActiveConversationId = "conv-123";
});

describe("TokenUsage", () => {
  it("renders token count when data is available", async () => {
    fetchTokenUsageMock.mockResolvedValue({
      total_input_tokens: 1500,
      total_output_tokens: 800,
      total_tokens: 2300,
      total_cost: 0.0023,
      request_count: 5,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    expect(screen.getByText("2.3K tokens")).toBeInTheDocument();
  });

  it("shows exact count for small numbers", async () => {
    fetchTokenUsageMock.mockResolvedValue({
      total_input_tokens: 300,
      total_output_tokens: 200,
      total_tokens: 500,
      total_cost: 0.0005,
      request_count: 2,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByText("500 tokens")).toBeInTheDocument();
    });
  });

  it("shows nothing when total_tokens is 0", async () => {
    fetchTokenUsageMock.mockResolvedValue({
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      request_count: 0,
    });

    renderWithProviders(<TokenUsage />);

    // Wait for the query to settle, then verify nothing is rendered
    await waitFor(() => {
      expect(fetchTokenUsageMock).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
  });

  it("shows nothing when no active conversation", async () => {
    mockActiveConversationId = null;

    renderWithProviders(<TokenUsage />);

    // The query should not even fire
    expect(fetchTokenUsageMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
  });

  it("includes tooltip with detailed breakdown", async () => {
    fetchTokenUsageMock.mockResolvedValue({
      total_input_tokens: 10000,
      total_output_tokens: 5000,
      total_tokens: 15000,
      total_cost: 0.015,
      request_count: 8,
    });

    renderWithProviders(<TokenUsage />);

    await waitFor(() => {
      expect(screen.getByTestId("token-usage")).toBeInTheDocument();
    });

    const container = screen.getByTestId("token-usage");
    expect(container.getAttribute("title")).toContain("Input: 10,000");
    expect(container.getAttribute("title")).toContain("Output: 5,000");
    expect(container.getAttribute("title")).toContain("Requests: 8");
  });
});
