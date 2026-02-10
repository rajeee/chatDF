// Tests for the TokenUsage component.
//
// Covers:
// - Token count formatting (exact, K suffix, M suffix)
// - Renders token count when data is available
// - Shows nothing when total_tokens is 0 or null/undefined
// - Shows nothing when no active conversation (query disabled)
// - Tooltip content with detailed breakdown
// - Handles missing/null optional fields gracefully
// - Handles API returning undefined data
// - Displays correct formatting at boundary values
// - SVG icon is present and decorative (aria-hidden)

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
  // ──────────────────────────────────────────────
  // Basic rendering
  // ──────────────────────────────────────────────

  describe("basic rendering", () => {
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

    it("renders with the data-testid attribute", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 100,
        total_output_tokens: 100,
        total_tokens: 200,
        total_cost: 0.0002,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByTestId("token-usage")).toBeInTheDocument();
      });
    });

    it("renders an SVG icon with aria-hidden", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 500,
        total_output_tokens: 500,
        total_tokens: 1000,
        total_cost: 0.001,
        request_count: 3,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByTestId("token-usage")).toBeInTheDocument();
      });

      const container = screen.getByTestId("token-usage");
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  // ──────────────────────────────────────────────
  // Token count formatting
  // ──────────────────────────────────────────────

  describe("token count formatting", () => {
    it("shows exact count for numbers below 1000", async () => {
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

    it("shows exact count for single-digit numbers", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 3,
        total_output_tokens: 4,
        total_tokens: 7,
        total_cost: 0.0,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("7 tokens")).toBeInTheDocument();
      });
    });

    it("shows exact count for 999", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 500,
        total_output_tokens: 499,
        total_tokens: 999,
        total_cost: 0.001,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("999 tokens")).toBeInTheDocument();
      });
    });

    it("shows K suffix at exactly 1000", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 600,
        total_output_tokens: 400,
        total_tokens: 1000,
        total_cost: 0.001,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("1.0K tokens")).toBeInTheDocument();
      });
    });

    it("shows K suffix with one decimal for thousands", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 10000,
        total_output_tokens: 5000,
        total_tokens: 15000,
        total_cost: 0.015,
        request_count: 8,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("15.0K tokens")).toBeInTheDocument();
      });
    });

    it("shows K suffix for 999,999 (just under million)", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 500000,
        total_output_tokens: 499999,
        total_tokens: 999999,
        total_cost: 1.0,
        request_count: 100,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        // 999999 / 1000 = 999.999 -> "1000.0K"
        expect(screen.getByText("1000.0K tokens")).toBeInTheDocument();
      });
    });

    it("shows M suffix at exactly 1,000,000", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 600000,
        total_output_tokens: 400000,
        total_tokens: 1000000,
        total_cost: 1.0,
        request_count: 50,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("1.0M tokens")).toBeInTheDocument();
      });
    });

    it("shows M suffix with one decimal for millions", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 1500000,
        total_output_tokens: 1000000,
        total_tokens: 2500000,
        total_cost: 2.5,
        request_count: 200,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("2.5M tokens")).toBeInTheDocument();
      });
    });

    it("shows M suffix for large token counts", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 5000000,
        total_output_tokens: 5000000,
        total_tokens: 10000000,
        total_cost: 10.0,
        request_count: 500,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByText("10.0M tokens")).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────
  // Hidden / null states
  // ──────────────────────────────────────────────

  describe("hidden states", () => {
    it("shows nothing when total_tokens is 0", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_tokens: 0,
        total_cost: 0,
        request_count: 0,
      });

      renderWithProviders(<TokenUsage />);

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

    it("shows nothing when API returns null data", async () => {
      fetchTokenUsageMock.mockResolvedValue(null);

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(fetchTokenUsageMock).toHaveBeenCalled();
      });

      expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
    });

    it("shows nothing when API returns undefined data", async () => {
      fetchTokenUsageMock.mockResolvedValue(undefined);

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(fetchTokenUsageMock).toHaveBeenCalled();
      });

      expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
    });

    it("shows nothing when total_tokens field is missing", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 100,
        total_output_tokens: 200,
        // total_tokens is missing (undefined)
        total_cost: 0.0003,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(fetchTokenUsageMock).toHaveBeenCalled();
      });

      expect(screen.queryByTestId("token-usage")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // Tooltip content
  // ──────────────────────────────────────────────

  describe("tooltip content", () => {
    it("includes detailed breakdown with formatted numbers", async () => {
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
      const title = container.getAttribute("title")!;
      expect(title).toContain("Input: 10,000");
      expect(title).toContain("Output: 5,000");
      expect(title).toContain("Requests: 8");
    });

    it("handles null input/output tokens in tooltip gracefully", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: null,
        total_output_tokens: null,
        total_tokens: 500,
        total_cost: 0.0005,
        request_count: null,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByTestId("token-usage")).toBeInTheDocument();
      });

      const container = screen.getByTestId("token-usage");
      const title = container.getAttribute("title")!;
      // The component uses ?? 0 fallback for null values
      expect(title).toContain("Input: 0");
      expect(title).toContain("Output: 0");
      expect(title).toContain("Requests: 0");
    });

    it("formats large tooltip numbers with locale separators", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 1234567,
        total_output_tokens: 987654,
        total_tokens: 2222221,
        total_cost: 2.22,
        request_count: 42,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByTestId("token-usage")).toBeInTheDocument();
      });

      const container = screen.getByTestId("token-usage");
      const title = container.getAttribute("title")!;
      // toLocaleString formats with commas for en-US
      expect(title).toContain("Input: 1,234,567");
      expect(title).toContain("Output: 987,654");
      expect(title).toContain("Requests: 42");
    });
  });

  // ──────────────────────────────────────────────
  // API call behavior
  // ──────────────────────────────────────────────

  describe("API call behavior", () => {
    it("calls fetchTokenUsage with the active conversation ID", async () => {
      mockActiveConversationId = "conv-xyz";
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 100,
        total_output_tokens: 100,
        total_tokens: 200,
        total_cost: 0.0002,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(fetchTokenUsageMock).toHaveBeenCalledWith("conv-xyz");
      });
    });

    it("does not call fetchTokenUsage when conversation is null", () => {
      mockActiveConversationId = null;

      renderWithProviders(<TokenUsage />);

      expect(fetchTokenUsageMock).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // Display text structure
  // ──────────────────────────────────────────────

  describe("display text structure", () => {
    it("shows token count followed by 'tokens' word", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 42,
        total_output_tokens: 8,
        total_tokens: 50,
        total_cost: 0.00005,
        request_count: 1,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByTestId("token-usage")).toBeInTheDocument();
      });

      const span = screen.getByTestId("token-usage").querySelector("span");
      expect(span?.textContent).toBe("50 tokens");
    });

    it("shows K-formatted count followed by 'tokens' word", async () => {
      fetchTokenUsageMock.mockResolvedValue({
        total_input_tokens: 2000,
        total_output_tokens: 1500,
        total_tokens: 3500,
        total_cost: 0.0035,
        request_count: 5,
      });

      renderWithProviders(<TokenUsage />);

      await waitFor(() => {
        expect(screen.getByTestId("token-usage")).toBeInTheDocument();
      });

      const span = screen.getByTestId("token-usage").querySelector("span");
      expect(span?.textContent).toBe("3.5K tokens");
    });
  });
});
