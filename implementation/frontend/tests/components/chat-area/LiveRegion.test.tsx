import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveRegion } from "@/components/chat-area/LiveRegion";
import { useChatStore } from "@/stores/chatStore";

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn(),
}));

describe("LiveRegion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with correct ARIA attributes", () => {
    (useChatStore as any).mockImplementation((selector: any) => {
      const state = { messages: [], isStreaming: false };
      return selector(state);
    });
    render(<LiveRegion />);
    const region = screen.getByTestId("live-region");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("announces response complete when streaming finishes", () => {
    // First render with streaming=true
    const mockState = {
      messages: [{
        id: "1", role: "assistant" as const, content: "Hello",
        created_at: new Date().toISOString(),
        sql_executions: [], reasoning: null, sendFailed: false,
        sql_query: null
      }],
      isStreaming: true
    };
    (useChatStore as any).mockImplementation((selector: any) => selector(mockState));
    const { rerender } = render(<LiveRegion />);

    // Change to streaming=false
    mockState.isStreaming = false;
    rerender(<LiveRegion />);

    expect(screen.getByTestId("live-region")).toHaveTextContent("Response complete.");
  });

  it("announces row count when SQL results are present", () => {
    const mockState = {
      messages: [{
        id: "1", role: "assistant" as const, content: "Results",
        created_at: new Date().toISOString(),
        sql_executions: [{ query: "SELECT 1", columns: ["a"], rows: [[1],[2],[3]], error: null, execution_time_ms: 50 }],
        reasoning: null, sendFailed: false,
        sql_query: null
      }],
      isStreaming: false,
    };
    (useChatStore as any).mockImplementation((selector: any) => selector(mockState));
    render(<LiveRegion />);
    expect(screen.getByTestId("live-region")).toHaveTextContent("3 rows returned");
  });

  it("announces error when SQL execution fails", () => {
    const mockState = {
      messages: [{
        id: "1", role: "assistant" as const, content: "Error occurred",
        created_at: new Date().toISOString(),
        sql_executions: [{ query: "SELECT invalid", columns: [], rows: [], error: "Syntax error near 'invalid'", execution_time_ms: 10 }],
        reasoning: null, sendFailed: false,
        sql_query: null
      }],
      isStreaming: false,
    };
    (useChatStore as any).mockImplementation((selector: any) => selector(mockState));
    render(<LiveRegion />);
    expect(screen.getByTestId("live-region")).toHaveTextContent("Query error: Syntax error near 'invalid'");
  });

  it("clears announcement after timeout", () => {
    const mockState = {
      messages: [{ id: "1", role: "assistant" as const, content: "Hi", created_at: new Date().toISOString(), sql_executions: [], reasoning: null, sendFailed: false, sql_query: null }],
      isStreaming: false,
    };
    (useChatStore as any).mockImplementation((selector: any) => selector(mockState));
    render(<LiveRegion />);
    expect(screen.getByTestId("live-region")).toHaveTextContent("Response complete.");

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId("live-region")).toHaveTextContent("");
  });

  it("does not announce when last message is from user", () => {
    const mockState = {
      messages: [{ id: "1", role: "user" as const, content: "Hello", created_at: new Date().toISOString(), sql_executions: [], reasoning: null, sendFailed: false, sql_query: null }],
      isStreaming: false,
    };
    (useChatStore as any).mockImplementation((selector: any) => selector(mockState));
    render(<LiveRegion />);
    expect(screen.getByTestId("live-region")).toHaveTextContent("");
  });

  it("does not announce when no messages exist", () => {
    const mockState = {
      messages: [],
      isStreaming: false,
    };
    (useChatStore as any).mockImplementation((selector: any) => selector(mockState));
    render(<LiveRegion />);
    expect(screen.getByTestId("live-region")).toHaveTextContent("");
  });
});
