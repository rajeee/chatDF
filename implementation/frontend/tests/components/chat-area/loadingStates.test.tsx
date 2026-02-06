// Tests: spec/frontend/chat_area/loading_states/spec.md
// Verifies: spec/frontend/chat_area/loading_states/plan.md
//
// LS-PHASE-1: Thinking state renders animated dots with "Thinking..." label
// LS-PHASE-2: Executing state renders spinner with "Running query..." label
// LS-PHASE-3: Formatting state renders spinner with "Preparing response..." label
// LS-TIMEOUT-1: After 30s, label changes to "Taking longer than expected..."
// LS-FORWARD-1: Phases only go forward (component accepts new phase prop)

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderWithProviders, screen, act } from "../../helpers/render";
import { LoadingStates } from "@/components/chat-area/LoadingStates";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LS-PHASE-1: Thinking state", () => {
  it("renders 'Thinking...' label", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("renders animated dots container", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-dots")).toBeInTheDocument();
  });
});

describe("LS-PHASE-2: Executing state", () => {
  it("renders 'Running query...' label", () => {
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Running query...")).toBeInTheDocument();
  });

  it("renders spinner element", () => {
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });
});

describe("LS-PHASE-3: Formatting state", () => {
  it("renders 'Preparing response...' label", () => {
    renderWithProviders(
      <LoadingStates phase="formatting" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Preparing response...")).toBeInTheDocument();
  });

  it("renders spinner element", () => {
    renderWithProviders(
      <LoadingStates phase="formatting" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });
});

describe("LS-TIMEOUT-1: 30s warning", () => {
  it("shows 'Taking longer than expected...' after 30 seconds", () => {
    const startTime = Date.now();
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={startTime} />
    );

    // Initially shows normal label
    expect(screen.getByText("Thinking...")).toBeInTheDocument();

    // Advance time by 30 seconds
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(
      screen.getByText("Taking longer than expected...")
    ).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("shows error state after 60 seconds", () => {
    const startTime = Date.now();
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={startTime} />
    );

    // Advance time by 60 seconds
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("loading-timeout-error")).toBeInTheDocument();
  });
});

describe("LS-FORWARD-1: Forward-only phase transitions", () => {
  it("updates display when phase advances from thinking to executing", () => {
    const { rerender } = renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Thinking...")).toBeInTheDocument();

    rerender(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Running query...")).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("updates display when phase advances from executing to formatting", () => {
    const { rerender } = renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Running query...")).toBeInTheDocument();

    rerender(
      <LoadingStates phase="formatting" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Preparing response...")).toBeInTheDocument();
    expect(screen.queryByText("Running query...")).not.toBeInTheDocument();
  });

  it("resets delayed state when phase advances", () => {
    const startTime = Date.now();
    const { rerender } = renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={startTime} />
    );

    // Trigger delayed state
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(
      screen.getByText("Taking longer than expected...")
    ).toBeInTheDocument();

    // Advance to next phase with fresh start time
    rerender(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    expect(screen.getByText("Running query...")).toBeInTheDocument();
    expect(
      screen.queryByText("Taking longer than expected...")
    ).not.toBeInTheDocument();
  });
});
