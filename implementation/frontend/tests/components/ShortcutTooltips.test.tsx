import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { server } from "../helpers/mocks/server";
import { LeftPanel } from "@/components/left-panel/LeftPanel";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => {
  resetAllStores();
});

describe("Keyboard shortcut hints in tooltips", () => {
  it("toggle left panel button shows shortcut hint when panel is collapsed", () => {
    useUiStore.setState({ leftPanelOpen: false });
    renderWithProviders(<LeftPanel />);

    const toggleBtn = screen.getByTestId("toggle-left-panel");
    expect(toggleBtn).toHaveAttribute("title", expect.stringContaining("\u2318"));
    expect(toggleBtn).toHaveAttribute("title", expect.stringContaining("Ctrl"));
    expect(toggleBtn).toHaveAttribute("title", expect.stringContaining("B"));
  });

  it("toggle left panel button shows shortcut hint when panel is expanded", async () => {
    useUiStore.setState({ leftPanelOpen: true });

    // Need to mock conversations API for ChatHistory inside LeftPanel
    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations: [] });
      })
    );

    renderWithProviders(<LeftPanel />);

    await waitFor(() => {
      const toggleBtn = screen.getByTestId("toggle-left-panel");
      expect(toggleBtn).toHaveAttribute("title", expect.stringContaining("\u2318"));
    });
  });

  it("new chat button has descriptive tooltip", async () => {
    useUiStore.setState({ leftPanelOpen: true });

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations: [] });
      })
    );

    renderWithProviders(<LeftPanel />);

    await waitFor(() => {
      const newChatBtn = screen.getByTestId("new-chat-button");
      expect(newChatBtn).toHaveAttribute("title", "New conversation");
    });
  });
});
