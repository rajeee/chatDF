import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../helpers/render";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { useConnectionStore } from "@/stores/connectionStore";

describe("ConnectionBanner", () => {
  beforeEach(() => {
    useConnectionStore.getState().setStatus("connected");
  });

  it("does not render when connected", () => {
    renderWithProviders(<ConnectionBanner />);
    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
  });

  it("renders banner when disconnected", () => {
    useConnectionStore.getState().setStatus("disconnected");
    renderWithProviders(<ConnectionBanner />);

    const banner = screen.getByTestId("connection-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain("Connection lost");
  });

  it("renders banner when reconnecting", () => {
    useConnectionStore.getState().setStatus("reconnecting");
    renderWithProviders(<ConnectionBanner />);

    const banner = screen.getByTestId("connection-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain("Reconnecting");
  });

  it("shows reconnect button when disconnected", () => {
    useConnectionStore.getState().setStatus("disconnected");
    renderWithProviders(<ConnectionBanner />);

    const btn = screen.getByTestId("reconnect-btn");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("Reconnect");
  });

  it("does not show reconnect button when reconnecting", () => {
    useConnectionStore.getState().setStatus("reconnecting");
    renderWithProviders(<ConnectionBanner />);

    expect(screen.queryByTestId("reconnect-btn")).not.toBeInTheDocument();
  });

  it("has role alert for accessibility", () => {
    useConnectionStore.getState().setStatus("disconnected");
    renderWithProviders(<ConnectionBanner />);

    const banner = screen.getByTestId("connection-banner");
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("shows spinner animation when reconnecting", () => {
    useConnectionStore.getState().setStatus("reconnecting");
    renderWithProviders(<ConnectionBanner />);

    const banner = screen.getByTestId("connection-banner");
    const spinner = banner.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });
});
