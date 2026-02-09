import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { ConversationTemplates } from "@/components/chat-area/ConversationTemplates";
import { getConversationTemplates } from "@/utils/conversationTemplates";

beforeEach(() => {
  resetAllStores();
});

describe("ConversationTemplates — template card rendering", () => {
  it("renders all 5 template cards", () => {
    const onSendMessage = vi.fn();
    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    const templates = getConversationTemplates();
    for (const template of templates) {
      const card = screen.getByTestId(`conversation-template-${template.id}`);
      expect(card).toBeInTheDocument();
    }
  });

  it("displays template name and description on each card", () => {
    const onSendMessage = vi.fn();
    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={2} />
    );

    const templates = getConversationTemplates();
    for (const template of templates) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
      expect(screen.getByText(template.description)).toBeInTheDocument();
    }
  });

  it("shows the container with data-testid", () => {
    const onSendMessage = vi.fn();
    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    expect(screen.getByTestId("conversation-templates")).toBeInTheDocument();
  });
});

describe("ConversationTemplates — clicking a template shows prompts", () => {
  it("shows suggested prompts when a template card is clicked", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    // Click the Quick Explore template
    const card = screen.getByTestId("conversation-template-quick-explore");
    await user.click(card);

    // Should show the prompt chips
    const chips = screen.getAllByTestId("template-prompt-chip");
    expect(chips.length).toBe(4);
    expect(chips[0]).toHaveTextContent("What columns does this dataset have and what do they mean?");
  });

  it("shows a back button after selecting a template", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    await user.click(screen.getByTestId("conversation-template-quick-explore"));

    const backBtn = screen.getByTestId("templates-back-btn");
    expect(backBtn).toBeInTheDocument();
    expect(backBtn).toHaveTextContent("All templates");
  });

  it("returns to template grid when back button is clicked", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    // Select a template
    await user.click(screen.getByTestId("conversation-template-quick-explore"));

    // Verify prompts are shown
    expect(screen.getAllByTestId("template-prompt-chip").length).toBeGreaterThan(0);

    // Click back
    await user.click(screen.getByTestId("templates-back-btn"));

    // Template cards should be visible again
    expect(screen.getByTestId("conversation-template-quick-explore")).toBeInTheDocument();
    expect(screen.queryAllByTestId("template-prompt-chip")).toHaveLength(0);
  });
});

describe("ConversationTemplates — clicking a prompt chip calls onSendMessage", () => {
  it("calls onSendMessage with the prompt text when a chip is clicked", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    // Select the Quick Explore template
    await user.click(screen.getByTestId("conversation-template-quick-explore"));

    // Click the first prompt chip
    const chips = screen.getAllByTestId("template-prompt-chip");
    await user.click(chips[0]);

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(
      "What columns does this dataset have and what do they mean?"
    );
  });

  it("calls onSendMessage only once per click", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    await user.click(screen.getByTestId("conversation-template-data-quality"));
    const chips = screen.getAllByTestId("template-prompt-chip");
    await user.click(chips[1]);

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith("Find duplicate rows if any");
  });
});

describe("ConversationTemplates — dataset requirement enforcement", () => {
  it("disables templates requiring more datasets than available", () => {
    const onSendMessage = vi.fn();

    // Only 1 dataset available, compare-datasets needs 2
    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    const compareCard = screen.getByTestId("conversation-template-compare-datasets");
    expect(compareCard).toBeDisabled();
  });

  it("enables templates when enough datasets are available", () => {
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={2} />
    );

    const compareCard = screen.getByTestId("conversation-template-compare-datasets");
    expect(compareCard).not.toBeDisabled();
  });

  it("does not show prompts when clicking a disabled template", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    const compareCard = screen.getByTestId("conversation-template-compare-datasets");
    await user.click(compareCard);

    // Should still see template cards, not prompts
    expect(screen.queryAllByTestId("template-prompt-chip")).toHaveLength(0);
    expect(screen.getByTestId("conversation-template-quick-explore")).toBeInTheDocument();
  });

  it("shows dataset requirement badge on templates needing multiple datasets", () => {
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    const badge = screen.getByTestId("template-badge-compare-datasets");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("2+ datasets");
  });

  it("single-dataset templates do not show a dataset badge", () => {
    const onSendMessage = vi.fn();

    renderWithProviders(
      <ConversationTemplates onSendMessage={onSendMessage} datasetCount={1} />
    );

    expect(screen.queryByTestId("template-badge-quick-explore")).not.toBeInTheDocument();
    expect(screen.queryByTestId("template-badge-time-series")).not.toBeInTheDocument();
    expect(screen.queryByTestId("template-badge-data-quality")).not.toBeInTheDocument();
    expect(screen.queryByTestId("template-badge-distribution")).not.toBeInTheDocument();
  });
});
