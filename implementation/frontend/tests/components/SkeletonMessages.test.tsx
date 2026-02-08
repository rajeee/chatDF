import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../helpers/render";
import { SkeletonMessages } from "@/components/chat-area/SkeletonMessages";
import { useChatStore } from "@/stores/chatStore";

describe("SkeletonMessages", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("renders skeleton message placeholders", () => {
    renderWithProviders(<SkeletonMessages />);

    const container = screen.getByTestId("skeleton-messages");
    expect(container).toBeInTheDocument();
  });

  it("has proper ARIA attributes for accessibility", () => {
    renderWithProviders(<SkeletonMessages />);

    const container = screen.getByTestId("skeleton-messages");
    expect(container).toHaveAttribute("role", "status");
    expect(container).toHaveAttribute("aria-label", "Loading messages");
  });

  it("renders pulse animation elements", () => {
    renderWithProviders(<SkeletonMessages />);

    const container = screen.getByTestId("skeleton-messages");
    const pulsingElements = container.querySelectorAll(".animate-pulse");
    expect(pulsingElements.length).toBeGreaterThanOrEqual(2);
  });

  it("renders both user and assistant skeleton bubbles", () => {
    renderWithProviders(<SkeletonMessages />);

    const container = screen.getByTestId("skeleton-messages");
    // User messages are right-aligned (items-end)
    const userSkeletons = container.querySelectorAll(".items-end");
    // Assistant messages are left-aligned (items-start)
    const assistantSkeletons = container.querySelectorAll(".items-start");

    expect(userSkeletons.length).toBeGreaterThanOrEqual(1);
    expect(assistantSkeletons.length).toBeGreaterThanOrEqual(1);
  });
});
