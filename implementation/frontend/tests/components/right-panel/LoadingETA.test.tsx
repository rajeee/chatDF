// Tests for LoadingETA component
// Verifies elapsed time display and reassuring messages at thresholds.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useDatasetStore } from "@/stores/datasetStore";
import { LoadingETA } from "@/components/right-panel/LoadingETA";

beforeEach(() => {
  vi.useFakeTimers();
  useDatasetStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoadingETA: elapsed time display", () => {
  it("shows elapsed time in seconds", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    expect(screen.getByTestId("loading-eta")).toHaveTextContent("Loading... 0s");
  });

  it("increments elapsed time each second", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    expect(screen.getByTestId("loading-eta")).toHaveTextContent("Loading... 0s");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("loading-eta")).toHaveTextContent("Loading... 3s");
  });

  it("formats time with minutes after 60 seconds", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    act(() => {
      vi.advanceTimersByTime(75_000);
    });

    expect(screen.getByTestId("loading-eta")).toHaveTextContent("Loading... 1m 15s");
  });
});

describe("LoadingETA: reassuring messages at thresholds", () => {
  it("shows no message before 5 seconds", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId("loading-eta-message")).not.toBeInTheDocument();
  });

  it("shows 'Large datasets may take a moment' after 5 seconds", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByTestId("loading-eta-message")).toHaveTextContent(
      "Large datasets may take a moment"
    );
  });

  it("shows 'Still working...' after 30 seconds", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    act(() => {
      vi.advanceTimersByTime(35_000);
    });

    expect(screen.getByTestId("loading-eta-message")).toHaveTextContent(
      "Still working..."
    );
  });

  it("shows 'This is taking longer than usual' after 60 seconds", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    act(() => {
      vi.advanceTimersByTime(75_000);
    });

    expect(screen.getByTestId("loading-eta-message")).toHaveTextContent(
      "This is taking longer than usual"
    );
  });
});

describe("LoadingETA: cleanup and edge cases", () => {
  it("cleans up interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    const { unmount } = render(<LoadingETA datasetId="ds-1" />);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("renders nothing when no loading start time exists", () => {
    // No loadingStartTimes set for this dataset
    render(<LoadingETA datasetId="ds-nonexistent" />);

    expect(screen.queryByTestId("loading-eta")).not.toBeInTheDocument();
  });

  it("uses text-xs class for small font size", () => {
    const now = Date.now();
    useDatasetStore.setState({
      loadingStartTimes: { "ds-1": now },
    });

    render(<LoadingETA datasetId="ds-1" />);

    expect(screen.getByTestId("loading-eta")).toHaveClass("text-xs");
  });
});
