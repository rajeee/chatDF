import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatHistory } from "@/components/left-panel/ChatHistory";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiGet } from "@/api/client";

vi.mock("@/stores/chatStore");
vi.mock("@/stores/uiStore");
vi.mock("@/stores/toastStore");
vi.mock("@/api/client");

const mockConversations = [
  { id: "c1", title: "First", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), dataset_count: 0, message_count: 1, last_message_preview: null, is_pinned: false },
  { id: "c2", title: "Second", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), dataset_count: 0, message_count: 2, last_message_preview: null, is_pinned: false },
  { id: "c3", title: "Third", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), dataset_count: 0, message_count: 0, last_message_preview: null, is_pinned: false },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ChatHistory keyboard navigation", () => {
  let mockSetActiveConversation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetActiveConversation = vi.fn();
    vi.mocked(useChatStore).mockImplementation((selector: any) => {
      const state = { activeConversationId: null, setActiveConversation: mockSetActiveConversation };
      return selector(state);
    });
    vi.mocked(useUiStore).mockImplementation((selector: any) => {
      const state = { leftPanelOpen: true, toggleLeftPanel: vi.fn() };
      return selector(state);
    });
    vi.mocked(useToastStore).mockReturnValue({ success: vi.fn(), error: vi.fn() } as any);
    vi.mocked(apiGet).mockResolvedValue({ conversations: mockConversations });
  });

  it("should make the conversation list focusable with tabIndex", async () => {
    render(<ChatHistory />, { wrapper });
    const list = await screen.findByRole("listbox");
    expect(list).toHaveAttribute("tabindex", "0");
  });

  it("should move focus down with ArrowDown key", async () => {
    render(<ChatHistory />, { wrapper });
    const list = await screen.findByRole("listbox");
    fireEvent.focus(list);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const items = screen.getAllByTestId("conversation-item");
    expect(items[0].getAttribute("data-keyboard-focus")).toBe("true");
  });

  it("should move focus up with ArrowUp key", async () => {
    render(<ChatHistory />, { wrapper });
    const list = await screen.findByRole("listbox");
    fireEvent.focus(list);
    // Move down twice then up once — should be on first item
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    const items = screen.getAllByTestId("conversation-item");
    expect(items[0].getAttribute("data-keyboard-focus")).toBe("true");
  });

  it("should select conversation on Enter", async () => {
    render(<ChatHistory />, { wrapper });
    const list = await screen.findByRole("listbox");
    fireEvent.focus(list);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(mockSetActiveConversation).toHaveBeenCalledWith("c1");
  });

  it("should not go below last item", async () => {
    render(<ChatHistory />, { wrapper });
    const list = await screen.findByRole("listbox");
    fireEvent.focus(list);
    // Press down more times than items
    for (let i = 0; i < 10; i++) fireEvent.keyDown(list, { key: "ArrowDown" });
    const items = screen.getAllByTestId("conversation-item");
    // Last item should be focused
    expect(items[items.length - 1].getAttribute("data-keyboard-focus")).toBe("true");
  });
});
