// Tests for LoadingStates component — phase rendering, icon selection, timeout error.
//
// LS-ICON-1: Thinking phase renders ThinkingIcon (data-testid="loading-dots")
// LS-ICON-2: Executing phase renders ExecutingIcon (data-testid="loading-spinner")
// LS-ICON-3: Formatting phase renders FormattingIcon (data-testid="loading-spinner")
// LS-CONTAINER-1: Wrapper has data-testid="loading-states"
// LS-TIMEOUT-ERR: After 60s shows timeout error message
// LS-DELAYED-1: After 30s shows delayed message, then phase change resets it

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderWithProviders, screen, act } from "../../helpers/render";
import { LoadingStates } from "@/components/chat-area/LoadingStates";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LS-ICON: Icon per phase", () => {
  it("thinking phase renders lightbulb icon with loading-dots testid", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-dots")).toBeInTheDocument();
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("executing phase renders spinner icon with loading-spinner testid", () => {
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.getByText("Running query...")).toBeInTheDocument();
  });

  it("formatting phase renders spinner icon and preparing label", () => {
    renderWithProviders(
      <LoadingStates phase="formatting" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.getByText("Preparing response...")).toBeInTheDocument();
  });
});

describe("LS-CONTAINER: Wrapper element", () => {
  it("has data-testid loading-states", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-states")).toBeInTheDocument();
  });

  it("contains both the label pill and the phase progress bar", () => {
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    const container = screen.getByTestId("loading-states");
    expect(container).toContainElement(screen.getByTestId("phase-progress"));
    expect(container).toContainElement(screen.getByText("Running query..."));
  });
});

describe("LS-TIMEOUT-ERR: Timeout error at 60 seconds", () => {
  it("shows timeout error message after 60 seconds", () => {
    const startTime = Date.now();
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={startTime} />
    );

    expect(screen.queryByTestId("loading-timeout-error")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("loading-timeout-error")).toBeInTheDocument();
    expect(screen.getByText("Request timed out. Please try again.")).toBeInTheDocument();
    // The normal loading-states container should be gone
    expect(screen.queryByTestId("loading-states")).not.toBeInTheDocument();
  });
});

describe("LS-DELAYED: Delay warning resets on phase change", () => {
  it("shows delayed message at 30s then resets when phase advances", () => {
    const startTime = Date.now();
    const { rerender } = renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={startTime} />
    );

    // At 30s, delayed message appears
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Taking longer than expected...")).toBeInTheDocument();

    // Phase advances -- delayed state should reset
    rerender(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Running query...")).toBeInTheDocument();
    expect(screen.queryByText("Taking longer than expected...")).not.toBeInTheDocument();
  });
});
