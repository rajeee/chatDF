import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { Header } from "@/components/Header";
import { useConnectionStore } from "@/stores/connectionStore";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";

beforeEach(() => {
  resetAllStores();
  // Default to connected so tests that don't care about connection status
  // get a clean baseline.
  useConnectionStore.setState({ status: "connected" });
});

// ---------------------------------------------------------------------------
// Rendering basics
// ---------------------------------------------------------------------------
describe("Header rendering", () => {
  it("renders the header element", () => {
    renderWithProviders(<Header />);
    expect(screen.getByTestId("header")).toBeInTheDocument();
  });

  it("renders the app title 'ChatDF'", () => {
    renderWithProviders(<Header />);
    expect(screen.getByText("ChatDF")).toBeInTheDocument();
  });

  it("renders the app title as a semibold text element", () => {
    renderWithProviders(<Header />);
    const title = screen.getByText("ChatDF");
    expect(title.className).toContain("font-semibold");
  });

  it("renders the connection status element", () => {
    renderWithProviders(<Header />);
    expect(screen.getByTestId("connection-status")).toBeInTheDocument();
  });

  it("renders the toggle-right-panel button", () => {
    renderWithProviders(<Header />);
    expect(screen.getByTestId("toggle-right-panel")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Connection status indicator
// ---------------------------------------------------------------------------
describe("Header connection status", () => {
  it("shows 'Connected' status when WebSocket is connected", () => {
    useConnectionStore.setState({ status: "connected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    expect(status).toHaveAttribute("aria-label", "Connection status: Connected");
    expect(status).toHaveAttribute("title", "Connected");
  });

  it("does not show visible label text when connected", () => {
    useConnectionStore.setState({ status: "connected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    // When connected, the label text is not rendered at all
    expect(status.textContent).not.toContain("Connected");
  });

  it("shows 'Disconnected' status when WebSocket is disconnected", () => {
    useConnectionStore.setState({ status: "disconnected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    expect(status).toHaveAttribute("aria-label", "Connection status: Disconnected");
    expect(status).toHaveAttribute("title", "Disconnected");
  });

  it("shows visible 'Disconnected' label text when disconnected", () => {
    useConnectionStore.setState({ status: "disconnected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    expect(status.textContent).toContain("Disconnected");
  });

  it("shows 'Reconnecting' status during reconnection", () => {
    useConnectionStore.setState({ status: "reconnecting" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    expect(status).toHaveAttribute("aria-label", "Connection status: Reconnecting");
    expect(status).toHaveAttribute("title", "Reconnecting");
  });

  it("shows visible 'Reconnecting' label text during reconnection", () => {
    useConnectionStore.setState({ status: "reconnecting" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    expect(status.textContent).toContain("Reconnecting");
  });

  it("has role='status' for accessibility", () => {
    renderWithProviders(<Header />);
    const status = screen.getByTestId("connection-status");
    expect(status).toHaveAttribute("role", "status");
  });

  it("has aria-live='polite' for screen reader announcements", () => {
    renderWithProviders(<Header />);
    const status = screen.getByTestId("connection-status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});

// ---------------------------------------------------------------------------
// Connection status dot styling
// ---------------------------------------------------------------------------
describe("Header connection status dot", () => {
  it("renders a green dot when connected", () => {
    useConnectionStore.setState({ status: "connected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.backgroundColor).toBe("var(--color-success)");
  });

  it("renders a red dot when disconnected", () => {
    useConnectionStore.setState({ status: "disconnected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.backgroundColor).toBe("var(--color-error)");
  });

  it("renders a yellow/warning dot when reconnecting", () => {
    useConnectionStore.setState({ status: "reconnecting" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.backgroundColor).toBe("var(--color-warning)");
  });

  it("applies animate-pulse class when reconnecting", () => {
    useConnectionStore.setState({ status: "reconnecting" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).className).toContain("animate-pulse");
  });

  it("does not apply animate-pulse class when connected", () => {
    useConnectionStore.setState({ status: "connected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).className).not.toContain("animate-pulse");
  });

  it("does not apply animate-pulse class when disconnected", () => {
    useConnectionStore.setState({ status: "disconnected" });
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).className).not.toContain("animate-pulse");
  });

  it("marks the dot as aria-hidden", () => {
    renderWithProviders(<Header />);

    const status = screen.getByTestId("connection-status");
    const dot = status.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mobile toggle button (datasets panel)
// ---------------------------------------------------------------------------
describe("Header toggle datasets panel button", () => {
  it("renders the toggle button", () => {
    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");
    expect(btn).toBeInTheDocument();
  });

  it("has the lg:hidden class for mobile-only visibility", () => {
    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");
    expect(btn.className).toContain("lg:hidden");
  });

  it("has accessible label 'Toggle datasets panel'", () => {
    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");
    expect(btn).toHaveAttribute("aria-label", "Toggle datasets panel");
  });

  it("has title 'Datasets'", () => {
    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");
    expect(btn).toHaveAttribute("title", "Datasets");
  });

  it("calls toggleRightPanel when clicked", async () => {
    const toggleSpy = vi.fn();
    useUiStore.setState({ toggleRightPanel: toggleSpy });

    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");

    const user = userEvent.setup();
    await user.click(btn);

    expect(toggleSpy).toHaveBeenCalledTimes(1);
  });

  it("calls toggleRightPanel on each click", async () => {
    const toggleSpy = vi.fn();
    useUiStore.setState({ toggleRightPanel: toggleSpy });

    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");

    const user = userEvent.setup();
    await user.click(btn);
    await user.click(btn);
    await user.click(btn);

    expect(toggleSpy).toHaveBeenCalledTimes(3);
  });

  it("contains an SVG icon", () => {
    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dataset count badge
// ---------------------------------------------------------------------------
describe("Header dataset count badge", () => {
  it("shows no badge when no datasets exist", () => {
    renderWithProviders(<Header />);
    expect(screen.queryByTestId("dataset-count-badge")).not.toBeInTheDocument();
  });

  it("shows no badge when readyDatasetCount is 0", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        {
          id: "d1",
          conversation_id: "conv-1",
          url: "http://a.com/a.parquet",
          name: "A",
          row_count: 0,
          column_count: 0,
          schema_json: "{}",
          status: "loading",
          error_message: null,
        },
      ],
    });

    renderWithProviders(<Header />);
    expect(screen.queryByTestId("dataset-count-badge")).not.toBeInTheDocument();
  });

  it("shows badge with count of 1 when one ready dataset exists", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        {
          id: "d1",
          conversation_id: "conv-1",
          url: "http://a.com/a.parquet",
          name: "A",
          row_count: 100,
          column_count: 5,
          schema_json: "{}",
          status: "ready",
          error_message: null,
        },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("1");
  });

  it("shows badge with count of 3 when three ready datasets exist", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-1", url: "http://b.com/b.parquet", name: "B", row_count: 200, column_count: 3, schema_json: "{}", status: "ready", error_message: null },
        { id: "d3", conversation_id: "conv-1", url: "http://c.com/c.parquet", name: "C", row_count: 300, column_count: 4, schema_json: "{}", status: "ready", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge.textContent).toBe("3");
  });

  it("does not count loading datasets in badge", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-1", url: "http://b.com/b.parquet", name: "B", row_count: 0, column_count: 0, schema_json: "{}", status: "loading", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge.textContent).toBe("1");
  });

  it("does not count error datasets in badge", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-1", url: "http://b.com/b.parquet", name: "B", row_count: 0, column_count: 0, schema_json: "{}", status: "error", error_message: "fail" },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge.textContent).toBe("1");
  });

  it("does not count datasets from other conversations", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-2", url: "http://b.com/b.parquet", name: "B", row_count: 200, column_count: 3, schema_json: "{}", status: "ready", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge.textContent).toBe("1");
  });

  it("shows no badge when no active conversation is set", () => {
    // No active conversation means filterDatasetsByConversation returns []
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    expect(screen.queryByTestId("dataset-count-badge")).not.toBeInTheDocument();
  });

  it("badge is positioned inside the toggle button", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    const btn = screen.getByTestId("toggle-right-panel");
    const badge = screen.getByTestId("dataset-count-badge");
    expect(btn.contains(badge)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Header structure / layout
// ---------------------------------------------------------------------------
describe("Header layout and structure", () => {
  it("is a <header> element", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.tagName).toBe("HEADER");
  });

  it("has sticky positioning class", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
  });

  it("has z-20 for stacking context", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.className).toContain("z-20");
  });

  it("has a fixed height of h-12", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.className).toContain("h-12");
  });

  it("uses flex layout with items-center and justify-between", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.className).toContain("flex");
    expect(header.className).toContain("items-center");
    expect(header.className).toContain("justify-between");
  });

  it("applies surface background color via inline style", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.style.backgroundColor).toBe("var(--color-surface)");
  });

  it("applies border color via inline style", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.style.borderColor).toBe("var(--color-border)");
  });

  it("applies box-shadow via inline style", () => {
    renderWithProviders(<Header />);
    const header = screen.getByTestId("header");
    expect(header.style.boxShadow).toBe("0 1px 2px var(--color-shadow)");
  });
});
