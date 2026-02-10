// Tests for FollowupSuggestions component.
//
// FS-EMPTY-1: Renders nothing when suggestions array is empty
// FS-EMPTY-2: Renders nothing when suggestions exist but isStreaming is true
// FS-RENDER-1: Renders suggestion chips when suggestions are provided
// FS-RENDER-2: Each chip displays its suggestion text
// FS-CLICK-1: Clicking a chip calls onSendPrompt with the suggestion text
// FS-CLICK-2: Clicking a chip clears the suggestions in the store
// FS-TESTID-1: Container has data-testid="followup-suggestions"
// FS-TESTID-2: Each chip has data-testid="followup-{index}"

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, act } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { FollowupSuggestions } from "@/components/chat-area/FollowupSuggestions";

beforeEach(() => {
  resetAllStores();
});

describe("FS-EMPTY: Empty / hidden states", () => {
  it("renders nothing when suggestions array is empty", () => {
    useChatStore.setState({ followupSuggestions: [], isStreaming: false });
    const onSendPrompt = vi.fn();

    const { container } = renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when isStreaming is true even with suggestions", () => {
    useChatStore.setState({
      followupSuggestions: ["What is the average?", "Show top 10"],
      isStreaming: true,
    });
    const onSendPrompt = vi.fn();

    const { container } = renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    expect(container.innerHTML).toBe("");
  });
});

describe("FS-RENDER: Rendering suggestion chips", () => {
  it("renders all suggestion chips when suggestions are provided", () => {
    const suggestions = ["What is the average?", "Show top 10", "Count rows"];
    useChatStore.setState({ followupSuggestions: suggestions, isStreaming: false });
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    expect(screen.getByTestId("followup-suggestions")).toBeInTheDocument();
    for (const suggestion of suggestions) {
      expect(screen.getByText(suggestion)).toBeInTheDocument();
    }
  });

  it("each chip has the correct data-testid attribute", () => {
    const suggestions = ["Question A", "Question B"];
    useChatStore.setState({ followupSuggestions: suggestions, isStreaming: false });
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    expect(screen.getByTestId("followup-0")).toHaveTextContent("Question A");
    expect(screen.getByTestId("followup-1")).toHaveTextContent("Question B");
  });
});

describe("FS-CLICK: Click interactions", () => {
  it("calls onSendPrompt with the clicked suggestion text", async () => {
    const suggestions = ["What is the average?", "Show top 10"];
    useChatStore.setState({ followupSuggestions: suggestions, isStreaming: false });
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    const chip = screen.getByTestId("followup-1");
    act(() => {
      chip.click();
    });

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).toHaveBeenCalledWith("Show top 10");
  });

  it("clears suggestions in the store after clicking a chip", () => {
    const suggestions = ["What is the average?", "Show top 10"];
    useChatStore.setState({ followupSuggestions: suggestions, isStreaming: false });
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    act(() => {
      screen.getByTestId("followup-0").click();
    });

    expect(useChatStore.getState().followupSuggestions).toEqual([]);
  });

  it("renders as buttons so they are keyboard-accessible", () => {
    const suggestions = ["Question A"];
    useChatStore.setState({ followupSuggestions: suggestions, isStreaming: false });
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <FollowupSuggestions onSendPrompt={onSendPrompt} />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0]).toHaveTextContent("Question A");
  });
});
