// Tests: U30 — Keyboard-navigable prompt chips
//
// U30-KB-1: Arrow right moves focus to next chip
// U30-KB-2: Arrow left moves focus to previous chip
// U30-KB-3: Enter on focused chip triggers click handler
// U30-KB-4: Focus wraps from last to first (right)
// U30-KB-5: Focus wraps from first to last (left)
// U30-KB-6: Accessibility attributes (role, aria-selected)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent, act } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { SuggestedPrompts } from "@/components/chat-area/SuggestedPrompts";
import type { Dataset } from "@/stores/datasetStore";

const IRIS_DATASET: Dataset = {
  id: "ds-iris",
  conversation_id: "conv-1",
  url: "https://example.com/iris.parquet",
  name: "iris",
  row_count: 150,
  column_count: 5,
  schema_json:
    '[{"name":"sepal_length","type":"Float64"},{"name":"sepal_width","type":"Float64"},{"name":"petal_length","type":"Float64"},{"name":"petal_width","type":"Float64"},{"name":"species","type":"String"}]',
  status: "ready",
  error_message: null,
};

beforeEach(() => {
  resetAllStores();
  useChatStore.setState({ activeConversationId: "conv-1" });
});

describe("U30-KB-1: Arrow right moves focus to next chip", () => {
  it("moves focus from first chip to second on ArrowRight", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);

    // Focus the first chip
    options[0].focus();
    expect(options[0]).toHaveFocus();

    // Press arrow right
    await user.keyboard("{ArrowRight}");

    expect(options[1]).toHaveFocus();
  });

  it("moves focus sequentially through all chips on repeated ArrowRight", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    // Focus the first chip
    options[0].focus();

    // Press arrow right through all chips
    for (let i = 1; i < options.length; i++) {
      await user.keyboard("{ArrowRight}");
      expect(options[i]).toHaveFocus();
    }
  });
});

describe("U30-KB-2: Arrow left moves focus to previous chip", () => {
  it("moves focus from second chip to first on ArrowLeft", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);

    // Focus the second chip
    options[1].focus();
    expect(options[1]).toHaveFocus();

    // Press arrow left
    await user.keyboard("{ArrowLeft}");

    expect(options[0]).toHaveFocus();
  });
});

describe("U30-KB-3: Enter on focused chip triggers click handler", () => {
  it("calls onSendPrompt with the focused chip text when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    // Focus the first chip
    options[0].focus();

    // Press Enter
    await user.keyboard("{Enter}");

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).toHaveBeenCalledWith(options[0].textContent);
  });

  it("calls onSendPrompt with correct text after navigating to second chip", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    // Focus the first chip, then move to second
    options[0].focus();
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Enter}");

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).toHaveBeenCalledWith(options[1].textContent);
  });
});

describe("U30-KB-4: Focus wraps from last to first", () => {
  it("wraps focus from last chip to first on ArrowRight", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    const lastIndex = options.length - 1;

    // Focus the last chip
    options[lastIndex].focus();
    expect(options[lastIndex]).toHaveFocus();

    // Press arrow right — should wrap to first
    await user.keyboard("{ArrowRight}");

    expect(options[0]).toHaveFocus();
  });
});

describe("U30-KB-5: Focus wraps from first to last", () => {
  it("wraps focus from first chip to last on ArrowLeft", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    const lastIndex = options.length - 1;

    // Focus the first chip
    options[0].focus();
    expect(options[0]).toHaveFocus();

    // Press arrow left — should wrap to last
    await user.keyboard("{ArrowLeft}");

    expect(options[lastIndex]).toHaveFocus();
  });
});

describe("U30-KB-6: Accessibility attributes", () => {
  it("container has role=listbox", () => {
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const listbox = screen.getByRole("listbox", { name: /suggested prompts/i });
    expect(listbox).toBeInTheDocument();
  });

  it("each chip has role=option", () => {
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
  });

  it("focused chip has aria-selected=true, others have aria-selected=false", async () => {
    const user = userEvent.setup();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    // Initially no chip is aria-selected
    for (const opt of options) {
      expect(opt).toHaveAttribute("aria-selected", "false");
    }

    // Focus first chip (triggers onFocus -> state update)
    act(() => {
      options[0].focus();
    });

    // After focus, the first chip should be aria-selected
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Navigate to second
    await user.keyboard("{ArrowRight}");

    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("first chip has tabIndex=0 by default for tab entry", () => {
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[IRIS_DATASET]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    // First chip is the roving tabindex entry point
    expect(options[0]).toHaveAttribute("tabindex", "0");
    // Others should be -1
    for (let i = 1; i < options.length; i++) {
      expect(options[i]).toHaveAttribute("tabindex", "-1");
    }
  });
});
