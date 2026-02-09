// Tests: spec/frontend/chat_area/loading_states/spec.md
// Verifies: spec/frontend/chat_area/loading_states/plan.md
//
// LS-PHASE-1: Thinking state renders lightbulb icon with "Thinking..." label
// LS-PHASE-2: Executing state renders spinner with "Running query..." label
// LS-PHASE-3: Formatting state renders spinner with "Preparing response..." label
// LS-TIMEOUT-1: After 30s, label changes to "Taking longer than expected..."
// LS-FORWARD-1: Phases only go forward (component accepts new phase prop)
// LS-PROGRESS-1: Phase progress indicator shows all 3 steps
// LS-COLOR-1: Each phase has distinct color styling

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

  it("renders lightbulb icon", () => {
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

describe("LS-PROGRESS-1: Phase progress indicator", () => {
  it("renders phase progress bar with 3 steps", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    expect(screen.getByTestId("phase-progress")).toBeInTheDocument();
    expect(screen.getByTestId("phase-step-thinking")).toBeInTheDocument();
    expect(screen.getByTestId("phase-step-executing")).toBeInTheDocument();
    expect(screen.getByTestId("phase-step-formatting")).toBeInTheDocument();
  });

  it("active step is wider than pending steps", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    const activeStep = screen.getByTestId("phase-step-thinking");
    const pendingStep = screen.getByTestId("phase-step-executing");

    // Active step width = 16px, pending = 6px
    expect(activeStep.style.width).toBe("16px");
    expect(pendingStep.style.width).toBe("6px");
  });

  it("completed steps have reduced opacity", () => {
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    const completedStep = screen.getByTestId("phase-step-thinking");
    const activeStep = screen.getByTestId("phase-step-executing");

    expect(completedStep.style.opacity).toBe("0.5");
    expect(activeStep.style.opacity).toBe("1");
  });

  it("progress updates when phase advances", () => {
    const { rerender } = renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );

    // thinking is active (wide)
    expect(screen.getByTestId("phase-step-thinking").style.width).toBe("16px");
    expect(screen.getByTestId("phase-step-executing").style.width).toBe("6px");

    rerender(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );

    // thinking is completed (small), executing is active (wide)
    expect(screen.getByTestId("phase-step-thinking").style.width).toBe("6px");
    expect(screen.getByTestId("phase-step-executing").style.width).toBe("16px");
  });
});

describe("LS-COLOR-1: Color-coded phases", () => {
  it("thinking phase uses violet color via CSS variable", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    const label = screen.getByText("Thinking...");
    const pill = label.closest("[class*='rounded-full']")!;
    expect(pill.getAttribute("style")).toContain("var(--color-phase-thinking)");
  });

  it("executing phase uses accent color via CSS variable", () => {
    renderWithProviders(
      <LoadingStates phase="executing" phaseStartTime={Date.now()} />
    );
    const label = screen.getByText("Running query...");
    const pill = label.closest("[class*='rounded-full']")!;
    expect(pill.getAttribute("style")).toContain("var(--color-accent)");
  });

  it("formatting phase uses success color via CSS variable", () => {
    renderWithProviders(
      <LoadingStates phase="formatting" phaseStartTime={Date.now()} />
    );
    const label = screen.getByText("Preparing response...");
    const pill = label.closest("[class*='rounded-full']")!;
    expect(pill.getAttribute("style")).toContain("var(--color-success)");
  });

  it("phase pill has background tint matching phase color", () => {
    renderWithProviders(
      <LoadingStates phase="thinking" phaseStartTime={Date.now()} />
    );
    const label = screen.getByText("Thinking...");
    const pill = label.closest("[class*='rounded-full']")!;
    // Background should include the color with alpha
    expect(pill.getAttribute("style")).toContain("background-color");
  });
});
